import type { KeyValueStore } from './endpoint-store';

async function nativeStorage(): Promise<KeyValueStore> {
  const { default: Storage } = await import('expo-sqlite/kv-store');
  return Storage;
}

/** Satu model aktif untuk endpoint aktif, memakai key yang sama dengan onboarding. */
export function createSettingsStore(store?: KeyValueStore) {
  async function resolve(): Promise<KeyValueStore> {
    return store ?? (await nativeStorage());
  }
  return {
    async loadActiveModelId(): Promise<string | null> {
      return (await resolve()).getItemAsync('myllm.activeModelId');
    },
    async saveActiveModelId(modelId: string): Promise<void> {
      await (await resolve()).setItemAsync('myllm.activeModelId', modelId);
    },
  };
}

export const settingsStore = createSettingsStore();
