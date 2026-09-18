import { fetch as expoFetch } from 'expo/fetch';

import type { ConversationInputMessage } from '../../domain/conversation';
import {
  buildAuthHeaders,
  buildCustomHeaders,
  joinEndpointPath,
  type EndpointProfile,
} from '../../domain/endpoint';
import {
  createAppError,
  bodyTooLargeError,
  fromHttpResponse,
  fromNetworkError,
  parseProviderErrorBody,
  redactText,
  type AppError,
} from '../../domain/error';
import { createSseParser, type SseFrame } from '../../domain/sse';
import { buildSystemPrompt } from '../../domain/system-prompt';
import { readResponseText } from './body';

export const RESPONSE_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 250;
const MAX_ATTEMPTS = 2;
const MAX_RETRY_AFTER_MS = 60_000;

export type SendResponseInput = {
  modelId: string;
  prompt: string;
  history?: ConversationInputMessage[];
  previousResponseId: string | null;
  promptCacheKey: string | null;
  maxOutputTokens: number | null;
  reasoningEffort: string | null;
};

export type StreamTiming = {
  requestStart: number;
  firstEvent: number | null;
  firstVisibleToken: number | null;
  completed: number | null;
};

export type StreamToolCall = {
  itemId: string | null;
  callId: string | null;
  name: string | null;
  arguments: string;
};

export type StreamResponse = {
  id: string;
  text: string | null;
  reasoningSummary: string | null;
  toolCalls: StreamToolCall[];
  usage: Record<string, unknown> | null;
};

export type PartialStreamResponse = Omit<StreamResponse, 'id' | 'usage'> & {
  id: string | null;
};

export type StreamDiagnostic = {
  kind: 'unknown-event' | 'invalid-event';
  eventType: string | null;
};

export type ResponseStreamEvent =
  | { type: 'request.started'; at: number }
  | { type: 'response.created'; at: number; responseId: string | null }
  | { type: 'reasoning.delta'; at: number; delta: string }
  | { type: 'text.delta'; at: number; delta: string }
  | { type: 'tool_call.started'; at: number; toolCall: StreamToolCall }
  | { type: 'tool_call.arguments.delta'; at: number; callId: string | null; delta: string }
  | { type: 'tool_call.completed'; at: number; toolCall: StreamToolCall }
  | { type: 'usage.updated'; at: number; usage: Record<string, unknown> }
  | { type: 'response.completed'; at: number; responseId: string }
  | { type: 'response.failed'; at: number; error: AppError }
  | { type: 'request.cancelled'; at: number };

export type SendResponseOptions = {
  signal?: AbortSignal;
  onEvent?: (event: ResponseStreamEvent) => void;
};

type AttemptMeta = {
  timing: StreamTiming;
  diagnostics: StreamDiagnostic[];
};

type SendResponseMeta = AttemptMeta & {
  attempts: number;
};

export type SendResponseResult =
  | ({ ok: true; response: StreamResponse } & SendResponseMeta)
  | ({
      ok: false;
      error: AppError;
      cancelled: boolean;
      hadModelEvent: boolean;
      partial: PartialStreamResponse;
    } & SendResponseMeta);

type AttemptResult =
  | ({ ok: true; response: StreamResponse } & AttemptMeta)
  | ({
      ok: false;
      error: AppError;
      cancelled: boolean;
      hadModelEvent: boolean;
      partial: PartialStreamResponse;
    } & AttemptMeta);

type ProviderState = {
  responseId: string | null;
  text: string;
  reasoning: string;
  toolCalls: Map<string, StreamToolCall>;
  usage: Record<string, unknown> | null;
  completed: boolean;
  failure: AppError | null;
  hadModelEvent: boolean;
};

export function responsesUrl(profile: EndpointProfile): string {
  return joinEndpointPath(profile.baseUrl, profile.compat.responsesPath);
}

export function buildResponsesBody(
  profile: EndpointProfile,
  input: SendResponseInput,
): Record<string, unknown> {
  const history = input.history ?? [{ role: 'user' as const, content: input.prompt }];
  const body: Record<string, unknown> = {
    model: input.modelId,
    input: [
      { role: 'system', content: buildSystemPrompt(input.modelId) },
      ...history,
    ],
    stream: true,
  };
  if (input.maxOutputTokens !== null) {
    body[profile.compat.responsesMaxTokensField] = input.maxOutputTokens;
  }
  if (
    input.reasoningEffort !== null &&
    (input.reasoningEffort !== 'auto' || profile.compat.autoReasoningBehavior === 'literal-auto')
  ) {
    body.reasoning = { effort: input.reasoningEffort };
  }
  if (input.previousResponseId !== null) {
    body.previous_response_id = input.previousResponseId;
  }
  if (input.promptCacheKey !== null) {
    body.prompt_cache_key = input.promptCacheKey;
  }
  return body;
}

