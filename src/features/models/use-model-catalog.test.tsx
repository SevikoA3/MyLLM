import { act, cleanup, renderHook, waitFor } from '@testing-library/react-native';

import { createEndpointProfile } from '../../domain/endpoint';
import type { ModelRecord } from '../../domain/model';
import { useModelCatalog } from './use-model-catalog';

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

jest.mock('../../services/persistence/catalog-files', () => ({
  readBundledDefaults: async () => ({ schemaVersion: 1, models: [] }),
  fileCatalogStorage: {
    readText: async (name: string) => mockFiles.get(name) ?? null,
    writeText: async (name: string, text: string) => void mockFiles.set(name, text),
    copy: async (from: string, to: string) => {
      const value = mockFiles.get(from);
      if (value !== undefined) {
        mockFiles.set(to, value);
      }
    },
    exists: async (name: string) => mockFiles.has(name),
  },
}));

jest.mock('../../services/credentials/store', () => ({
  credentialStore: { read: async () => 'sk-test' },
  createCredentialStore: () => ({ read: async () => 'sk-test' }),
}));

jest.mock('../../services/transport/models', () => ({
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

async function setup() {
  mockCounter.fetchCalls = 0;
  mockResponder.discover = async () => ({ ok: true, models: [MODEL] });
  mockFiles.clear();
  return renderHook(() => useModelCatalog(profile));
}

describe('useModelCatalog', () => {
  afterEach(cleanup);

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
