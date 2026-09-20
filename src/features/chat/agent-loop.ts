import {
  requiresApproval,
  parseToolArguments,
  ToolExecutionError,
  toolError,
  validToolName,
  type StoredToolCall,
  type ToolActivity,
  type ToolCall,
  type ToolCallUpdate,
  type ToolDefinition,
  type ToolExchange,
  type ToolPolicy,
  type ToolRegistry,
  type ToolResult,
} from '../../domain/tool';
import { createAppError } from '../../domain/error';
import type { EndpointProfile } from '../../domain/endpoint';
import { recordDiagnostic } from '../../services/diagnostics/diagnostic-ring';
import type {
  ResponseStreamEvent,
  SendResponseInput,
  SendResponseResult,
  StreamToolCall,
  Transport,
} from '../../services/transport/contract';

export const MAX_TOOL_ROUNDS = 8;
export const MAX_PARALLEL_READ_ONLY_TOOLS = 3;
export const TOOL_TIMEOUT_MS = 10_000;
export const TOOL_OUTPUT_BYTE_CAP = 16 * 1024;
export const TOOL_LOOP_TIMEOUT_MS = 60_000;

export type ToolCallPersistence = {
  recordToolCall: (input: StoredToolCall) => Promise<ToolActivity>;
  updateToolCall: (input: ToolCallUpdate) => Promise<ToolActivity>;
};

export type AgentLoopInput = {
  profile: EndpointProfile;
  apiKey: string;
  turnId: string;
  request: SendResponseInput;
  transport: Transport;
  registry: ToolRegistry;
  definitions: ToolDefinition[];
  policy: ToolPolicy;
  persistence?: ToolCallPersistence;
  signal?: AbortSignal;
  onEvent?: (event: ResponseStreamEvent) => void;
  onProgress?: (activity: ToolActivity) => void;
  requestApproval: (activity: ToolActivity, signal: AbortSignal) => Promise<boolean>;
  now?: () => number;
};

let sequence = 0;

export async function runAgentLoop(input: AgentLoopInput): Promise<SendResponseResult> {
  const controller = new AbortController();
  const startedAt = (input.now ?? Date.now)();
  let timedOut = false;
  const abort = () => controller.abort();
  input.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TOOL_LOOP_TIMEOUT_MS);
  const exchanges = [...(input.request.toolExchanges ?? [])];
  let latest: Extract<SendResponseResult, { ok: true }> | null = null;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const result = await input.transport.send(
        input.profile,
        input.apiKey,
        { ...input.request, tools: input.definitions, toolExchanges: exchanges },
        { signal: controller.signal, onEvent: input.onEvent },
      );
      if (!result.ok) {
        return timedOut ? loopFailure(result, input.profile, input.request.modelId, 'Tool loop timed out.', 'timeout') : result;
      }
      latest = result;
      if (result.response.toolCalls.length === 0) {
        return result;
      }
      if (round === MAX_TOOL_ROUNDS - 1) {
        return loopFailure(result, input.profile, input.request.modelId, 'Tool loop reached its 8 round limit.', 'request');
      }
      const exchange = await executeRound(result.response.toolCalls, round, input, controller.signal);
      if (controller.signal.aborted) {
        return loopFailure(
          result,
          input.profile,
          input.request.modelId,
          timedOut ? 'Tool loop timed out.' : 'The request was stopped.',
          timedOut ? 'timeout' : 'cancelled',
        );
      }
      exchanges.push(exchange);
      if ((input.now ?? Date.now)() - startedAt >= TOOL_LOOP_TIMEOUT_MS) {
        return loopFailure(result, input.profile, input.request.modelId, 'Tool loop timed out.', 'timeout');
      }
    }
    return latest ?? impossibleFailure(input.profile, input.request.modelId);
  } finally {
    clearTimeout(timeout);
    input.signal?.removeEventListener('abort', abort);
  }
}

