import { createEndpointProfile, joinEndpointPath } from '../../domain/endpoint';
import type { ModelRecord } from '../../domain/model';
import {
  createCatalogRepository,
  modelsPathOf,
  pickerModels,
  readSnapshot,
  snapshotFileName,
  writeSnapshot,
  type CatalogStorage,
} from './catalog-store';

function memoryStorage(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed));
  const storage: CatalogStorage = {
    readText: async (name) => files.get(name) ?? null,
    writeText: async (name, text) => {
      files.set(name, text);
    },
    copy: async (from, to) => {
      const value = files.get(from);
      if (value !== undefined) {
        files.set(to, value);
      }
    },
    exists: async (name) => files.has(name),
  };
  return { storage, files };
}

function model(id: string, extra: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id,
    displayName: id,
    vendor: null,
    ownedBy: null,
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    reasoningEfforts: [],
    inputModalities: [],
    capabilities: {
      streaming: 'unknown',
      tools: 'unknown',
      structuredOutput: 'unknown',
      nativeCompaction: 'unknown',
    },
    raw: {},
    ...extra,
  };
}

const emptyDefaults = { schemaVersion: 1 as const, models: [] };

const profile = createEndpointProfile({
  id: 'ep_1',
  name: 'AmanAI',
  baseUrl: 'https://api.amanai.dev/v1',
});

describe('catalog snapshot', () => {
  it('menulis snapshot dan mempertahankan satu generasi backup', async () => {
    const { storage, files } = memoryStorage();
    const first = await writeSnapshot(storage, {
      schemaVersion: 1,
      endpointId: 'ep_1',
      baseUrl: profile.baseUrl,
      fetchedAt: '2026-09-16T10:00:00.000Z',
      models: [{ id: 'model-lama' }],
    });
    expect(first.ok).toBe(true);

    await writeSnapshot(storage, {
      schemaVersion: 1,
      endpointId: 'ep_1',
      baseUrl: profile.baseUrl,
      fetchedAt: '2026-09-16T11:00:00.000Z',
      models: [{ id: 'model-baru' }],
    });

    expect(files.get('snapshot-ep_1.backup.json')).toContain('model-lama');
    const current = await readSnapshot(storage, 'ep_1');
    expect(current?.models.map((entry) => entry.id)).toEqual(['model-baru']);
    expect(files.get('snapshot-ep_1.json.tmp')).toBe('');
  });

  it('menolak payload tanpa id model', async () => {
    const { storage } = memoryStorage();
    const result = await writeSnapshot(storage, {
      schemaVersion: 1,
      endpointId: 'ep_1',
      baseUrl: profile.baseUrl,
      fetchedAt: '2026-09-16T10:00:00.000Z',
      models: [],
    } satisfies Parameters<typeof writeSnapshot>[1]);
    expect(result.ok).toBe(true);
  });

  it('memisahkan file cache per endpointId', async () => {
    expect(snapshotFileName('ep_1')).not.toBe(snapshotFileName('ep_2'));
    expect(snapshotFileName('ep/aneh')).toBe('snapshot-ep_aneh.json');
  });
});

