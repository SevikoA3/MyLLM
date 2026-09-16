import { EndpointProfileSchema, type EndpointProfile } from '../../domain/endpoint';

const ACTIVE_ENDPOINT_KEY = 'myllm.activeEndpoint';
const ACTIVE_MODEL_KEY = 'myllm.activeModelId';

export type KeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  removeItemAsync: (key: string) => Promise<boolean>;
};

// Native module dimuat saat dipakai supaya helper murni di file ini tetap dapat
// diuji di luar React Native.
async function nativeStorage(): Promise<KeyValueStore> {
  const { default: Storage } = await import('expo-sqlite/kv-store');
  return Storage;
}

/**
 * Satu endpoint pada MVP. Profil disimpan sebagai JSON tanpa secret di dalamnya,
 * dan profil yang tidak lolos schema diperlakukan sebagai tidak ada.
 */
export function createEndpointStore(store?: KeyValueStore) {
  async function resolve(): Promise<KeyValueStore> {
    return store ?? (await nativeStorage());
  }
  return {
    async load(): Promise<EndpointProfile | null> {
      const stored = await (await resolve()).getItemAsync(ACTIVE_ENDPOINT_KEY);
      if (stored === null) {
        return null;
      }
      try {
        const parsed = EndpointProfileSchema.safeParse(JSON.parse(stored));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    async save(profile: EndpointProfile): Promise<void> {
      await (await resolve()).setItemAsync(ACTIVE_ENDPOINT_KEY, JSON.stringify(profile));
    },
    async clear(): Promise<void> {
      await (await resolve()).removeItemAsync(ACTIVE_ENDPOINT_KEY);
    },
    async loadActiveModelId(): Promise<string | null> {
      return (await resolve()).getItemAsync(ACTIVE_MODEL_KEY);
    },
    async saveActiveModelId(modelId: string): Promise<void> {
      await (await resolve()).setItemAsync(ACTIVE_MODEL_KEY, modelId);
    },
  };
}

export const endpointStore = createEndpointStore();

