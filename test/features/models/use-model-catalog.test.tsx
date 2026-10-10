import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';

import { createEndpointProfile, type EndpointProfile } from '../../../src/domain/endpoint';
import type { ModelRecord } from '../../../src/domain/model';
import { useModelCatalog } from '../../../src/features/models/use-model-catalog';
import { fileCatalogStorage } from '../../../src/services/persistence/catalog-files';
import { REFRESH_INTERVAL_MS } from '../../../src/services/persistence/catalog-store';

// Variabel mock berawalan "mock" supaya factory jest.mock boleh menutupnya.
const mockCounter = { fetchCalls: 0 };
const mockResponder = {
  discover: async (): Promise<
    { ok: true; models: ModelRecord[] } | { ok: false; error: { message: string } }
  > => ({
    ok: true,
    models: [],
  }),
};

// Storage berkas diganti Map in-memory supaya jalur tulis snapshot tetap nyata.
const mockFiles = new Map<string, string>();

jest.mock('../../../src/services/persistence/catalog-files', () => ({
  readBundledDefaults: async () => ({ schemaVersion: 1, models: [] }),
  fileCatalogStorage: {
    readText: jest.fn(async (name: string) => mockFiles.get(name) ?? null),
    writeText: jest.fn(async (name: string, text: string) => void mockFiles.set(name, text)),
    copy: async (from: string, to: string) => {
      const value = mockFiles.get(from);
      if (value !== undefined) {
        mockFiles.set(to, value);
      }
    },
    exists: async (name: string) => mockFiles.has(name),
  },
}));

jest.mock('../../../src/services/credentials/store', () => ({
  credentialStore: { read: async () => 'sk-test' },
  createCredentialStore: () => ({ read: async () => 'sk-test' }),
}));

jest.mock('../../../src/services/transport/models', () => ({
  discoverModels: async () => {
    mockCounter.fetchCalls += 1;
    return mockResponder.discover();
  },
}));

const profile = createEndpointProfile({
  id: 'ep_1',
  name: 'AmanAI',
  baseUrl: 'https://api.amanai.dev/v1',
  credentialRef: 'cred_1',
});
const secondProfile = createEndpointProfile({
  id: 'ep_2',
  name: 'Second endpoint',
  baseUrl: 'https://second.test/v1',
  credentialRef: 'cred_2',
});