async function executeRound(
  streamed: StreamToolCall[],
  round: number,
  input: AgentLoopInput,
  signal: AbortSignal,
): Promise<ToolExchange> {
  const calls = streamed.map((call, index) => toToolCall(call, round, index));
  const results: ToolResult[] = Array.from({ length: calls.length });
  const pending: {
    index: number;
    activity: ToolActivity;
    definition: NonNullable<ReturnType<ToolRegistry['find']>>;
    argumentsValue: Record<string, unknown>;
  }[] = [];
  const enabled = new Set(input.definitions.map((definition) => definition.name));

  for (const [index, call] of calls.entries()) {
    const definition = validToolName(call.name) && enabled.has(call.name)
      ? input.registry.find(call.name)
      : null;
    let activity: ToolActivity = {
      id: newToolId(),
      callId: call.callId,
      name: call.name,
      argumentsJson: call.argumentsJson,
      target: definition?.target ?? 'Unknown tool',
      sideEffect: definition?.sideEffect ?? 'No action is allowed.',
      status: 'awaiting_approval',
      approval: 'pending',
      result: null,
    };
    activity = await record(activity, input);
    if (activity.result !== null) {
      input.onProgress?.(activity);
      results[index] = activity.result;
      continue;
    }
    if (activity.status !== 'awaiting_approval') {
      results[index] = await complete(
        activity,
        toolError(call.callId, 'This tool call will not be repeated after interruption.'),
        'interrupted',
        activity.approval,
        input,
      );
      continue;
    }
    if (definition === null) {
      results[index] = await complete(
        activity,
        toolError(call.callId, 'Unknown or disabled tool.'),
        'failed',
        'not_required',
        input,
      );
      continue;
    }
    const parsed = parseToolArguments(call.argumentsJson);
    if (!parsed.ok) {
      results[index] = await complete(
        activity,
        toolError(call.callId, parsed.message),
        'failed',
        'not_required',
        input,
      );
      continue;
    }
    if (requiresApproval(definition, input.policy)) {
      input.onProgress?.(activity);
      const approved = await input.requestApproval(activity, signal);
      if (signal.aborted) {
        results[index] = await complete(
          activity,
          toolError(call.callId, 'Tool execution was cancelled.'),
          'cancelled',
          'rejected',
          input,
        );
        continue;
      }
      if (!approved) {
        results[index] = await complete(
          activity,
          toolError(call.callId, 'The user rejected this tool call.'),
          'rejected',
          'rejected',
          input,
        );
        continue;
      }
      activity = await update(activity, { status: 'executing', approval: 'approved', result: null }, input);
    } else {
      activity = await update(activity, { status: 'executing', approval: 'not_required', result: null }, input);
    }
    pending.push({ index, activity, definition, argumentsValue: parsed.value });
  }

  while (pending.length > 0) {
    const first = pending.shift();
    if (first === undefined) {
      break;
    }
    const batch = [first];
    if (first.definition?.risk === 'read-only') {
      while (
        batch.length < MAX_PARALLEL_READ_ONLY_TOOLS &&
        pending[0]?.definition?.risk === 'read-only'
      ) {
        const next = pending.shift();
        if (next !== undefined) {
          batch.push(next);
        }
      }
    }
    const completed = await Promise.all(
      batch.map(async (entry) => ({
        index: entry.index,
        result: await executeTool(entry.activity, entry.definition, entry.argumentsValue, input, signal),
      })),
    );
    for (const entry of completed) {
      results[entry.index] = entry.result;
    }
  }

  return { calls, results };
}

function toToolCall(call: StreamToolCall, round: number, index: number): ToolCall {
  return {
    callId: call.callId ?? call.itemId ?? `missing_call_${String(round)}_${String(index)}`,
    name: call.name ?? '',
    argumentsJson: call.arguments,
  };
}

async function executeTool(
  activity: ToolActivity,
  definition: NonNullable<ReturnType<ToolRegistry['find']>>,
  argumentsValue: Record<string, unknown>,
  input: AgentLoopInput,
  signal: AbortSignal,
): Promise<ToolResult> {
  const outcome = await executeWithTimeout(definition, argumentsValue, signal, definition.timeoutMs ?? TOOL_TIMEOUT_MS);
  if (outcome.kind === 'cancelled') {
    return complete(activity, toolError(activity.callId, 'Tool execution was cancelled.'), 'cancelled', activity.approval, input);
  }
  if (outcome.kind === 'timed_out') {
    return complete(activity, toolError(activity.callId, 'Tool execution timed out.'), 'timed_out', activity.approval, input);
  }
  if (outcome.kind === 'failed') {
    return complete(activity, toolError(activity.callId, outcome.message), 'failed', activity.approval, input);
  }
  if (new TextEncoder().encode(outcome.output).byteLength > TOOL_OUTPUT_BYTE_CAP) {
    return complete(
      activity,
      toolError(activity.callId, 'Tool output exceeded the 16 KB safety limit.'),
      'failed',
      activity.approval,
      input,
    );
  }
  return complete(activity, { callId: activity.callId, output: outcome.output, isError: false }, 'completed', activity.approval, input);
}