async function send(
  profile: EndpointProfile,
  apiKey: string,
  input: SendResponseInput,
  options: SendResponseOptions = {},
): Promise<SendResponseResult> {
  let attempts = 0;
  let result: AttemptResult;
  do {
    attempts += 1;
    result = await sendAttempt(profile, apiKey, input, options);
    if (
      result.ok ||
      result.cancelled ||
      result.hadModelEvent ||
      !result.error.retryable ||
      attempts >= MAX_ATTEMPTS
    ) {
      return { ...result, attempts };
    }
    await wait(result.error.retryAfterMs ?? RETRY_DELAY_MS);
  } while (true);
}

async function sendAttempt(
  profile: EndpointProfile,
  apiKey: string,
  input: SendResponseInput,
  options: SendResponseOptions,
): Promise<AttemptResult> {
  const url = responsesUrl(profile);
  const safeDetails = { endpointId: profile.id, url };
  const timing: StreamTiming = {
    requestStart: performance.now(),
    firstEvent: null,
    firstVisibleToken: null,
    completed: null,
  };
  const diagnostics: StreamDiagnostic[] = [];
  const state: ProviderState = {
    responseId: null,
    text: '',
    reasoning: '',
    toolCalls: new Map(),
    usage: null,
    completed: false,
    failure: null,
    hadModelEvent: false,
  };
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, RESPONSE_TIMEOUT_MS);
  emit(options, { type: 'request.started', at: timing.requestStart });

  if (options.signal?.aborted) {
    controller.abort();
  }

  try {
    const response = await expoFetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...buildCustomHeaders(profile.headers),
        ...buildAuthHeaders(profile.authMode, apiKey),
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildResponsesBody(profile, input)),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await readResponseText(response);
      if (!body.ok) {
        return fail(bodyTooLargeError(safeDetails), false, state, timing, diagnostics, options);
      }
      const parsed = fromHttpResponse({ status: response.status, body: body.text, ...safeDetails });
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      const error = retryAfterMs === null ? parsed : { ...parsed, retryAfterMs };
      return fail(error, false, state, timing, diagnostics, options);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/event-stream')) {
      const body = await readResponseText(response);
      if (!body.ok) {
        return fail(bodyTooLargeError(safeDetails), false, state, timing, diagnostics, options);
      }
      return fail(
        schemaError('The endpoint did not return an SSE stream.', safeDetails),
        false,
        state,
        timing,
        diagnostics,
        options,
      );
    }
    if (response.body === null) {
      return fail(
        schemaError('The response stream has no body.', safeDetails),
        false,
        state,
        timing,
        diagnostics,
        options,
      );
    }

    const parser = createSseParser();
    const reader = response.body.getReader();
    try {
      while (!state.completed && state.failure === null) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        const parsed = parser.push(next.value);
        processParsed(parsed, state, timing, diagnostics, safeDetails, options);
        if (parsed.done) {
          break;
        }
      }
      if (!state.completed && state.failure === null) {
        processParsed(parser.finish(), state, timing, diagnostics, safeDetails, options);
      }
      if (state.completed || state.failure !== null) {
        await reader.cancel().catch(() => undefined);
      }
    } finally {
      reader.releaseLock();
    }

    if (state.failure !== null) {
      return fail(state.failure, false, state, timing, diagnostics, options, true);
    }
    if (!state.completed || state.responseId === null) {
      return fail(
        streamEndedError(safeDetails),
        false,
        state,
        timing,
        diagnostics,
        options,
      );
    }
    timing.completed ??= performance.now();
    return {
      ok: true,
      response: {
        id: state.responseId,
        text: state.text.length === 0 ? null : state.text,
        reasoningSummary: state.reasoning.length === 0 ? null : state.reasoning,
        toolCalls: [...state.toolCalls.values()],
        usage: state.usage,
      },
      timing,
      diagnostics,
    };
  } catch (cause) {
    const cancelled = options.signal?.aborted === true;
    const error = cancelled
      ? cancelledError(safeDetails)
      : timedOut
        ? fromNetworkError(
            new Error(`Request timeout after ${String(RESPONSE_TIMEOUT_MS)}ms`),
            safeDetails,
          )
        : fromNetworkError(cause, safeDetails);
    return fail(error, cancelled, state, timing, diagnostics, options);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

function processParsed(
  parsed: { frames: SseFrame[]; done: boolean },
  state: ProviderState,
  timing: StreamTiming,
  diagnostics: StreamDiagnostic[],
  safeDetails: Record<string, string>,
  options: SendResponseOptions,
): void {
  for (const frame of parsed.frames) {
    if (state.completed || state.failure !== null) {
      return;
    }
    const at = performance.now();
    timing.firstEvent ??= at;
    state.hadModelEvent = true;
    processFrame(frame, state, timing, diagnostics, safeDetails, options, at);
  }
}

function processFrame(
  frame: SseFrame,
  state: ProviderState,
  timing: StreamTiming,
  diagnostics: StreamDiagnostic[],
  safeDetails: Record<string, string>,
  options: SendResponseOptions,
  at: number,
): void {
  let payload: unknown;
  try {
    payload = JSON.parse(frame.data);
  } catch {
    diagnostics.push({ kind: 'invalid-event', eventType: safeEventType(frame.event) });
    state.failure = schemaError('The SSE event does not contain valid JSON.', safeDetails);
    emit(options, { type: 'response.failed', at, error: state.failure });
    return;
  }
  if (!isRecord(payload)) {
    diagnostics.push({ kind: 'invalid-event', eventType: safeEventType(frame.event) });
    return;
  }
  const type = stringValue(payload.type) ?? frame.event;
  switch (type) {
    case 'response.created': {
      const response = recordValue(payload.response);
      state.responseId = stringValue(response?.id) ?? state.responseId;
      emit(options, { type: 'response.created', at, responseId: state.responseId });
      return;
    }
    case 'response.output_text.delta': {
      const delta = stringValue(payload.delta);
      if (delta !== null && delta.length > 0) {
        state.text += delta;
        timing.firstVisibleToken ??= at;
        emit(options, { type: 'text.delta', at, delta });
      }
      return;
    }
    case 'response.reasoning_summary_text.delta':
    case 'response.reasoning_text.delta': {
      const delta = stringValue(payload.delta);
      if (delta !== null && delta.length > 0) {
        state.reasoning += delta;
        timing.firstVisibleToken ??= at;
        emit(options, { type: 'reasoning.delta', at, delta });
      }
      return;
    }
    case 'response.output_item.added': {
      const item = recordValue(payload.item);
      if (item?.type !== 'function_call') {
        return;
      }
      const key = toolKey(payload, item, state.toolCalls.size);
      const toolCall: StreamToolCall = {
        itemId: stringValue(item.id),
        callId: stringValue(item.call_id),
        name: stringValue(item.name),
        arguments: stringValue(item.arguments) ?? '',
      };
      state.toolCalls.set(key, toolCall);
      emit(options, { type: 'tool_call.started', at, toolCall: { ...toolCall } });
      return;
    }
    case 'response.function_call_arguments.delta': {
      const delta = stringValue(payload.delta);
      if (delta === null) {
        return;
      }
      const key = toolKey(payload, null, state.toolCalls.size);
      const current = state.toolCalls.get(key) ?? emptyToolCall(payload);
      current.arguments += delta;
      state.toolCalls.set(key, current);
      emit(options, {
        type: 'tool_call.arguments.delta',
        at,
        callId: current.callId,
        delta,
      });
      return;
    }
    case 'response.function_call_arguments.done': {
      const key = toolKey(payload, null, state.toolCalls.size);
      const current = state.toolCalls.get(key) ?? emptyToolCall(payload);
      current.arguments = stringValue(payload.arguments) ?? current.arguments;
      state.toolCalls.set(key, current);
      emit(options, { type: 'tool_call.completed', at, toolCall: { ...current } });
      return;
    }
    case 'response.completed': {
      const response = recordValue(payload.response);
      state.responseId = stringValue(response?.id) ?? state.responseId;
      const usage = recordValue(response?.usage);
      if (usage !== null) {
        state.usage = usage;
        emit(options, { type: 'usage.updated', at, usage });
      }
      if (state.responseId === null) {
        state.failure = schemaError('The completed event has no response ID.', safeDetails);
        emit(options, { type: 'response.failed', at, error: state.failure });
        return;
      }
      if (state.text.length === 0 && state.toolCalls.size === 0) {
        state.failure = schemaError('The response completed without output text.', safeDetails);
        emit(options, { type: 'response.failed', at, error: state.failure });
        return;
      }
      state.completed = true;
      timing.completed = at;
      emit(options, { type: 'response.completed', at, responseId: state.responseId });
      return;
    }
    case 'response.failed':
    case 'error': {
      state.failure = providerStreamError(payload, safeDetails);
      emit(options, { type: 'response.failed', at, error: state.failure });
      return;
    }
    case 'response.in_progress':
    case 'response.output_item.done':
    case 'response.content_part.added':
    case 'response.content_part.done':
    case 'response.output_text.done':
    case 'response.reasoning_summary_part.added':
    case 'response.reasoning_summary_part.done':
    case 'response.reasoning_summary_text.done':
      return;
    default:
      diagnostics.push({ kind: 'unknown-event', eventType: safeEventType(type) });
  }
}

function fail(
  error: AppError,
  cancelled: boolean,
  state: ProviderState,
  timing: StreamTiming,
  diagnostics: StreamDiagnostic[],
  options: SendResponseOptions,
  eventAlreadyEmitted = false,
): AttemptResult {
  const at = performance.now();
  timing.completed ??= at;
  if (!eventAlreadyEmitted) {
    emit(
      options,
      cancelled ? { type: 'request.cancelled', at } : { type: 'response.failed', at, error },
    );
  }
  return {
    ok: false,
    error,
    cancelled,
    hadModelEvent: state.hadModelEvent,
    partial: partialResponse(state),
    timing,
    diagnostics,
  };
}

function partialResponse(state: ProviderState): PartialStreamResponse {
  return {
    id: state.responseId,
    text: state.text.length === 0 ? null : state.text,
    reasoningSummary: state.reasoning.length === 0 ? null : state.reasoning,
    toolCalls: [...state.toolCalls.values()],
  };
}

function toolKey(
  payload: Record<string, unknown>,
  item: Record<string, unknown> | null,
  fallback: number,
): string {
  const itemId = stringValue(item?.id) ?? stringValue(payload.item_id);
  if (itemId !== null) {
    return itemId;
  }
  const callId = stringValue(item?.call_id) ?? stringValue(payload.call_id);
  if (callId !== null) {
    return callId;
  }
  const outputIndex = numberValue(payload.output_index);
  return outputIndex === null ? `tool_${String(fallback)}` : `output_${String(outputIndex)}`;
}

function emptyToolCall(payload: Record<string, unknown>): StreamToolCall {
  return {
    itemId: stringValue(payload.item_id),
    callId: stringValue(payload.call_id),
    name: null,
    arguments: '',
  };
}

function providerStreamError(
  payload: Record<string, unknown>,
  safeDetails: Record<string, string>,
): AppError {
  const response = recordValue(payload.response);
  const source = response?.error ?? payload.error ?? payload;
  const parsed = parseProviderErrorBody(JSON.stringify({ error: source }));
  return createAppError({
    category: 'server',
    message: parsed.message,
    httpStatus: null,
    providerCode: parsed.providerCode,
    requestId: parsed.requestId,
    retryable: false,
    safeDetails,
  });
}

function streamEndedError(safeDetails: Record<string, string>): AppError {
  return createAppError({
    category: 'network',
    message: 'The stream ended before response.completed.',
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: true,
    safeDetails,
  });
}

function cancelledError(safeDetails: Record<string, string>): AppError {
  return createAppError({
    category: 'cancelled',
    message: 'The request was stopped.',
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: false,
    safeDetails,
  });
}

function schemaError(message: string, safeDetails: Record<string, string>): AppError {
  return createAppError({
    category: 'schema',
    message,
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: false,
    safeDetails,
  });
}

function emit(options: SendResponseOptions, event: ResponseStreamEvent): void {
  options.onEvent?.(event);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeEventType(value: string | null): string | null {
  return value === null ? null : redactText(value).slice(0, 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null) {
    return null;
  }
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.min(Math.max(timestamp - now, 0), MAX_RETRY_AFTER_MS);
}

/** Responses client konkret. Fallback protocol baru ditambahkan saat fase fallback dimulai. */
export const responsesClient = { send };
