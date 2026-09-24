import {
  ConcreteProtocolSchema,
  EndpointProfileSchema,
  type ConcreteProtocol,
  type EndpointProfile,
} from '../../domain/endpoint';

const ACTIVE_ENDPOINT_KEY = 'myllm.activeEndpoint';
const ENDPOINTS_KEY = 'myllm.endpoints';
const ACTIVE_MODEL_KEY = 'myllm.activeModelId';
const ACTIVE_MODEL_PREFIX = 'myllm.activeModel.';
const PROTOCOL_CACHE_PREFIX = 'myllm.protocol.';
const KEY_VALUE_DATABASE = 'ExpoSQLiteStorage';
const KEY_VALUE_SCHEMA = 'CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT);';

export type KeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  removeItemAsync: (key: string) => Promise<boolean>;
  runTransaction?: (task: (storage: KeyValueStore) => Promise<void>) => Promise<void>;
};

let nativeStore: Promise<KeyValueStore> | null = null;
const listeners = new Set<() => void>();

export function subscribeEndpointChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyEndpointChanges(): void {
  for (const listener of listeners) listener();
}

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
  const createStore = (current: typeof database): KeyValueStore => ({
    async getItemAsync(key) {
      const row = await current.getFirstAsync<{ value: string | null }>(
        'SELECT value FROM storage WHERE key = ?;',
        key,
      );
      return row?.value ?? null;
    },
    async setItemAsync(key, value) {
      await current.runAsync(
        'INSERT INTO storage (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
        key,
        value,
      );
    },
    async removeItemAsync(key) {
      const result = await current.runAsync('DELETE FROM storage WHERE key = ?;', key);
      return result.changes > 0;
    },
  });
  const store = createStore(database);
  store.runTransaction = (task) =>
    database.withExclusiveTransactionAsync((transaction) => task(createStore(transaction)));
  return store;
}

