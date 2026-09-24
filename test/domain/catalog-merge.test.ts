import { mergeCatalog } from '../../src/domain/catalog-merge';

const live = [
  {
    id: 'amanai/glm-5.3',
    displayName: 'amanai/glm-5.3',
    vendor: 'zai',
    ownedBy: 'amanai',
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: ['auto', 'low', 'medium', 'high'],
    inputModalities: ['text' as const],
  },
];

describe('mergeCatalog', () => {
  it('memakai urutan bundled lalu live lalu override pengguna', () => {
    const models = mergeCatalog({
      defaults: [{ id: 'amanai/glm-5.3', displayName: 'Bundled name', contextWindow: 200_000 }],
      live,
      overrides: { 'amanai/glm-5.3': { maxOutputTokens: 64_000 } },
    });

    const model = models[0];
    expect(model.displayName).toBe('amanai/glm-5.3');
    expect(model.contextWindow).toBe(1_000_000);
    expect(model.maxOutputTokens).toBe(64_000);
    expect(model.provenance.contextWindow?.source).toBe('live');
    expect(model.provenance.maxOutputTokens?.source).toBe('user-override');
  });

  it('mengembalikan nilai field yang dihapus ke live saat override bernilai null', () => {
    const models = mergeCatalog({
      defaults: [],
      live,
      overrides: { 'amanai/glm-5.3': { contextWindow: null } },
    });
    expect(models[0].contextWindow).toBe(1_000_000);
  });

  it('array override mengganti array upstream', () => {
    const models = mergeCatalog({
      defaults: [],
      live,
      overrides: { 'amanai/glm-5.3': { reasoningEfforts: ['auto', 'max'] } },
    });
    expect(models[0].reasoningEfforts).toEqual(['auto', 'max']);
  });

  it('menghitung vendor dari prefix id atau owned_by tanpa mengklaim fakta', () => {
    const models = mergeCatalog({
      defaults: [],
      live: [{ id: 'gpt-4o-mini', ownedBy: 'system' }, { id: 'tanpa-owner' }],
      overrides: {},
    });
    expect(models[0].vendor).toBe('system');
    expect(models[1].vendor).toBeNull();
  });

  it('menyembunyikan model yang dimatikan tetapi model orphan tetap aktif', () => {
    const models = mergeCatalog({
      defaults: [],
      live,
      overrides: { 'amanai/glm-5.3': { disabledAt: '2026-09-16T10:00:00.000Z' } },
      history: [{ id: 'amanai/hilang', displayName: 'Model lama' }],
    });
    const disabled = models.find((model) => model.id === 'amanai/glm-5.3');
    const orphan = models.find((model) => model.id === 'amanai/hilang');
    expect(disabled?.enabled).toBe(false);
    expect(orphan?.enabled).toBe(true);
    expect(orphan?.orphaned).toBe(true);
    expect(orphan?.displayName).toBe('Model lama');
    expect(orphan?.contextWindow).toBeNull();
  });

  it('menambahkan model custom yang hanya berasal dari override', () => {
    const models = mergeCatalog({
      defaults: [],
      live: [],
      overrides: { 'custom/model': { displayName: 'Custom', contextWindow: 32_000 } },
    });
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('custom/model');
    expect(models[0].orphaned).toBe(true);
    expect(models[0].contextWindow).toBe(32_000);
  });

  it('field yang tidak diberikan tetap null atau unknown, bukan nol atau false', () => {
    const models = mergeCatalog({ defaults: [], live: [{ id: 'sparse' }], overrides: {} });
    expect(models[0].contextWindow).toBeNull();
    expect(models[0].maxOutputTokens).toBeNull();
    expect(models[0].reasoningEfforts).toEqual([]);
    expect(models[0].capabilities.tools).toBe('unknown');
    expect(models[0].pricing).toBeNull();
  });

  it('mengubah capability override menjadi provenance user-override', () => {
    const models = mergeCatalog({
      defaults: [],
      live,
      overrides: { 'amanai/glm-5.3': { capabilities: { tools: 'supported' } } },
    });
    expect(models[0].capabilities.tools).toBe('supported');
    expect(models[0].capabilities.streaming).toBe('unknown');
    expect(models[0].provenance['capabilities.tools']?.source).toBe('user-override');
  });

  it('membaca pricing hanya untuk ditampilkan dan tanpa konversi', () => {
    const models = mergeCatalog({
      defaults: [],
      live: [
        {
          id: 'amanai/glm-5.3',
          raw: {
            pricing_version: 'v3',
            pricing: { currency: 'amanai_credit', prompt: '5.6', completion: 28 },
          },
        },
      ],
      overrides: {},
    });
    expect(models[0].pricing).toEqual({
      version: 'v3',
      currency: 'amanai_credit',
      prompt: '5.6',
      completion: '28',
      cacheRead: null,
      minimumRequest: null,
    });
  });
});
