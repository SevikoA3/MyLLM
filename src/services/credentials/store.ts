// Awalan tetap supaya key yang dipakai mudah dikenali saat audit storage.
const KEY_PREFIX = 'myllm.credential.';
const INDEX_KEY = 'myllm.credential.index';

export type SecureStoreLike = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

// Native module dimuat saat dipakai supaya helper murni di file ini tetap dapat
// diuji di luar React Native.
async function nativeSecureStore(): Promise<SecureStoreLike> {
  const SecureStore = await import('expo-secure-store');
  return {
    getItemAsync: (key) => SecureStore.getItemAsync(key),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
  };
}

// Hanya API key yang masuk ke sini, dengan key berbasis credentialId.
export function createCredentialStore(store?: SecureStoreLike) {
  async function resolve(): Promise<SecureStoreLike> {
    return store ?? (await nativeSecureStore());
  }
  async function readIndex(storage: SecureStoreLike): Promise<string[]> {
    const raw = await storage.getItemAsync(INDEX_KEY);
    if (raw === null) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [];
    } catch {
      return [];
    }
  }
  return {
    async save(credentialId: string, apiKey: string): Promise<void> {
      const storage = await resolve();
      await storage.setItemAsync(KEY_PREFIX + credentialId, apiKey);
      const ids = await readIndex(storage);
      if (!ids.includes(credentialId)) {
        await storage.setItemAsync(INDEX_KEY, JSON.stringify([...ids, credentialId]));
      }
    },
    async read(credentialId: string): Promise<string | null> {
      return (await resolve()).getItemAsync(KEY_PREFIX + credentialId);
    },
    async remove(credentialId: string): Promise<void> {
      const storage = await resolve();
      await storage.deleteItemAsync(KEY_PREFIX + credentialId);
      const ids = (await readIndex(storage)).filter((id) => id !== credentialId);
      if (ids.length === 0) {
        await storage.deleteItemAsync(INDEX_KEY);
      } else {
        await storage.setItemAsync(INDEX_KEY, JSON.stringify(ids));
      }
    },
    async clearAll(): Promise<void> {
      const storage = await resolve();
      const ids = await readIndex(storage);
      await Promise.all(ids.map((id) => storage.deleteItemAsync(KEY_PREFIX + id)));
      await storage.deleteItemAsync(INDEX_KEY);
    },
  };
}

export const credentialStore = createCredentialStore();