async function executeWithTimeout(
  definition: NonNullable<ReturnType<ToolRegistry['find']>>,
  argumentsValue: Record<string, unknown>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<
  | { kind: 'completed'; output: string }
  | { kind: 'failed'; message: string }
  | { kind: 'timed_out' }
  | { kind: 'cancelled' }
> {
  if (signal.aborted) {
    return { kind: 'cancelled' };
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const execution = definition
      .execute(argumentsValue, controller.signal)
      .then((output) => ({ kind: 'completed' as const, output }))
      .catch((error: unknown) => ({
        kind: 'failed' as const,
        message: error instanceof ToolExecutionError ? error.message : 'Tool execution failed.',
      }));
    const timeout = new Promise<{ kind: 'timed_out' }>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ kind: 'timed_out' });
      }, timeoutMs);
    });
    const outcome = await Promise.race([execution, timeout]);
    return signal.aborted ? { kind: 'cancelled' } : outcome;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
    signal.removeEventListener('abort', abort);
  }
}

async function record(activity: ToolActivity, input: AgentLoopInput): Promise<ToolActivity> {
  const saved = input.persistence === undefined
    ? activity
    : await input.persistence.recordToolCall({ ...activity, turnId: input.turnId });
  input.onProgress?.(saved);
  return saved;
}

async function update(
  activity: ToolActivity,
  patch: Omit<ToolCallUpdate, 'id'>,
  input: AgentLoopInput,
): Promise<ToolActivity> {
  const next = { ...activity, ...patch };
  const saved = input.persistence === undefined ? next : await input.persistence.updateToolCall(next);
  input.onProgress?.(saved);
  return saved;
}

async function complete(
  activity: ToolActivity,
  result: ToolResult,
  status: ToolActivity['status'],
  approval: ToolActivity['approval'],
  input: AgentLoopInput,
): Promise<ToolResult> {
  await update(activity, { status, approval, result }, input);
  if (status === 'failed' || status === 'timed_out' || status === 'interrupted') {
    void recordDiagnostic({
      kind: 'tool-failed',
      endpointId: input.profile.id,
      modelId: input.request.modelId,
      toolName: input.registry.find(activity.name)?.name ?? null,
      attempt: 1,
      httpStatus: null,
      errorCategory: `tool-${status}`,
      errorDetail: null,
      providerCode: null,
      requestId: activity.callId,
    });
  }
  return result;
}

function loopFailure(
  result: Extract<SendResponseResult, { ok: true }> | Extract<SendResponseResult, { ok: false }>,
  profile: EndpointProfile,
  modelId: string,
  message: string,
  category: 'cancelled' | 'request' | 'timeout',
): SendResponseResult {
  if (category !== 'cancelled') {
    void recordDiagnostic({
      kind: 'agent-loop-failed',
      endpointId: profile.id,
      modelId,
      toolName: null,
      attempt: result.attempts,
      httpStatus: null,
      errorCategory: category,
      errorDetail: message,
      providerCode: null,
      requestId: null,
    });
  }
  const response = result.ok ? result.response : result.partial;
  return {
    ok: false,
    error: createAppError({
      category,
      message,
      httpStatus: null,
      providerCode: null,
      requestId: null,
      retryable: false,
      safeDetails: { endpointId: profile.id },
    }),
    cancelled: category === 'cancelled',
    hadModelEvent: true,
    partial: response,
    timing: result.timing,
    diagnostics: result.diagnostics,
    attempts: result.attempts,
  };
}

function impossibleFailure(profile: EndpointProfile, modelId: string): SendResponseResult {
  void recordDiagnostic({
    kind: 'agent-loop-failed',
    endpointId: profile.id,
    modelId,
    toolName: null,
    attempt: 0,
    httpStatus: null,
    errorCategory: 'unknown',
    errorDetail: 'Tool loop ended without a model response.',
    providerCode: null,
    requestId: null,
  });
  return {
    ok: false,
    error: createAppError({
      category: 'unknown',
      message: 'Tool loop ended without a model response.',
      httpStatus: null,
      providerCode: null,
      requestId: null,
      retryable: false,
      safeDetails: { endpointId: profile.id },
    }),
    cancelled: false,
    hadModelEvent: false,
    partial: { id: null, text: null, reasoningSummary: null, toolCalls: [] },
    timing: { requestStart: performance.now(), firstEvent: null, firstVisibleToken: null, completed: performance.now() },
    diagnostics: [],
    attempts: 0,
  };
}

function newToolId(): string {
  sequence += 1;
  return `tool_${Date.now().toString(36)}_${sequence.toString(36)}`;
}
