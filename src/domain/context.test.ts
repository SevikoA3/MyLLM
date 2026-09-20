import {
  APP_AUTO_OUTPUT_BUDGET,
  buildContextBudget,
  CONTEXT_MAX_SAFETY_MARGIN,
  CONTEXT_MIN_SAFETY_MARGIN,
} from './context';

function budget(overrides: Partial<Parameters<typeof buildContextBudget>[0]> = {}) {
  return buildContextBudget({
    contextWindow: 32_000,
    instructions: 'System',
    input: [{ role: 'user', content: 'hello' }],
    outputLimit: null,
    effectiveMaxOutput: null,
    ...overrides,
  });
}

describe('context budget', () => {
  it('menghitung payload efektif, reserve otomatis, dan remaining budget', () => {
    const result = budget();

    expect(result.inputTokensEstimate).toBeGreaterThan(0);
    expect(result.requestedOutputReserve).toBe(APP_AUTO_OUTPUT_BUDGET);
    expect(result.safetyMargin).toBe(CONTEXT_MIN_SAFETY_MARGIN);
    expect(result.prospectiveUsed).toBe(
      result.inputTokensEstimate + APP_AUTO_OUTPUT_BUDGET + CONTEXT_MIN_SAFETY_MARGIN,
    );
    expect(result.remainingTokens).toBe(32_000 - (result.prospectiveUsed ?? 0));
    expect(result.usedPercent).toBeGreaterThan(0);
    expect(result.remainingPercent).toBeLessThan(100);
  });

  it('tidak memakai cumulative usage dan hanya berubah saat input efektif berubah', () => {
    const one = budget({ input: [{ role: 'user', content: 'hello' }] });
    const two = budget({
      input: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
      ],
    });

    expect(two.inputTokensEstimate).toBeGreaterThan(one.inputTokensEstimate);
  });

  it('tidak menampilkan persentase saat context unknown', () => {
    const result = budget({ contextWindow: null });

    expect(result.inputTokensEstimate).toBeGreaterThan(0);
    expect(result.safetyMargin).toBeNull();
    expect(result.prospectiveUsed).toBeNull();
    expect(result.remainingTokens).toBeNull();
    expect(result.usedPercent).toBeNull();
    expect(result.remainingPercent).toBeNull();
  });

  it('memakai explicit output limit lalu clamp ke effective max output', () => {
    expect(budget({ outputLimit: 10_000, effectiveMaxOutput: 4_096 }).requestedOutputReserve).toBe(
      4_096,
    );
    expect(budget({ outputLimit: 2_000, effectiveMaxOutput: null }).requestedOutputReserve).toBe(
      2_000,
    );
  });

  it('menghitung UTF-8 multibyte dan clamp persentase', () => {
    const ascii = budget({ instructions: '', input: [{ role: 'user', content: 'aaaa' }] });
    const multibyte = budget({ instructions: '', input: [{ role: 'user', content: '😀😀😀😀' }] });
    const small = budget({ contextWindow: 100 });

    expect(multibyte.inputTokensEstimate).toBeGreaterThan(ascii.inputTokensEstimate);
    expect(small.safetyMargin).toBe(CONTEXT_MIN_SAFETY_MARGIN);
    expect(small.usedPercent).toBe(100);
    expect(small.remainingPercent).toBe(0);
  });

  it('reserves the encoded image payload in the context estimate', () => {
    const plain = budget({ instructions: '', input: [{ role: 'user', content: '' }] });
    const withImage = budget({
      instructions: '',
      input: [{
        role: 'user',
        content: '',
        attachments: [{
          id: 'image_1',
          name: 'image.png',
          mimeType: 'image/png',
          byteSize: 300,
          uri: 'file:///documents/attachments/image_1.png',
        }],
      }],
    });

    expect(withImage.inputTokensEstimate).toBeGreaterThan(plain.inputTokensEstimate + 100);
  });

  it('memakai usage provider terakhir sebagai calibration hint tanpa mengubah occupancy', () => {
    const plain = budget();
    const calibrated = budget({ providerInputTokens: 2_000 });

    expect(calibrated.calibrationInputTokens).toBe(2_000);
    expect(calibrated.calibrationDeltaTokens).toBe(2_000 - plain.inputTokensEstimate);
    expect(calibrated.prospectiveUsed).toBe(plain.prospectiveUsed);
  });

  it('membatasi safety margin pada context besar', () => {
    expect(budget({ contextWindow: 1_000_000 }).safetyMargin).toBe(CONTEXT_MAX_SAFETY_MARGIN);
  });
});
