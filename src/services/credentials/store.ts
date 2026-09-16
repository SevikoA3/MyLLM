// Awalan tetap supaya key yang dipakai mudah dikenali saat audit storage.
const KEY_PREFIX = 'myllm.credential.';

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
  return {
    async save(credentialId: string, apiKey: string): Promise<void> {
      await (await resolve()).setItemAsync(KEY_PREFIX + credentialId, apiKey);
    },
    async read(credentialId: string): Promise<string | null> {
      return (await resolve()).getItemAsync(KEY_PREFIX + credentialId);
    },
    async remove(credentialId: string): Promise<void> {
      await (await resolve()).deleteItemAsync(KEY_PREFIX + credentialId);
    },
  };
}

export const credentialStore = createCredentialStore();
