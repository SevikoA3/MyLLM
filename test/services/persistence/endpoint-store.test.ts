import { createEndpointProfile } from '../../../src/domain/endpoint';
import { createEndpointStore, type KeyValueStore } from '../../../src/services/persistence/endpoint-store';

function fakeKeyValueStore(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  const store: KeyValueStore = {
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => {
      items.set(key, value);
    },
    removeItemAsync: async (key) => items.delete(key),
  };
  return { store, items };
}

function transactionalStore(seed: Record<string, string> = {}, failKey = 'activeModel') {
  const base = fakeKeyValueStore(seed);
  const store: KeyValueStore = {
    ...base.store,
    runTransaction: async (task) => {
      const snapshot = new Map(base.items);
      const transaction: KeyValueStore = {
        getItemAsync: base.store.getItemAsync,
        setItemAsync: async (key, value) => {
          if ((failKey === 'activeModel' && key.startsWith('myllm.activeModel.')) || (failKey === 'activeEndpoint' && key === 'myllm.activeEndpoint')) {
            throw new Error('disk penuh');
          }
          await base.store.setItemAsync(key, value);
        },
        removeItemAsync: base.store.removeItemAsync,
      };
      try {
        await task(transaction);
      } catch (error) {
        base.items.clear();
        for (const [key, value] of snapshot) base.items.set(key, value);
        throw error;
      }
    },
  };
  return { store, items: base.items };
}

const profile = createEndpointProfile({
  id: 'ep_1',
  name: 'AmanAI',
  baseUrl: 'https://api.amanai.dev/v1',
  credentialRef: 'cred_1',
});

