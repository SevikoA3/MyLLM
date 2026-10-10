import {
  ModelOverrideSchema,
  changedOverrideModelIds,
  parseModelOverridesText,
  serializeModelOverrides,
  type ModelOverridesFile,
} from '../../src/domain/catalog';

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

  it.each([
    ['raw API key', { raw: { api_key: 'fake-opaque-key' } }],
    ['nested API key', { raw: { provider: [{ apiKey: 'fake-opaque-key' }] } }],
    ['authorization header', { raw: { headers: { Authorization: 'fake-opaque-key' } } }],
    ['access token', { raw: { access_token: 'fake-opaque-key' } }],
    ['secret-shaped value', { raw: { note: 'sk-fake-import-key' } }],
    ['bearer value', { raw: { note: 'Bearer fake-opaque-key' } }],
    ['secret in description', { description: 'sk-fake-import-key' }],
  ])('rejects %s without echoing the credential', (_label, override) => {
    const result = parseModelOverridesText(JSON.stringify({
      schemaVersion: 1,
      endpoints: { ep_1: { models: { model: override } } },
    }));

    expect(result.ok).toBe(false);
    expect(ModelOverrideSchema.safeParse(override).success).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/fake-opaque-key|sk-fake-import-key/);
  });

  it('redacts secret-shaped validation paths and messages', () => {
    const result = parseModelOverridesText(JSON.stringify({
      schemaVersion: 1,
      endpoints: {
        ep_1: { models: { 'sk-fake-model-id': { reasoningEfforts: ['sk-fake-effort', 'sk-fake-effort'] } } },
      },
    }));

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/sk-fake-model-id|sk-fake-effort/);
  });

  it('preserves exact model IDs and safe arbitrary metadata on round trip', () => {
    const next: ModelOverridesFile = {
      schemaVersion: 1,
      endpoints: {
        ep_1: {
          models: {
            'provider/model:exact': {
              raw: {
                token_count: 128,
                tokenizer: 'provider-v2',
                provider: [{ label: 'Safe metadata', enabled: true, extra: null }],
              },
            },
            api_key: { contextWindow: null },
            'sk-fake-model-id': { enabled: true },
          },
        },
      },
    };

    expect(parseModelOverridesText(serializeModelOverrides(next))).toEqual({ ok: true, value: next });
  });

  it('preview hanya menyebut model yang berubah', () => {
    const next: ModelOverridesFile = {
      schemaVersion: 1,
      endpoints: { ep_1: { models: { model: { contextWindow: 32_000 } } } },
    };
    expect(changedOverrideModelIds(empty, next, 'ep_1')).toEqual(['model']);
  });

  it('includes additions, changes, and deletions across every endpoint', () => {
    const current: ModelOverridesFile = {
      schemaVersion: 1,
      endpoints: {
        ep_1: { models: { shared: { request: { outputLimit: 100 } } } },
        ep_2: { models: { shared: { request: { outputLimit: 200 } }, unchanged: { enabled: true } } },
        ep_3: { models: { removed: { request: { reasoningEffort: 'high' } } } },
      },
    };
    const next: ModelOverridesFile = {
      schemaVersion: 1,
      endpoints: {
        ep_1: { models: { shared: { request: { outputLimit: 150 } } } },
        ep_2: { models: { shared: { request: { outputLimit: 250 } }, unchanged: { enabled: true } } },
        ep_4: { models: { 'provider/model:exact': { request: { reasoningEffort: 'low' } } } },
      },
    };

    expect(changedOverrideModelIds(current, next, 'ep_1')).toEqual([
      'ep_2/shared', 'ep_3/removed', 'ep_4/provider/model:exact', 'shared',
    ]);
    expect(changedOverrideModelIds(current, current, 'ep_1')).toEqual([]);
  });
});
