import { fetch as expoFetch } from 'expo/fetch';

import {
  buildAuthHeaders,
  buildCustomHeaders,
  joinEndpointPath,
  type EndpointProfile,
} from '../../domain/endpoint';
import {
  bodyTooLargeError,
  createAppError,
  fromHttpResponse,
  fromNetworkError,
  parseProviderErrorBody,
  redactText,
  type AppError,
} from '../../domain/error';
import { createSseParser, type SseFrame } from '../../domain/sse';
import { buildSystemPrompt } from '../../domain/system-prompt';
import { recordDiagnostic } from '../diagnostics/diagnostic-ring';
import { readResponseText } from './body';
import type {
  PartialStreamResponse,
  ResponseStreamEvent,
  SendResponseInput,
  SendResponseOptions,
  SendResponseResult,
  StreamDiagnostic,
  StreamResponse,
  StreamTiming,
  StreamToolCall,
  Transport,
} from './contract';

export const CHAT_COMPLETIONS_TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 250;
const MAX_ATTEMPTS = 2;
const MAX_RETRY_AFTER_MS = 60_000;

type AttemptMeta = {
  timing: StreamTiming;
  diagnostics: StreamDiagnostic[];
};

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

export function chatCompletionsUrl(profile: EndpointProfile): string {
  return joinEndpointPath(profile.baseUrl, profile.compat.chatCompletionsPath);
}

export function buildChatCompletionsBody(
  profile: EndpointProfile,
  input: SendResponseInput,
): Record<string, unknown> {
  const history = input.history ?? [{ role: 'user' as const, content: input.prompt }];
  const body: Record<string, unknown> = {
    model: input.modelId,
    messages: [
      { role: 'system', content: buildSystemPrompt(input.modelId) },
      ...history,
    ],
    stream: true,
    stream_options: { include_usage: true },
  };
  if (input.maxOutputTokens !== null) {
    body[profile.compat.chatMaxTokensField] = input.maxOutputTokens;
  }
  if (
    input.reasoningEffort !== null &&
    input.reasoningEffort !== 'auto' &&
    profile.compat.chatReasoningSupport === 'supported'
  ) {
    body.reasoning_effort = input.reasoningEffort;
  }
  if (input.promptCacheKey !== null && profile.compat.chatPromptCacheField !== null) {
    body[profile.compat.chatPromptCacheField] = input.promptCacheKey;
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
      const outcome = { ...result, attempts };
      void recordDiagnostic({
        kind: result.ok ? 'response-completed' : result.cancelled ? 'request-cancelled' : 'response-failed',
        endpointId: profile.id,
        modelId: input.modelId,
        attempt: attempts,
        httpStatus: result.ok ? null : result.error.httpStatus,
        errorCategory: result.ok ? null : result.error.category,
        requestId: result.ok ? null : result.error.requestId,
      });
      return outcome;
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
  const url = chatCompletionsUrl(profile);
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
  }, CHAT_COMPLETIONS_TIMEOUT_MS);
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
      body: JSON.stringify(buildChatCompletionsBody(profile, input)),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await readResponseText(response);
      if (!body.ok) {
        return fail(bodyTooLargeError(safeDetails), false, state, timing, diagnostics, options);
      }
      const parsed = fromHttpResponse({ status: response.status, body: body.text, ...safeDetails });
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      return fail(
        retryAfterMs === null ? parsed : { ...parsed, retryAfterMs },
        false,
        state,
        timing,
        diagnostics,
        options,
      );
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
      return fail(schemaError('The response stream has no body.', safeDetails), false, state, timing, diagnostics, options);
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
      return fail(streamEndedError(safeDetails), false, state, timing, diagnostics, options);
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
        ? fromNetworkError(new Error(`Request timeout after ${String(CHAT_COMPLETIONS_TIMEOUT_MS)}ms`), safeDetails)
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
  if (parsed.done) {
    complete(state, timing, safeDetails, options);
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
    state.failure = schemaError('The chat completion chunk does not contain valid JSON.', safeDetails);
    emit(options, { type: 'response.failed', at, error: state.failure });
    return;
  }
  if (!isRecord(payload)) {
    diagnostics.push({ kind: 'invalid-event', eventType: safeEventType(frame.event) });
    return;
  }
  const id = stringValue(payload.id);
  if (id !== null && state.responseId === null) {
    state.responseId = id;
    emit(options, { type: 'response.created', at, responseId: id });
  }
  const failure = recordValue(payload.error);
  if (failure !== null) {
    state.failure = providerStreamError(payload, safeDetails);
    emit(options, { type: 'response.failed', at, error: state.failure });
    return;
  }
  const usage = recordValue(payload.usage);
  if (usage !== null) {
    state.usage = normalizeUsage(usage);
    emit(options, { type: 'usage.updated', at, usage: state.usage });
  }
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  for (const choice of choices) {
    if (!isRecord(choice)) {
      continue;
    }
    const delta = recordValue(choice.delta);
    if (delta === null) {
      continue;
    }
    const text = stringValue(delta.content);
    if (text !== null && text.length > 0) {
      state.text += text;
      timing.firstVisibleToken ??= at;
      emit(options, { type: 'text.delta', at, delta: text });
    }
    const reasoning =
      stringValue(delta.reasoning_content) ??
      stringValue(delta.reasoning) ??
      stringValue(delta.reasoning_summary);
    if (reasoning !== null && reasoning.length > 0) {
      state.reasoning += reasoning;
      timing.firstVisibleToken ??= at;
      emit(options, { type: 'reasoning.delta', at, delta: reasoning });
    }
    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    for (const rawToolCall of toolCalls) {
      if (!isRecord(rawToolCall)) {
        continue;
      }
      const index = numberValue(rawToolCall.index) ?? state.toolCalls.size;
      const key = String(index);
      const current = state.toolCalls.get(key) ?? {
        itemId: null,
        callId: stringValue(rawToolCall.id),
        name: null,
        arguments: '',
      };
      if (!state.toolCalls.has(key)) {
        state.toolCalls.set(key, current);
        emit(options, { type: 'tool_call.started', at, toolCall: { ...current } });
      }
      const callId = stringValue(rawToolCall.id);
      if (callId !== null) {
        current.callId = callId;
      }
      const functionValue = recordValue(rawToolCall.function);
      const name = stringValue(functionValue?.name);
      if (name !== null) {
        current.name = name;
      }
      const argumentsDelta = stringValue(functionValue?.arguments);
      if (argumentsDelta !== null && argumentsDelta.length > 0) {
        current.arguments += argumentsDelta;
        emit(options, {
          type: 'tool_call.arguments.delta',
          at,
          callId: current.callId,
          delta: argumentsDelta,
        });
      }
    }
  }
}