/** Registry profile tanpa secret. Format lama satu-profile dibaca saat migrasi. */
export function createEndpointStore(store?: KeyValueStore) {
  async function resolve(): Promise<KeyValueStore> {
    return store ?? (await nativeStorage());
  }
  async function loadAll(source?: KeyValueStore): Promise<EndpointProfile[]> {
    const storage = source ?? (await resolve());
    const registry = await storage.getItemAsync(ENDPOINTS_KEY);
    if (registry !== null) {
      try {
        const parsed: unknown = JSON.parse(registry);
        if (Array.isArray(parsed)) {
          return parsed.flatMap((item) => {
            const result = EndpointProfileSchema.safeParse(item);
            return result.success ? [result.data] : [];
          });
        }
      } catch {
        return [];
      }
    }
    const legacy = await storage.getItemAsync(ACTIVE_ENDPOINT_KEY);
    if (legacy === null) return [];
    try {
      const parsed = EndpointProfileSchema.safeParse(JSON.parse(legacy));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  }
  return {
    async load(): Promise<EndpointProfile | null> {
      const storage = await resolve();
      const active = await storage.getItemAsync(ACTIVE_ENDPOINT_KEY);
      const all = await loadAll();
      const selected = all.find((profile) => profile.id === active);
      if (selected !== undefined) return selected;
      if (active === null) return null;
      try {
        const parsed = EndpointProfileSchema.safeParse(JSON.parse(active));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    loadAll,
    async addMany(profiles: EndpointProfile[]): Promise<void> {
      const storage = await resolve();
      const write = async (target: KeyValueStore) => {
        const all = await loadAll(target);
        const ids = new Set(all.map((item) => item.id));
        const additions = profiles.filter((profile) => {
          if (ids.has(profile.id)) return false;
          ids.add(profile.id);
          return true;
        });
        await target.setItemAsync(ENDPOINTS_KEY, JSON.stringify([...all, ...additions]));
        if (await target.getItemAsync(ACTIVE_ENDPOINT_KEY) === null && additions[0] !== undefined) {
          await target.setItemAsync(ACTIVE_ENDPOINT_KEY, additions[0].id);
        }
      };
      if (storage.runTransaction === undefined) await write(storage);
      else await storage.runTransaction(write);
      if (profiles.length > 0) notifyEndpointChanges();
    },
    async add(profile: EndpointProfile): Promise<void> {
      await this.addMany([profile]);
    },
    async save(profile: EndpointProfile, activeModelId?: string): Promise<void> {
      const storage = await resolve();
      const write = async (target: KeyValueStore) => {
        const all = (await loadAll(target)).filter((item) => item.id !== profile.id);
        await target.setItemAsync(ENDPOINTS_KEY, JSON.stringify([...all, profile]));
        await target.setItemAsync(ACTIVE_ENDPOINT_KEY, profile.id);
        if (activeModelId !== undefined) {
          await target.setItemAsync(ACTIVE_MODEL_PREFIX + profile.id, activeModelId);
        }
      };
      if (storage.runTransaction === undefined) await write(storage);
      else await storage.runTransaction(write);
      notifyEndpointChanges();
    },
    async select(endpointId: string): Promise<void> {
      const profile = (await loadAll()).find((item) => item.id === endpointId);
      if (profile === undefined) throw new Error('Endpoint profile was not found.');
      await (await resolve()).setItemAsync(ACTIVE_ENDPOINT_KEY, endpointId);
      notifyEndpointChanges();
    },
    async remove(endpointId: string): Promise<void> {
      const storage = await resolve();
      const write = async (target: KeyValueStore) => {
        const all = (await loadAll(target)).filter((item) => item.id !== endpointId);
        await target.removeItemAsync(PROTOCOL_CACHE_PREFIX + endpointId);
        await target.removeItemAsync(ACTIVE_MODEL_PREFIX + endpointId);
        if ((await target.getItemAsync(ACTIVE_ENDPOINT_KEY)) === endpointId) {
          await target.removeItemAsync(ACTIVE_MODEL_KEY);
          if (all[0] === undefined) await target.removeItemAsync(ACTIVE_ENDPOINT_KEY);
          else await target.setItemAsync(ACTIVE_ENDPOINT_KEY, all[0].id);
        }
        await target.setItemAsync(ENDPOINTS_KEY, JSON.stringify(all));
      };
      if (storage.runTransaction === undefined) await write(storage);
      else await storage.runTransaction(write);
      notifyEndpointChanges();
    },
    async clear(): Promise<void> {
      const storage = await resolve();
      const profiles = await loadAll();
      await storage.removeItemAsync(ACTIVE_ENDPOINT_KEY);
      await storage.removeItemAsync(ENDPOINTS_KEY);
      await storage.removeItemAsync(ACTIVE_MODEL_KEY);
      for (const profile of profiles) {
        await storage.removeItemAsync(PROTOCOL_CACHE_PREFIX + profile.id);
        await storage.removeItemAsync(ACTIVE_MODEL_PREFIX + profile.id);
      }
      notifyEndpointChanges();
    },
    async loadActiveModelId(endpointId: string): Promise<string | null> {
      const storage = await resolve();
      const current = await storage.getItemAsync(ACTIVE_MODEL_PREFIX + endpointId);
      if (current !== null) return current;
      const legacy = await storage.getItemAsync(ACTIVE_MODEL_KEY);
      if (legacy === null) return null;
      const active = await storage.getItemAsync(ACTIVE_ENDPOINT_KEY);
      let activeId = active;
      if (active !== null && active.startsWith('{')) {
        try {
          activeId = EndpointProfileSchema.parse(JSON.parse(active)).id;
        } catch {
          activeId = null;
        }
      }
      if (activeId !== endpointId) return null;
      const migrate = async (target: KeyValueStore) => {
        await target.setItemAsync(ACTIVE_MODEL_PREFIX + endpointId, legacy);
        await target.removeItemAsync(ACTIVE_MODEL_KEY);
      };
      if (storage.runTransaction === undefined) await migrate(storage);
      else await storage.runTransaction(migrate);
      return legacy;
    },
    async saveActiveModelId(endpointId: string, modelId: string): Promise<void> {
      await (await resolve()).setItemAsync(ACTIVE_MODEL_PREFIX + endpointId, modelId);
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
