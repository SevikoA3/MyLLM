import { parseModelList } from '../../src/domain/model-list';

const STANDARD_MODELS = JSON.stringify({
  object: 'list',
  data: [
    { id: 'gpt-4o-mini', object: 'model', created: 1728000000, owned_by: 'system' },
    { id: 'llama-3.3-70b', object: 'model', created: 1730000000, owned_by: 'system' },
  ],
});

const ENRICHED_MODELS = JSON.stringify({
  object: 'list',
  data: [
    {
      id: 'amanai/glm-5.3',
      object: 'model',
      owned_by: 'amanai',
      thinking: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
      context_length: 1000000,
      max_output: 128000,
      vendor: 'zai',
      input_modalities: ['text'],
      description: 'Model description',
      pricing_version: 'v3',
      unknown_future_field: { nested: true },
    },
  ],
});

describe('parseModelList', () => {
  it('menerima standard OpenAI model list', () => {
    const result = parseModelList(STANDARD_MODELS);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.models.map((model) => model.id)).toEqual(['gpt-4o-mini', 'llama-3.3-70b']);
    expect(result.models[0].contextWindow).toBeNull();
    expect(result.models[0].maxOutputTokens).toBeNull();
    expect(result.models[0].reasoningEfforts).toEqual([]);
    expect(result.models[0].vendor).toBe('system');
    expect(result.models[0].capabilities.tools).toBe('unknown');
  });

  it('membaca enriched field AmanAI tanpa menjadikannya wajib', () => {
    const result = parseModelList(ENRICHED_MODELS);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const model = result.models[0];
    expect(model.id).toBe('amanai/glm-5.3');
    expect(model.displayName).toBe('amanai/glm-5.3');
    expect(model.vendor).toBe('zai');
    expect(model.contextWindow).toBe(1000000);
    expect(model.maxOutputTokens).toBe(128000);
    expect(model.reasoningEfforts).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(model.inputModalities).toEqual(['text']);
  });

  it('tidak gagal karena extension field yang belum dikenal', () => {
    const result = parseModelList(ENRICHED_MODELS);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.models[0].raw.unknown_future_field).toEqual({ nested: true });
  });

  it('menolak record tanpa model ID dan tetap menerima record lain', () => {
    const body = JSON.stringify({
      object: 'list',
      data: [
        { object: 'model' },
        { id: 42 },
        { id: '   ' },
        { id: 'ok-model' },
        { id: 'ok-model' },
      ],
    });
    const result = parseModelList(body);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.models.map((model) => model.id)).toEqual(['ok-model']);
    expect(result.rejected).toHaveLength(4);
  });

  it('mengabaikan nilai enriched yang salah tipe tanpa menggagalkan record', () => {
    const body = JSON.stringify({
      data: [{ id: 'weird-model', context_length: 'large', thinking: 'auto', input_modalities: ['text', 'hologram'] }],
    });
    const result = parseModelList(body);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const model = result.models[0];
    expect(model.contextWindow).toBeNull();
    expect(model.reasoningEfforts).toEqual([]);
    expect(model.inputModalities).toEqual(['text']);
  });

  it('mengubah field hilang menjadi unknown atau null, bukan false atau nol', () => {
    const result = parseModelList(JSON.stringify({ data: [{ id: 'sparse-model' }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const model = result.models[0];
    expect(model.contextWindow).toBeNull();
    expect(model.maxOutputTokens).toBeNull();
    expect(model.capabilities.streaming).toBe('unknown');
    expect(model.capabilities.nativeCompaction).toBe('unknown');
  });

  it('menolak JSON yang tidak valid', () => {
    const result = parseModelList('{"data": [');
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.category).toBe('schema');
    expect(result.error.retryable).toBe(false);
  });

  it('menolak schema yang tidak kompatibel', () => {
    const result = parseModelList(JSON.stringify({ models: ['gpt-4o-mini'] }));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.message).toMatch(/incompatible/);
  });

  it('menolak daftar kosong tanpa membuat model palsu', () => {
    const result = parseModelList(JSON.stringify({ object: 'list', data: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.category).toBe('model');
  });
});
