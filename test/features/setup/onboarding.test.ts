import { createEndpointProfile } from '../../../src/domain/endpoint';
import { createAppError } from '../../../src/domain/error';
import type { ModelRecord } from '../../../src/domain/model';
import type { SecureStoreLike } from '../../../src/services/credentials/store';
import type { KeyValueStore } from '../../../src/services/persistence/endpoint-store';
import { connectAndDiscover, profileFromInput, suggestName, type SetupInput } from '../../../src/features/setup/onboarding';

function fakeSecureStore() {
  const items = new Map<string, string>();
  const store: SecureStoreLike = {
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => {
      items.set(key, value);
    },
    deleteItemAsync: async (key) => {
      items.delete(key);
    },
  };
  return { store, items };
}

function fakeKeyValueStore(failing = false) {
  const items = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => {
      if (failing) {
        throw new Error('disk penuh');
      }
      items.set(key, value);
    },
    removeItemAsync: async (key) => items.delete(key),
  };
  return { store, items };
}

const model = { id: 'amanai/medium' } as ModelRecord;

function input(overrides: Partial<SetupInput> = {}): SetupInput {
  return {
    name: 'AmanAI',
    baseUrl: 'https://api.amanai.dev/v1',
    apiKey: 'sk-lokal',
    apiKeyChanged: true,
    authMode: 'bearer',
    protocol: 'responses',
    modelListPath: '/models',
    ...overrides,
  };
}

describe('suggestName', () => {
  it('mengambil hostname dari base URL yang valid', () => {
    expect(suggestName('https://api.amanai.dev/v1/')).toBe('api.amanai.dev');
  });

  it('kosong untuk base URL yang tidak valid', () => {
    expect(suggestName('api.amanai.dev')).toBe('');
  });
});

describe('profileFromInput', () => {
  it('memakai hostname sebagai nama dan menyimpan models path advanced', () => {
    const profile = profileFromInput(input({ name: '  ', modelListPath: '/v1/models' }), 'cred_1');
    expect(profile.name).toBe('api.amanai.dev');
    expect(profile.baseUrl).toBe('https://api.amanai.dev/v1');
    expect(profile.compat.modelListPath).toBe('/v1/models');
    expect(profile.compat.usagePath).toBe('/usage');
    expect(profile.credentialRef).toBe('cred_1');
  });

  it('menolak input yang bukan URL absolut', () => {
    expect(() => profileFromInput(input({ baseUrl: 'api.amanai.dev' }), null)).toThrow();
  });
});