describe('createCatalogRepository', () => {
  function repository(seed: Record<string, string> = {}, models: ModelRecord[] = [model('model-baru')]) {
    const memory = memoryStorage(seed);
    let calls = 0;
    const repo = createCatalogRepository({
      storage: memory.storage,
      readDefaults: async () => emptyDefaults,
      fetchModels: async () => {
        calls += 1;
        return { ok: true, models };
      },
      now: () => Date.parse('2026-09-16T12:00:00.000Z'),
    });
    return { repo, memory, calls: () => calls };
  }

  it('memuat cache lebih dulu lalu refresh', async () => {
    const { repo } = repository();
    const before = await repo.load('ep_1');
    expect(before.models).toEqual([]);
    expect(before.lastFetchedAt).toBeNull();

    const refreshed = await repo.refresh({
      endpointId: 'ep_1',
      baseUrl: profile.baseUrl,
      modelListPath: profile.compat.modelListPath,
    });
    expect(refreshed.ok).toBe(true);
    if (refreshed.ok) {
      expect(refreshed.catalog.models.map((entry) => entry.id)).toEqual(['model-baru']);
      expect(refreshed.catalog.lastFetchedAt).toBe('2026-09-16T12:00:00.000Z');
    }
  });

  it('mempertahankan last-known-good saat refresh mengembalikan list kosong', async () => {
    const { storage, files } = memoryStorage();
    const first = createCatalogRepository({
      storage,
      readDefaults: async () => emptyDefaults,
      fetchModels: async () => ({ ok: true, models: [model('model-lama')] }),
    });
    await first.refresh({ endpointId: 'ep_1', baseUrl: profile.baseUrl, modelListPath: '/models' });

    const second = createCatalogRepository({
      storage,
      readDefaults: async () => emptyDefaults,
      fetchModels: async () => ({ ok: true, models: [] }),
    });
    const result = await second.refresh({
      endpointId: 'ep_1',
      baseUrl: profile.baseUrl,
      modelListPath: '/models',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('network');
      expect(result.catalog.models.map((entry) => entry.id)).toEqual(['model-lama']);
    }
    expect(files.get('snapshot-ep_1.json')).toContain('model-lama');
  });

  it('memakai backup saat file utama rusak dan tidak menghapus override', async () => {
    const seed = {
      'snapshot-ep_1.json': '{rusak',
      'snapshot-ep_1.backup.json': JSON.stringify({
        schemaVersion: 1,
        endpointId: 'ep_1',
        baseUrl: profile.baseUrl,
        fetchedAt: '2026-09-16T09:00:00.000Z',
        models: [{ id: 'model-backup', contextWindow: 32_000 }],
      }),
      'model-overrides.json': JSON.stringify({
        schemaVersion: 1,
        endpoints: { ep_1: { models: { 'model-backup': { displayName: 'Nama saya' } } } },
      }),
    };
    const { repo, memory } = repository(seed);
    const runtime = await repo.load('ep_1');
    expect(runtime.models[0].id).toBe('model-backup');
    expect(runtime.models[0].displayName).toBe('Nama saya');
    expect(runtime.lastFetchedAt).toBe('2026-09-16T09:00:00.000Z');
    expect(memory.files.get('model-overrides.json.corrupt')).toBeUndefined();
  });

  it('memakai default saat override rusak dan menyimpannya sebagai .corrupt', async () => {
    const { repo, memory } = repository({ 'model-overrides.json': '{rusak' });
    const runtime = await repo.load('ep_1');
    expect(runtime.overrides).toEqual({ schemaVersion: 1, endpoints: {} });
    expect(memory.files.get('model-overrides.json.corrupt')).toBe('{rusak');
    expect(memory.files.get('model-overrides.json')).toBe('');
  });

  it('coalesce refresh yang berjalan bersamaan', async () => {
    const { repo, calls } = repository();
    const input = { endpointId: 'ep_1', baseUrl: profile.baseUrl, modelListPath: '/models' };
    await Promise.all([repo.refresh(input), repo.refresh(input), repo.refresh(input)]);
    expect(calls()).toBe(1);
  });

  it('menyimpan override dan menerapkannya ke runtime tanpa refresh', async () => {
    const { repo, memory } = repository();
    await repo.load('ep_1');
    await repo.refresh({ endpointId: 'ep_1', baseUrl: profile.baseUrl, modelListPath: '/models' });
    await repo.setOverride('ep_1', 'model-baru', { displayName: 'Nama baru', contextWindow: 8_000 });

    const current = repo.current();
    expect(current?.models[0].displayName).toBe('Nama baru');
    expect(current?.models[0].contextWindow).toBe(8_000);
    expect(pickerModels(current!).map((entry) => entry.id)).toEqual(['model-baru']);
    expect(memory.files.get('model-overrides.json.tmp')).toBe('');

    await repo.setOverride('ep_1', 'model-baru', { displayName: 'Nama terbaru' });
    expect(memory.files.get('model-overrides.json.backup')).toContain('Nama baru');
  });

  it('menolak import rusak tanpa mengubah file aktif', async () => {
    const { repo, memory } = repository();
    await repo.load('ep_1');
    await repo.setOverride('ep_1', 'model-baru', { contextWindow: 8_000 });
    const before = memory.files.get('model-overrides.json');

    const result = await repo.applyOverridesText('ep_1', '{rusak');

    expect(result.ok).toBe(false);
    expect(memory.files.get('model-overrides.json')).toBe(before);
  });

  it('menolak custom model dengan exact ID duplikat', async () => {
    const { repo } = repository();
    await repo.load('ep_1');
    await repo.refresh({ endpointId: 'ep_1', baseUrl: profile.baseUrl, modelListPath: '/models' });
    await expect(repo.addCustomModel('ep_1', 'model-baru')).rejects.toThrow('Model ID sudah ada');
  });

  it('override bertahan setelah repository dibuka ulang dan katalog direfresh', async () => {
    const memory = memoryStorage();
    const first = createCatalogRepository({
      storage: memory.storage,
      readDefaults: async () => emptyDefaults,
      fetchModels: async () => ({ ok: true, models: [model('model-baru')] }),
    });
    await first.load('ep_1');
    await first.setOverride('ep_1', 'model-baru', { contextWindow: 32_000 });

    const reopened = createCatalogRepository({
      storage: memory.storage,
      readDefaults: async () => emptyDefaults,
      fetchModels: async () => ({
        ok: true,
        models: [model('model-baru', { contextWindow: 64_000 })],
      }),
    });
    await reopened.load('ep_1');
    await reopened.refresh({ endpointId: 'ep_1', baseUrl: profile.baseUrl, modelListPath: '/models' });

    expect(reopened.current()?.models[0].contextWindow).toBe(32_000);
    expect(reopened.current()?.models[0].provenance.contextWindow?.source).toBe('user-override');
  });

  it('dua endpoint tidak berbagi cache', async () => {
    const { storage } = memoryStorage();
    const repo = createCatalogRepository({
      storage,
      readDefaults: async () => emptyDefaults,
      fetchModels: async ({ baseUrl }) => ({
        ok: true,
        models: [model(baseUrl.includes('dua') ? 'model-dua' : 'model-satu')],
      }),
    });
    await repo.refresh({ endpointId: 'ep_1', baseUrl: 'https://satu.test/v1', modelListPath: '/models' });
    await repo.refresh({ endpointId: 'ep_2', baseUrl: 'https://dua.test/v1', modelListPath: '/models' });

    const first = await readSnapshot(storage, 'ep_1');
    const second = await readSnapshot(storage, 'ep_2');
    expect(first?.models.map((entry) => entry.id)).toEqual(['model-satu']);
    expect(second?.models.map((entry) => entry.id)).toEqual(['model-dua']);
  });
});

describe('modelsPathOf', () => {
  it('memakai models path dari profile tanpa menghasilkan /v1/v1', () => {
    expect(modelsPathOf(profile)).toBe(joinEndpointPath(profile.baseUrl, '/models'));
    expect(modelsPathOf(profile)).toBe('https://api.amanai.dev/v1/models');
  });
});