function complete(
  state: ProviderState,
  timing: StreamTiming,
  safeDetails: Record<string, string>,
  options: SendResponseOptions,
): void {
  if (state.completed || state.failure !== null) {
    return;
  }
  if (state.responseId === null) {
    state.failure = schemaError('The chat completion stream has no response ID.', safeDetails);
    emit(options, { type: 'response.failed', at: performance.now(), error: state.failure });
    return;
  }
  if (state.text.length === 0 && state.reasoning.length === 0 && state.toolCalls.size === 0) {
    state.failure = schemaError('The chat completion completed without output.', safeDetails);
    emit(options, { type: 'response.failed', at: performance.now(), error: state.failure });
    return;
  }
  state.completed = true;
  timing.completed = performance.now();
  for (const toolCall of state.toolCalls.values()) {
    emit(options, { type: 'tool_call.completed', at: timing.completed, toolCall: { ...toolCall } });
  }
  emit(options, { type: 'response.completed', at: timing.completed, responseId: state.responseId });
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
    emit(options, cancelled ? { type: 'request.cancelled', at } : { type: 'response.failed', at, error });
  }
  return {
    ok: false,
    error,
    cancelled,
    hadModelEvent: state.hadModelEvent,
    partial: {
      id: state.responseId,
      text: state.text.length === 0 ? null : state.text,
      reasoningSummary: state.reasoning.length === 0 ? null : state.reasoning,
      toolCalls: [...state.toolCalls.values()],
    },
    timing,
    diagnostics,
  };
}

function providerStreamError(payload: Record<string, unknown>, safeDetails: Record<string, string>): AppError {
  const parsed = parseProviderErrorBody(JSON.stringify({ error: payload.error }));
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
    message: 'The stream ended before the chat completion finished.',
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

function normalizeUsage(usage: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...usage };
  const inputTokens = numberValue(usage.input_tokens) ?? numberValue(usage.prompt_tokens);
  const outputTokens = numberValue(usage.output_tokens) ?? numberValue(usage.completion_tokens);
  if (inputTokens !== null) {
    normalized.input_tokens = inputTokens;
  }
  if (outputTokens !== null) {
    normalized.output_tokens = outputTokens;
  }
  return normalized;
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

export const chatCompletionsTransport: Transport = { send };
export const chatCompletionsClient = chatCompletionsTransport;