const MODEL: ModelRecord = {
  id: 'amanai/glm-5.3',
  displayName: 'amanai/glm-5.3',
  vendor: 'zai',
  ownedBy: 'amanai',
  description: 'Z.AI GLM-5.3',
  contextWindow: 1_000_000,
  maxOutputTokens: 128_000,
  reasoningEfforts: ['auto', 'low', 'high'],
  inputModalities: ['text'],
  capabilities: {
    streaming: 'unknown',
    tools: 'unknown',
    structuredOutput: 'unknown',
    nativeCompaction: 'unknown',
  },
  raw: { context_length: 1_000_000 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function seedSnapshot(endpoint: EndpointProfile, modelId: string) {
  const text = JSON.stringify({
    schemaVersion: 1,
    endpointId: endpoint.id,
    baseUrl: endpoint.baseUrl,
    fetchedAt: new Date().toISOString(),
    models: [{ id: modelId }],
  });
  mockFiles.set(`snapshot-${endpoint.id}.json`, text);
  return text;
}

async function setup() {
  return renderHook(() => useModelCatalog(profile));
}

describe('useModelCatalog', () => {
  beforeEach(() => {
    mockCounter.fetchCalls = 0;
    mockResponder.discover = async () => ({ ok: true, models: [MODEL] });
    mockFiles.clear();
    jest.mocked(fileCatalogStorage.readText).mockReset().mockImplementation(async (name) => mockFiles.get(name) ?? null);
    jest.mocked(fileCatalogStorage.writeText).mockReset().mockImplementation(async (name, text) => void mockFiles.set(name, text));
  });

  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it('settles an initial storage read rejection and allows reload recovery', async () => {
    jest.mocked(fileCatalogStorage.readText).mockRejectedValueOnce(new Error('Storage failed: sk-test-private'));
    const { result } = await setup();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.runtime).toBeNull();
    expect(result.current.refreshing).toBe(false);
    expect(result.current.failure).toMatchObject({ kind: 'cache-write' });
    expect(result.current.failure?.message).not.toContain('sk-test-private');
    expect(mockCounter.fetchCalls).toBe(0);

    seedSnapshot(profile, 'recovered-model');
    await act(async () => { await result.current.reload(); });

    expect(result.current.runtime?.models[0].id).toBe('recovered-model');
    expect(result.current.loading).toBe(false);
    expect(result.current.failure).toBeNull();
  });

  it('settles a reload storage rejection while preserving the current catalog', async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.runtime?.models).toHaveLength(1));
    const cached = result.current.runtime;
    jest.mocked(fileCatalogStorage.readText).mockRejectedValueOnce(new Error('Storage failed: sk-test-private'));

    await act(async () => { await result.current.reload(); });

    expect(result.current.runtime).toBe(cached);
    expect(result.current.loading).toBe(false);
    expect(result.current.failure).toMatchObject({ kind: 'cache-write' });
    expect(result.current.failure?.message).not.toContain('sk-test-private');
    await act(async () => { await result.current.reload(); });
    expect(result.current.failure).toBeNull();
  });

  it('settles an automatic refresh rejection and retries on the next interval', async () => {
    jest.useFakeTimers();
    mockResponder.discover = async () => { throw new Error('Discovery failed: sk-test-private'); };
    const { result } = await setup();

    expect(mockCounter.fetchCalls).toBe(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.failure).toMatchObject({ kind: 'network' });
    expect(result.current.failure?.message).not.toContain('sk-test-private');

    await act(async () => { await jest.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS); });
    expect(mockCounter.fetchCalls).toBe(2);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.failure).toMatchObject({ kind: 'network' });

    mockResponder.discover = async () => ({ ok: true, models: [MODEL] });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.failure).toBeNull();
    expect(result.current.runtime?.models).toHaveLength(1);
  });

  it('catches a public refresh rejection and preserves cached models', async () => {
    seedSnapshot(profile, 'cached-model');
    const { result } = await setup();
    const cached = result.current.runtime;
    mockResponder.discover = async () => { throw new Error('Discovery failed: sk-test-private'); };

    await act(async () => { await result.current.refresh(); });

    expect(result.current.runtime).toBe(cached);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.failure).toMatchObject({ kind: 'network' });
    expect(result.current.failure?.message).not.toContain('sk-test-private');
  });

  it.each(['resolve', 'reject'] as const)('ignores an old public refresh %s after an endpoint switch', async (completion) => {
    seedSnapshot(profile, 'old-model');
    seedSnapshot(secondProfile, 'new-model');
    const { result, rerender } = await renderHook(({ endpoint }: { endpoint: EndpointProfile }) => useModelCatalog(endpoint), {
      initialProps: { endpoint: profile },
    });
    const oldRequest = deferred<{ ok: true; models: ModelRecord[] }>();
    mockResponder.discover = () => oldRequest.promise;
    let oldRefresh!: Promise<void>;
    await act(async () => { oldRefresh = result.current.refresh(); });
    expect(result.current.refreshing).toBe(true);

    await rerender({ endpoint: secondProfile });
    expect(result.current.runtime?.models[0].id).toBe('new-model');
    const newRequest = deferred<{ ok: true; models: ModelRecord[] }>();
    mockResponder.discover = () => newRequest.promise;
    let newRefresh!: Promise<void>;
    await act(async () => { newRefresh = result.current.refresh(); });

    await act(async () => {
      if (completion === 'resolve') oldRequest.resolve({ ok: true, models: [MODEL] });
      else oldRequest.reject(new Error('Old request failed'));
      await oldRefresh;
    });

    expect(result.current.runtime?.models[0].id).toBe('new-model');
    expect(result.current.failure).toBeNull();
    expect(result.current.refreshing).toBe(true);
    await act(async () => {
      newRequest.resolve({ ok: true, models: [{ ...MODEL, id: 'new-refreshed-model' }] });
      await newRefresh;
    });
    expect(result.current.runtime?.models[0].id).toBe('new-refreshed-model');
    expect(result.current.refreshing).toBe(false);
  });

  it.each(['resolve', 'reject'] as const)('ignores an old reload %s after an endpoint switch', async (completion) => {
    const oldSnapshot = seedSnapshot(profile, 'old-model');
    seedSnapshot(secondProfile, 'new-model');
    const { result, rerender } = await renderHook(({ endpoint }: { endpoint: EndpointProfile }) => useModelCatalog(endpoint), {
      initialProps: { endpoint: profile },
    });
    const read = deferred<string | null>();
    jest.mocked(fileCatalogStorage.readText).mockImplementation((name) =>
      name === 'snapshot-ep_1.json' ? read.promise : Promise.resolve(mockFiles.get(name) ?? null),
    );
    let reload!: Promise<void>;
    await act(async () => { reload = result.current.reload(); });
    await rerender({ endpoint: secondProfile });

    await act(async () => {
      if (completion === 'resolve') read.resolve(oldSnapshot);
      else read.reject(new Error('Old read failed'));
      await reload;
    });

    expect(result.current.runtime?.models[0].id).toBe('new-model');
    expect(result.current.failure).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it.each(['setOverride', 'addCustomModel', 'applyOverridesText'] as const)('ignores an old %s completion after an endpoint switch', async (operation) => {
    seedSnapshot(profile, 'old-model');
    seedSnapshot(secondProfile, 'new-model');
    const { result, rerender } = await renderHook(({ endpoint }: { endpoint: EndpointProfile }) => useModelCatalog(endpoint), {
      initialProps: { endpoint: profile },
    });
    const write = deferred<void>();
    jest.mocked(fileCatalogStorage.writeText).mockImplementation(async (name, text) => {
      if (name === 'model-overrides.json.tmp') await write.promise;
      mockFiles.set(name, text);
    });
    let mutation!: Promise<unknown>;
    await act(async () => {
      mutation = operation === 'setOverride'
        ? result.current.setOverride('old-model', { displayName: 'Old endpoint updated' })
        : operation === 'addCustomModel'
          ? result.current.addCustomModel('old-custom')
          : result.current.applyOverridesText(JSON.stringify({
            schemaVersion: 1,
            endpoints: { ep_1: { models: { 'old-model': { displayName: 'Old endpoint updated' } } } },
          }));
    });
    expect(fileCatalogStorage.writeText).toHaveBeenCalledWith('model-overrides.json.tmp', expect.any(String));
    await rerender({ endpoint: secondProfile });

    await act(async () => { write.resolve(); await mutation; });

    expect(result.current.runtime?.models.map((model) => model.id)).toEqual(['new-model']);
    expect(result.current.failure).toBeNull();
  });

  it.each(['setOverride', 'addCustomModel', 'applyOverridesText'] as const)('still rejects %s write failures for the screen to handle', async (operation) => {
    seedSnapshot(profile, 'old-model');
    const { result } = await setup();
    const cached = result.current.runtime;
    const failure = new Error('Storage write failed');
    jest.mocked(fileCatalogStorage.writeText).mockRejectedValueOnce(failure);

    await act(async () => {
      const mutation = operation === 'setOverride'
        ? result.current.setOverride('old-model', { displayName: 'Updated model' })
        : operation === 'addCustomModel'
          ? result.current.addCustomModel('custom-model')
          : result.current.applyOverridesText(JSON.stringify({ schemaVersion: 1, endpoints: {} }));
      await expect(mutation).rejects.toBe(failure);
    });

    expect(result.current.runtime).toBe(cached);
    expect(result.current.failure).toBeNull();
  });

  it('mengisi katalog saat cold start dan mengizinkan refresh manual', async () => {
    const { result } = await setup();

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.runtime?.models).toHaveLength(1));
    expect(mockCounter.fetchCalls).toBe(1);
    expect(result.current.failure).toBeNull();
    expect(result.current.runtime?.models[0].contextWindow).toBe(1_000_000);

    let finishRefresh: (() => void) | undefined;
    mockResponder.discover = () =>
      new Promise((resolve) => {
        finishRefresh = () => resolve({ ok: true, models: [MODEL] });
      });

    let refresh: Promise<void> | undefined;
    await act(async () => {
      refresh = result.current.refresh();
      await Promise.resolve();
    });
    expect(result.current.refreshing).toBe(true);
    await waitFor(() => expect(finishRefresh).toBeDefined());
    await act(async () => {
      finishRefresh?.();
      await refresh;
    });

    expect(mockCounter.fetchCalls).toBe(2);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.runtime?.models).toHaveLength(1);
    expect(result.current.runtime?.models[0].contextWindow).toBe(1_000_000);
  });

  it('melaporkan kegagalan refresh tanpa menghapus katalog yang sudah ada', async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.runtime?.models).toHaveLength(1));

    mockResponder.discover = async () => ({
      ok: false as const,
      error: { message: 'Endpoint tidak dapat dihubungi.' },
    });
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.failure?.message).toBe('Endpoint tidak dapat dihubungi.');
    expect(result.current.runtime?.models).toHaveLength(1);
  });

  it('menggabungkan refresh manual yang berjalan bersamaan', async () => {
    const { result } = await setup();
    await waitFor(() => expect(result.current.runtime?.models).toHaveLength(1));

    let finishRefresh: (() => void) | undefined;
    mockResponder.discover = () =>
      new Promise((resolve) => {
        finishRefresh = () => resolve({ ok: true, models: [MODEL] });
      });

    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    await act(async () => {
      first = result.current.refresh();
      second = result.current.refresh();
      await Promise.resolve();
    });

    expect(second).toBeDefined();
    expect(first).toBeDefined();
    expect(mockCounter.fetchCalls).toBe(2);
    await waitFor(() => expect(finishRefresh).toBeDefined());
    await act(async () => {
      finishRefresh?.();
      await first;
    });
  });

});
