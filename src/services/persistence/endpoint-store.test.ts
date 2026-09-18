import { createEndpointProfile } from '../../domain/endpoint';
import { createEndpointStore, type KeyValueStore } from './endpoint-store';

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

  it('menyimpan dan membaca activeModelId', async () => {
    const { store } = fakeKeyValueStore();
    const endpoints = createEndpointStore(store);
    expect(await endpoints.loadActiveModelId()).toBeNull();
    await endpoints.saveActiveModelId('amanai/medium');
    expect(await endpoints.loadActiveModelId()).toBe('amanai/medium');
  });

  it('clear menghapus endpoint dan activeModelId', async () => {
    const { store } = fakeKeyValueStore();
    const endpoints = createEndpointStore(store);
    await endpoints.save(profile);
    await endpoints.saveActiveModelId('amanai/medium');
    await endpoints.clear();
    expect(await endpoints.load()).toBeNull();
    expect(await endpoints.loadActiveModelId()).toBeNull();
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
