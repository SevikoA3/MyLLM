import type { ConversationInputMessage } from '../../domain/conversation';
import type { EndpointProfile } from '../../domain/endpoint';
import type { AppError } from '../../domain/error';
import type { ToolDefinition, ToolExchange } from '../../domain/tool';

export type SendResponseInput = {
  modelId: string;
  prompt: string;
  history?: ConversationInputMessage[];
  previousResponseId: string | null;
  promptCacheKey: string | null;
  maxOutputTokens: number | null;
  reasoningEffort: string | null;
  tools?: ToolDefinition[];
  toolExchanges?: ToolExchange[];
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

export type SendResponseResult =
  | ({ ok: true; response: StreamResponse } & SendResponseMeta)
  | ({
      ok: false;
      error: AppError;
      cancelled: boolean;
      hadModelEvent: boolean;
      partial: PartialStreamResponse;
    } & SendResponseMeta);

export type SendResponseMeta = {
  timing: StreamTiming;
  diagnostics: StreamDiagnostic[];
  attempts: number;
};

export type Transport = {
  send: (
    profile: EndpointProfile,
    apiKey: string,
    input: SendResponseInput,
    options?: SendResponseOptions,
  ) => Promise<SendResponseResult>;
};
