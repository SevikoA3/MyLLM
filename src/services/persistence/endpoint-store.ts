import {
  ConcreteProtocolSchema,
  EndpointProfileSchema,
  type ConcreteProtocol,
  type EndpointProfile,
} from '../../domain/endpoint';

const ACTIVE_ENDPOINT_KEY = 'myllm.activeEndpoint';
const ACTIVE_MODEL_KEY = 'myllm.activeModelId';
const PROTOCOL_CACHE_PREFIX = 'myllm.protocol.';
const KEY_VALUE_DATABASE = 'ExpoSQLiteStorage';
const KEY_VALUE_SCHEMA = 'CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT);';

export type KeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  removeItemAsync: (key: string) => Promise<boolean>;
};

let nativeStore: Promise<KeyValueStore> | null = null;

// API publik SQLite dipakai agar storage tidak bergantung pada entrypoint
// kv-store yang gagal dimuat pada expo-sqlite 57.0.3.
export function nativeStorage(): Promise<KeyValueStore> {
  if (nativeStore === null) {
    nativeStore = createNativeStorage().catch((error) => {
      nativeStore = null;
      throw error;
    });
  }
  return nativeStore;
}

async function createNativeStorage(): Promise<KeyValueStore> {
  const { openDatabaseAsync } = await import('expo-sqlite');
  const database = await openDatabaseAsync(KEY_VALUE_DATABASE);
  await database.execAsync(KEY_VALUE_SCHEMA);
  return {
    async getItemAsync(key) {
      const row = await database.getFirstAsync<{ value: string | null }>(
        'SELECT value FROM storage WHERE key = ?;',
        key,
      );
      return row?.value ?? null;
    },
    async setItemAsync(key, value) {
      await database.runAsync(
        'INSERT INTO storage (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
        key,
        value,
      );
    },
    async removeItemAsync(key) {
      const result = await database.runAsync('DELETE FROM storage WHERE key = ?;', key);
      return result.changes > 0;
    },
  };
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
      const storage = await resolve();
      const profile = await this.load();
      await storage.removeItemAsync(ACTIVE_ENDPOINT_KEY);
      await storage.removeItemAsync(ACTIVE_MODEL_KEY);
      if (profile !== null) {
        await storage.removeItemAsync(PROTOCOL_CACHE_PREFIX + profile.id);
      }
    },
    async loadActiveModelId(): Promise<string | null> {
      return (await resolve()).getItemAsync(ACTIVE_MODEL_KEY);
    },
    async saveActiveModelId(modelId: string): Promise<void> {
      await (await resolve()).setItemAsync(ACTIVE_MODEL_KEY, modelId);
    },
    async loadProtocol(endpointId: string): Promise<ConcreteProtocol | null> {
      const value = await (await resolve()).getItemAsync(PROTOCOL_CACHE_PREFIX + endpointId);
      const parsed = ConcreteProtocolSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
    async saveProtocol(endpointId: string, protocol: ConcreteProtocol): Promise<void> {
      await (await resolve()).setItemAsync(PROTOCOL_CACHE_PREFIX + endpointId, protocol);
    },
    async clearProtocol(endpointId: string): Promise<void> {
      await (await resolve()).removeItemAsync(PROTOCOL_CACHE_PREFIX + endpointId);
    },
  };
}

export const endpointStore = createEndpointStore();
