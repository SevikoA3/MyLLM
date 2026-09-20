import type { KeyValueStore } from './endpoint-store';
import { createWebToolsStore } from './web-tools-store';

function fakeKeyValueStore(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  const store: KeyValueStore = {
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => { items.set(key, value); },
    removeItemAsync: async (key) => items.delete(key),
  };
  return { store, items };
}

describe('webToolsStore', () => {
  it('stores normalized non-secret gateway settings', async () => {
    const { store, items } = fakeKeyValueStore();
    const settings = createWebToolsStore(store);

    await settings.save({ enabled: true, baseUrl: 'https://gateway.example.com/', engines: 'bing,brave' });

    expect(await settings.load()).toEqual({ enabled: true, baseUrl: 'https://gateway.example.com', engines: 'bing,brave' });
    expect(items.get('myllm.webTools')).not.toContain('Bearer');
  });

  it('uses disabled defaults for absent or malformed settings', async () => {
    expect(await createWebToolsStore(fakeKeyValueStore().store).load()).toEqual({ enabled: false, baseUrl: null, engines: 'bing' });
    expect(await createWebToolsStore(fakeKeyValueStore({ 'myllm.webTools': '{bad json' }).store).load()).toEqual({
      enabled: false,
      baseUrl: null,
      engines: 'bing',
    });
  });

  it('migrates saved gateway settings to the Bing default', async () => {
    expect(await createWebToolsStore(fakeKeyValueStore({
      'myllm.webTools': JSON.stringify({ enabled: true, baseUrl: 'https://gateway.example.com' }),
    }).store).load()).toEqual({
      enabled: true,
      baseUrl: 'https://gateway.example.com',
      engines: 'bing',
    });
  });
});
