export type UsageQuality = 'exact' | 'estimated' | 'unavailable';

export type NormalizedUsage = {
  inputTokens: number | null;
  uncachedInputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  quality: UsageQuality;
  source: 'provider' | 'local' | 'unknown';
};

export type UsageTiming = {
  requestStart: number | null;
  firstEvent: number | null;
  firstVisibleToken: number | null;
  completed: number | null;
};

export type TurnMetrics = {
  turnId: string;
  ordinal: number;
  modelId: string;
  usage: NormalizedUsage;
  timing: UsageTiming;
  ttftMs: number | null;
  firstVisibleTokenMs: number | null;
  decodeMs: number | null;
  tokensPerSecond: number | null;
  cacheHitPercent: number | null;
};

export type MetricsSummary = {
  turnCount: number;
  inputTokens: number | null;
  cacheReadTokens: number | null;
  outputTokens: number | null;
  cacheHitPercent: number | null;
  averageTtftMs: number | null;
  tokensPerSecond: number | null;
};

export function normalizeUsage(raw: unknown): NormalizedUsage {
  const record = isRecord(raw) ? raw : null;
  const inputTokens = numberAt(record, [['input_tokens'], ['prompt_tokens']]);
  const cacheReadTokens = numberAt(record, [
    ['billing_cache_tokens'],
    ['provider_cache_read_tokens'],
    ['cache_read_tokens'],
    ['cache_read'],
    ['input_tokens_details', 'cached_tokens'],
    ['prompt_tokens_details', 'cached_tokens'],
    ['prompt_cache_hit_tokens'],
    ['cache_read_input_tokens'],
    ['cached_tokens'],
  ]);
  const cacheWriteTokens = numberAt(record, [
    ['billing_cache_write_tokens'],
    ['provider_cache_write_tokens'],
    ['cache_write_tokens'],
    ['cache_write'],
    ['cache_creation_input_tokens'],
    ['input_tokens_details', 'cache_write_tokens'],
    ['input_tokens_details', 'cache_creation_input_tokens'],
    ['prompt_tokens_details', 'cache_write_tokens'],
  ]);
  const outputTokens = numberAt(record, [['output_tokens'], ['completion_tokens']]);
  const reasoningTokens = numberAt(record, [
    ['reasoning_tokens'],
    ['output_tokens_details', 'reasoning_tokens'],
    ['completion_tokens_details', 'reasoning_tokens'],
  ]);
  const totalTokens = numberAt(record, [['total_tokens']]);
  const hasProviderUsage = [
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  ].some((value) => value !== null);
  const uncachedInputTokens =
    inputTokens !== null &&
    cacheReadTokens !== null &&
    cacheReadTokens <= inputTokens
      ? inputTokens - cacheReadTokens
      : null;
  return {
    inputTokens,
    uncachedInputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    quality: hasProviderUsage ? 'exact' : 'unavailable',
    source: hasProviderUsage ? 'provider' : 'unknown',
  };
}

export function buildTurnMetrics(
  turnId: string,
  ordinal: number,
  modelId: string,
  usage: NormalizedUsage,
  timing: UsageTiming,
): TurnMetrics {
  const ttftMs = duration(timing.requestStart, timing.firstEvent);
  const firstVisibleTokenMs = duration(timing.requestStart, timing.firstVisibleToken);
  const decodeMs = duration(timing.firstVisibleToken, timing.completed);
  const tokensPerSecond =
    usage.outputTokens !== null && decodeMs !== null && decodeMs > 0
      ? (usage.outputTokens * 1000) / decodeMs
      : null;
  const cacheHitPercent =
    usage.inputTokens !== null &&
    usage.inputTokens > 0 &&
    usage.cacheReadTokens !== null &&
    usage.cacheReadTokens >= 0 &&
    usage.cacheReadTokens <= usage.inputTokens
      ? (usage.cacheReadTokens * 100) / usage.inputTokens
      : null;
  return {
    turnId,
    ordinal,
    modelId,
    usage,
    timing,
    ttftMs,
    firstVisibleTokenMs,
    decodeMs,
    tokensPerSecond,
    cacheHitPercent,
  };
}

export function summarizeMetrics(metrics: TurnMetrics[]): MetricsSummary {
  const inputTokens = sumKnown(metrics.map((entry) => entry.usage.inputTokens));
  const cacheReadTokens = sumKnown(metrics.map((entry) => entry.usage.cacheReadTokens));
  const outputTokens = sumKnown(metrics.map((entry) => entry.usage.outputTokens));
  const cacheHitPercent =
    inputTokens !== null && inputTokens > 0 && cacheReadTokens !== null
      ? (cacheReadTokens * 100) / inputTokens
      : null;
  const ttftValues = metrics
    .map((entry) => entry.ttftMs)
    .filter((value): value is number => value !== null);
  const decodeMs = sumKnown(metrics.map((entry) => entry.decodeMs));
  return {
    turnCount: metrics.length,
    inputTokens,
    cacheReadTokens,
    outputTokens,
    cacheHitPercent,
    averageTtftMs:
      ttftValues.length === 0
        ? null
        : ttftValues.reduce((total, value) => total + value, 0) / ttftValues.length,
    tokensPerSecond:
      outputTokens !== null && decodeMs !== null && decodeMs > 0
        ? (outputTokens * 1000) / decodeMs
        : null,
  };
}

export function formatCount(value: number | null): string {
  return value === null ? 'unavailable' : value.toLocaleString('en-US');
}

export function formatDuration(value: number | null): string {
  return value === null ? 'unavailable' : `${Math.round(value)} ms`;
}

export function formatRate(value: number | null): string {
  return value === null ? 'unavailable' : `${value.toFixed(1)} tok/s`;
}

export function formatPercent(value: number | null): string {
  return value === null ? 'unavailable' : `${value.toFixed(1)}%`;
}

function duration(start: number | null, end: number | null): number | null {
  if (start === null || end === null || end < start) {
    return null;
  }
  return end - start;
}

function sumKnown(values: (number | null)[]): number | null {
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function numberAt(
  record: Record<string, unknown> | null,
  paths: string[][],
): number | null {
  for (const path of paths) {
    let value: unknown = record;
    for (const segment of path) {
      value = isRecord(value) ? value[segment] : null;
    }
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
