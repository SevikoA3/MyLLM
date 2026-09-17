import {
  buildTurnMetrics,
  normalizeUsage,
} from './usage';

describe('usage', () => {
  it('normalizes Responses usage extensions', () => {
    expect(
      normalizeUsage({
        input_tokens: 100,
        input_tokens_details: { cached_tokens: 40, cache_write_tokens: 20 },
        output_tokens: 12,
        output_tokens_details: { reasoning_tokens: 4 },
        total_tokens: 112,
      }),
    ).toEqual({
      inputTokens: 100,
      uncachedInputTokens: 60,
      cacheReadTokens: 40,
      cacheWriteTokens: 20,
      outputTokens: 12,
      reasoningTokens: 4,
      totalTokens: 112,
      quality: 'exact',
      source: 'provider',
    });
  });

  it('keeps missing cache fields unavailable', () => {
    const usage = normalizeUsage({ input_tokens: 12, output_tokens: 4 });
    expect(usage.cacheReadTokens).toBeNull();
    expect(usage.uncachedInputTokens).toBeNull();
    expect(usage.quality).toBe('exact');
    expect(
      buildTurnMetrics('turn_1', 1, 'model', usage, {
        requestStart: 0,
        firstEvent: 10,
        firstVisibleToken: 20,
        completed: 120,
      }).cacheHitPercent,
    ).toBeNull();
  });

  it('prefers Amanai billing cache fields over zero generic aliases', () => {
    const usage = normalizeUsage({
      input_tokens: 1000,
      cached_tokens: 0,
      provider_cache_read_tokens: 800,
      billing_cache_tokens: 800,
      output_tokens: 20,
    });
    expect(usage.cacheReadTokens).toBe(800);
    expect(usage.uncachedInputTokens).toBe(200);
  });

  it('does not double count cached and cache-write input', () => {
    const usage = normalizeUsage({
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 40, cache_write_tokens: 20 },
      output_tokens: 10,
    });
    const metrics = buildTurnMetrics('turn_1', 1, 'model', usage, {
      requestStart: 0,
      firstEvent: 10,
      firstVisibleToken: 20,
      completed: 120,
    });
    expect(metrics.cacheHitPercent).toBe(40);
    expect(metrics.usage.uncachedInputTokens).toBe(60);
    expect(metrics.tokensPerSecond).toBe(100);
  });

  it('returns unavailable for missing usage', () => {
    expect(normalizeUsage(null)).toEqual({
      inputTokens: null,
      uncachedInputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      totalTokens: null,
      quality: 'unavailable',
      source: 'unknown',
    });
  });

  it('guards missing and zero decode duration', () => {
    const usage = normalizeUsage({ input_tokens: 10, output_tokens: 4 });
    const metrics = buildTurnMetrics('turn_1', 1, 'model', usage, {
      requestStart: 10,
      firstEvent: null,
      firstVisibleToken: 20,
      completed: 20,
    });
    expect(metrics.ttftMs).toBeNull();
    expect(metrics.tokensPerSecond).toBeNull();
  });
});
