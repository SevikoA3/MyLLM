import {
  changedOverrideModelIds,
  parseModelOverridesText,
  serializeModelOverrides,
  type ModelOverridesFile,
} from './catalog';

const empty: ModelOverridesFile = { schemaVersion: 1, endpoints: {} };

describe('model override JSON', () => {
  it.each([
    ['negative token', { contextWindow: -1 }],
    ['invalid effort', { reasoningEfforts: ['low', 'low'] }],
  ])('menolak %s', (_label, override) => {
    const result = parseModelOverridesText(
      JSON.stringify({
        schemaVersion: 1,
        endpoints: { ep_1: { models: { model: override } } },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('menerima null sebagai inherit dan array sebagai replacement', () => {
    const result = parseModelOverridesText(
      JSON.stringify({
        schemaVersion: 1,
        endpoints: {
          ep_1: {
            models: {
              model: { contextWindow: null, reasoningEfforts: ['auto', 'max'] },
            },
          },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.endpoints.ep_1.models.model).toEqual({
        contextWindow: null,
        reasoningEfforts: ['auto', 'max'],
      });
    }
  });

  it('menolak schema masa depan dengan pesan upgrade', () => {
    const result = parseModelOverridesText('{"schemaVersion":2,"endpoints":{}}');
    expect(result).toEqual({
      ok: false,
      path: '$.schemaVersion',
      message: 'The schema is newer. Upgrade the app to import this file.',
    });
  });

  it('export hanya memuat schema override tervalidasi', () => {
    const exported = serializeModelOverrides(empty);
    expect(exported).not.toMatch(/credential|authorization|api.?key/i);
  });

  it('preview hanya menyebut model yang berubah', () => {
    const next: ModelOverridesFile = {
      schemaVersion: 1,
      endpoints: { ep_1: { models: { model: { contextWindow: 32_000 } } } },
    };
    expect(changedOverrideModelIds(empty, next, 'ep_1')).toEqual(['model']);
  });
});
