import type { MergedModel } from './catalog-merge';
import { createEndpointProfile } from './endpoint';
import { effectiveMaxOutput, modelRequestSnapshot, reasoningChoices } from './model-config';

function model(overrides: Partial<MergedModel> = {}): MergedModel {
  return {
    id: 'provider/model',
    displayName: 'provider/model',
    vendor: null,
    ownedBy: null,
    description: null,
    contextWindow: null,
    maxOutputTokens: 16_000,
    reasoningEfforts: ['low', 'high'],
    inputModalities: ['text'],
    capabilities: {
      streaming: 'unknown',
      tools: 'unknown',
      structuredOutput: 'unknown',
      nativeCompaction: 'unknown',
    },
    raw: {},
    pricing: null,
    provenance: {},
    request: { reasoningEffort: null, outputLimit: null },
    enabled: true,
    orphaned: false,
    ...overrides,
  };
}

describe('model request config', () => {
  it('mengambil batas terkecil dan mempertahankan urutan reasoning provider', () => {
    expect(effectiveMaxOutput(16_000, 8_192)).toBe(8_192);
    expect(reasoningChoices(['low', 'auto', 'max'])).toEqual(['low', 'auto', 'max']);
    expect(reasoningChoices(['low', 'max'])).toEqual(['auto', 'low', 'max']);
    expect(reasoningChoices(['auto'])).toEqual([]);
    const profile = createEndpointProfile({
      id: 'ep_1',
      name: 'Endpoint',
      baseUrl: 'https://example.test/v1',
    });
    expect(modelRequestSnapshot(model(), profile).reasoningEffort).toBe('auto');
  });

  it('menolak effort dan output limit yang tidak valid', () => {
    const profile = createEndpointProfile({
      id: 'ep_1',
      name: 'Endpoint',
      baseUrl: 'https://example.test/v1',
      protocol: 'chat-completions',
    });
    expect(() =>
      modelRequestSnapshot(
        model({ request: { reasoningEffort: 'max', outputLimit: null } }),
        profile,
      ),
    ).toThrow('Reasoning effort max');
    expect(() =>
      modelRequestSnapshot(
        model({ request: { reasoningEffort: null, outputLimit: 9_000 } }),
        profile,
      ),
    ).toThrow('8192');
  });
});