describe('connectAndDiscover', () => {
  const seedCatalog = async () => ({ ok: true as const });

  it('menyimpan credential dan profile saat discovery berhasil', async () => {
    const secure = fakeSecureStore();
    const kv = fakeKeyValueStore();
    const result = await connectAndDiscover(input(), null, {
      secureStore: secure.store,
      keyValueStore: kv.store,
      discover: async () => ({ ok: true, models: [model] }),
      seedCatalog,
    });

    expect(result.ok).toBe(true);
    const credentialKey = [...secure.items.keys()][0];
    expect(credentialKey.startsWith('myllm.credential.')).toBe(true);
    const profiles = JSON.parse(kv.items.get('myllm.endpoints') ?? '[]') as { id: string; credentialRef: string }[];
    expect(profiles).toHaveLength(1);
    expect(profiles[0].credentialRef).toBe(credentialKey.replace('myllm.credential.', ''));
    expect(kv.items.get('myllm.activeModel.' + profiles[0].id)).toBe('amanai/medium');
    expect(kv.items.get('myllm.activeEndpoint')).toBe(profiles[0].id);
    expect(JSON.stringify([...kv.items.values()])).not.toContain('sk-lokal');
  });

  it('tidak menulis apa pun saat discovery gagal', async () => {
    const secure = fakeSecureStore();
    const kv = fakeKeyValueStore();
    const result = await connectAndDiscover(input(), null, {
      secureStore: secure.store,
      keyValueStore: kv.store,
      discover: async () => ({
        ok: false,
        error: createAppError({
          category: 'auth',
          message: 'ditolak',
          httpStatus: 401,
          providerCode: null,
          requestId: null,
          retryable: false,
          safeDetails: {},
        }),
      }),
      seedCatalog,
    });

    expect(result.ok).toBe(false);
    expect(secure.items.size).toBe(0);
    expect(kv.items.size).toBe(0);
  });

  it('memakai ulang credential dan id endpoint saat key tidak diubah', async () => {
    const secure = fakeSecureStore();
    await secure.store.setItemAsync('myllm.credential.cred_lama', 'sk-lokal');
    const existing = createEndpointProfile({
      id: 'ep_lama',
      name: 'AmanAI',
      baseUrl: 'https://api.amanai.dev/v1',
      credentialRef: 'cred_lama',
    });
    await connectAndDiscover(input({ apiKey: '', apiKeyChanged: false }), existing, {
      secureStore: secure.store,
      keyValueStore: fakeKeyValueStore().store,
      discover: async () => ({ ok: true, models: [model] }),
      seedCatalog,
    });

    let seenKey = '';
    const kv = fakeKeyValueStore();
    const result = await connectAndDiscover(input({ apiKey: '', apiKeyChanged: false }), existing, {
      secureStore: secure.store,
      keyValueStore: kv.store,
      discover: async (_profile, apiKey) => {
        seenKey = apiKey;
        return { ok: true, models: [model] };
      },
      seedCatalog,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.id).toBe('ep_lama');
      expect(result.profile.credentialRef).toBe('cred_lama');
    }
    expect(seenKey).toBe('sk-lokal');
    expect(secure.items.size).toBe(1);
  });

  it('menghapus credential lama saat key diganti', async () => {
    const secure = fakeSecureStore();
    await secure.store.setItemAsync('myllm.credential.cred_lama', 'sk-lama');
    const existing = createEndpointProfile({
      id: 'ep_lama',
      name: 'AmanAI',
      baseUrl: 'https://api.amanai.dev/v1',
      credentialRef: 'cred_lama',
    });

    const result = await connectAndDiscover(input({ apiKey: 'sk-baru', apiKeyChanged: true }), existing, {
      secureStore: secure.store,
      keyValueStore: fakeKeyValueStore().store,
      discover: async () => ({ ok: true, models: [model] }),
      seedCatalog,
    });

    expect(result.ok).toBe(true);
    expect(await secure.store.getItemAsync('myllm.credential.cred_lama')).toBeNull();
  });

  it('menghapus credential baru saat penyimpanan profile gagal', async () => {
    const secure = fakeSecureStore();
    const result = await connectAndDiscover(input(), null, {
      secureStore: secure.store,
      keyValueStore: fakeKeyValueStore(true).store,
      discover: async () => ({ ok: true, models: [model] }),
      seedCatalog,
    });

    expect(result.ok).toBe(false);
    expect(secure.items.size).toBe(0);
  });

  it('mempertahankan credential lama saat penyimpanan profile gagal', async () => {
    const secure = fakeSecureStore();
    await secure.store.setItemAsync('myllm.credential.cred_lama', 'sk-lama');
    const existing = createEndpointProfile({
      id: 'ep_lama',
      name: 'AmanAI',
      baseUrl: 'https://api.amanai.dev/v1',
      credentialRef: 'cred_lama',
    });

    const result = await connectAndDiscover(input({ apiKey: '', apiKeyChanged: false }), existing, {
      secureStore: secure.store,
      keyValueStore: fakeKeyValueStore(true).store,
      discover: async () => ({ ok: true, models: [model] }),
      seedCatalog,
    });

    expect(result.ok).toBe(false);
    expect(await secure.store.getItemAsync('myllm.credential.cred_lama')).toBe('sk-lama');
  });

  it('berhenti sebelum request saat credential lama tidak ada', async () => {
    const secure = fakeSecureStore();
    let called = false;
    const existing = createEndpointProfile({
      id: 'ep_lama',
      name: 'AmanAI',
      baseUrl: 'https://api.amanai.dev/v1',
      credentialRef: 'cred_hilang',
    });
    const result = await connectAndDiscover(input({ apiKey: '', apiKeyChanged: false }), existing, {
      secureStore: secure.store,
      discover: async () => {
        called = true;
        return { ok: true, models: [model] };
      },
      seedCatalog,
    });

    expect(called).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('auth');
    }
  });
});