describe('endpointStore', () => {
  it('mengembalikan null saat belum ada endpoint', async () => {
    const { store } = fakeKeyValueStore();
    expect(await createEndpointStore(store).load()).toBeNull();
  });

  it('round trip profile tanpa menyimpan secret', async () => {
    const { store, items } = fakeKeyValueStore();
    const endpoints = createEndpointStore(store);
    await endpoints.save(profile);
    expect(await endpoints.load()).toEqual(profile);
    expect(items.get('myllm.activeEndpoint')).not.toContain('sk-');
  });

  it('menolak JSON rusak dan JSON yang tidak lolos schema', async () => {
    const broken = fakeKeyValueStore({ 'myllm.activeEndpoint': '{bukan json' });
    expect(await createEndpointStore(broken.store).load()).toBeNull();

    const wrongStatus = fakeKeyValueStore({ 'myllm.activeEndpoint': JSON.stringify({ id: 'ep_1' }) });
    expect(await createEndpointStore(wrongStatus.store).load()).toBeNull();
  });

  it('isolates endpoint profiles, model selections, and protocol cache', async () => {
    const { store } = fakeKeyValueStore();
    const endpoints = createEndpointStore(store);
    const second = createEndpointProfile({
      id: 'ep_2',
      name: 'Second',
      baseUrl: 'https://second.example/v1',
      credentialRef: 'cred_2',
    });
    await endpoints.save(profile);
    await endpoints.save(second);
    await endpoints.saveActiveModelId('ep_1', 'model-one');
    await endpoints.saveActiveModelId('ep_2', 'model-two');
    await endpoints.saveProtocol('ep_1', 'responses');
    await endpoints.saveProtocol('ep_2', 'chat-completions');

    expect(await endpoints.loadAll()).toEqual([profile, second]);
    expect(await endpoints.loadActiveModelId('ep_1')).toBe('model-one');
    expect(await endpoints.loadActiveModelId('ep_2')).toBe('model-two');
    expect(await endpoints.loadProtocol('ep_1')).toBe('responses');
    expect(await endpoints.loadProtocol('ep_2')).toBe('chat-completions');

    await endpoints.remove('ep_1');
    expect(await endpoints.loadAll()).toEqual([second]);
    expect(await endpoints.loadActiveModelId('ep_1')).toBeNull();
    expect(await endpoints.loadProtocol('ep_1')).toBeNull();
  });

  it('menyimpan dan membaca activeModelId', async () => {
    const { store } = fakeKeyValueStore();
    const endpoints = createEndpointStore(store);
    expect(await endpoints.loadActiveModelId('ep_1')).toBeNull();
    await endpoints.saveActiveModelId('ep_1', 'amanai/medium');
    expect(await endpoints.loadActiveModelId('ep_1')).toBe('amanai/medium');
  });

  it('mempertahankan registry saat transaksi save gagal', async () => {
    const { store, items } = transactionalStore({
      'myllm.endpoints': JSON.stringify([profile]),
      'myllm.activeEndpoint': profile.id,
    });
    const endpoints = createEndpointStore(store);
    const updated = { ...profile, name: 'Updated' };

    await expect(endpoints.save(updated, 'amanai/medium')).rejects.toThrow('disk penuh');
    expect(JSON.parse(items.get('myllm.endpoints') ?? '[]')).toEqual([profile]);
    expect(items.get('myllm.activeEndpoint')).toBe(profile.id);
    expect(items.has('myllm.activeModel.' + profile.id)).toBe(false);
  });

  it('menulis batch import dalam satu transaksi', async () => {
    const { store, items } = transactionalStore();
    const endpoints = createEndpointStore(store);
    const second = createEndpointProfile({ id: 'ep_2', name: 'Second', baseUrl: 'https://second.example/v1' });
    await endpoints.addMany([profile, second]);
    expect(JSON.parse(items.get('myllm.endpoints') ?? '[]')).toEqual([profile, second]);
  });

  it('mengembalikan registry saat batch import gagal', async () => {
    const { store, items } = transactionalStore({}, 'activeEndpoint');
    const endpoints = createEndpointStore(store);
    await expect(endpoints.addMany([profile])).rejects.toThrow('disk penuh');
    expect(items.has('myllm.endpoints')).toBe(false);
    expect(items.has('myllm.activeEndpoint')).toBe(false);
  });

  it('mengabaikan ID duplikat dalam satu batch', async () => {
    const { store, items } = fakeKeyValueStore();
    const endpoints = createEndpointStore(store);
    await endpoints.addMany([profile, profile]);
    expect(JSON.parse(items.get('myllm.endpoints') ?? '[]')).toEqual([profile]);
  });

  it('memigrasikan activeModelId lama ke endpoint aktif', async () => {
    const { store, items } = fakeKeyValueStore({
      'myllm.activeEndpoint': JSON.stringify(profile),
      'myllm.activeModelId': 'amanai/legacy',
    });
    const endpoints = createEndpointStore(store);
    expect(await endpoints.loadActiveModelId('ep_1')).toBe('amanai/legacy');
    expect(items.get('myllm.activeModel.ep_1')).toBe('amanai/legacy');
    expect(items.has('myllm.activeModelId')).toBe(false);
  });

  it('clear menghapus endpoint dan activeModelId', async () => {
    const { store } = fakeKeyValueStore();
    const endpoints = createEndpointStore(store);
    await endpoints.save(profile);
    await endpoints.saveActiveModelId('ep_1', 'amanai/medium');
    await endpoints.clear();
    expect(await endpoints.load()).toBeNull();
    expect(await endpoints.loadActiveModelId('ep_1')).toBeNull();
  });

  it('menyimpan, membaca, dan mereset protocol compatibility', async () => {
    const { store } = fakeKeyValueStore();
    const endpoints = createEndpointStore(store);
    await endpoints.saveProtocol('ep_1', 'chat-completions');
    expect(await endpoints.loadProtocol('ep_1')).toBe('chat-completions');
    await endpoints.clearProtocol('ep_1');
    expect(await endpoints.loadProtocol('ep_1')).toBeNull();
  });
});
