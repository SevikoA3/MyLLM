import { useCallback, useEffect, useRef, useState } from 'react';

import type { EndpointProfile } from '../../domain/endpoint';
import type { ModelOverride } from '../../domain/catalog';
import {
  createCatalogRepository,
  REFRESH_INTERVAL_MS,
  type CatalogRuntime,
  type CatalogRepository,
  type OverridesPreview,
  type RefreshFailure,
} from '../../services/persistence/catalog-store';
import { fileCatalogStorage, readBundledDefaults } from '../../services/persistence/catalog-files';
import { credentialStore } from '../../services/credentials/store';
import { discoverModels } from '../../services/transport/models';

export type ModelCatalogState = {
  runtime: CatalogRuntime | null;
  loading: boolean;
  refreshing: boolean;
  failure: RefreshFailure | null;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  setOverride: (modelId: string, patch: ModelOverride | null) => Promise<void>;
  addCustomModel: (modelId: string) => Promise<void>;
  previewOverrides: (text: string) => Promise<OverridesPreview>;
  applyOverridesText: (text: string) => Promise<OverridesPreview>;
  exportOverrides: () => string;
};

/** Profile tanpa credentialRef tidak boleh menulis credential yatim ke Keystore. */
export function usesStoredCredential(profile: EndpointProfile | null): boolean {
  return profile !== null && profile.credentialRef !== null;
}

/**
 * Cache dibaca lebih dulu supaya picker langsung terisi, lalu GET /models berjalan
 * di background. Repository dipegang di ref supaya refresh tetap di-coalesce.
 */
export function useModelCatalog(profile: EndpointProfile | null): ModelCatalogState {
  const [runtime, setRuntime] = useState<CatalogRuntime | null>(null);
  // Tanpa profile tidak ada yang perlu dimuat, jadi state awal sudah final.
  const [loading, setLoading] = useState(profile !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<RefreshFailure | null>(null);
  const repositoryRef = useRef<CatalogRepository | null>(null);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const alive = useRef(true);

  const coalesceRefresh = useCallback((task: () => Promise<void>): Promise<void> => {
    if (refreshInFlight.current !== null) {
      return refreshInFlight.current;
    }
    const promise = task().finally(() => {
      if (refreshInFlight.current === promise) {
        refreshInFlight.current = null;
      }
    });
    refreshInFlight.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    alive.current = true;
    if (profile === null) {
      return () => {
        alive.current = false;
      };
    }

    const repository = createCatalogRepository({
      storage: fileCatalogStorage,
      readDefaults: readBundledDefaults,
      fetchModels: async ({ baseUrl, modelListPath }) => {
        const apiKey =
          profile.credentialRef === null ? null : await credentialStore.read(profile.credentialRef);
        // Tanpa credential tersimpan, refresh berhenti dengan pesan yang bisa ditindaklanjuti.
        if (apiKey === null) {
          return { ok: false, message: 'API key tidak tersedia di secure storage.' };
        }
        const result = await discoverModels(
          { ...profile, baseUrl, compat: { ...profile.compat, modelListPath } },
          apiKey,
        );
        return result.ok ? { ok: true, models: result.models } : { ok: false, message: result.error.message };
      },
    });
    repositoryRef.current = repository;

    let timer: ReturnType<typeof setInterval> | null = null;
    const run = async (): Promise<void> => {
      await coalesceRefresh(async () => {
        setRefreshing(true);
        const result = await repository.refresh({
          endpointId: profile.id,
          baseUrl: profile.baseUrl,
          modelListPath: profile.compat.modelListPath,
        });
        if (!alive.current) {
          return;
        }
        setRefreshing(false);
        setRuntime(result.catalog);
        setFailure(result.ok ? null : result.error);
      });
    };

    void (async () => {
      const cached = await repository.load(profile.id);
      if (!alive.current) {
        return;
      }
      setRuntime(cached);
      setLoading(false);
      // Cache dianggap segar selama TTL supaya cold start tidak selalu memanggil endpoint.
      const age =
        cached.lastFetchedAt === null ? Infinity : Date.now() - Date.parse(cached.lastFetchedAt);
      if (age >= REFRESH_INTERVAL_MS) {
        await run();
      }
      timer = setInterval(() => void run(), REFRESH_INTERVAL_MS);
    })();

    return () => {
      alive.current = false;
      refreshInFlight.current = null;
      repositoryRef.current = null;
      if (timer !== null) {
        clearInterval(timer);
      }
    };
  }, [coalesceRefresh, profile]);

  const refresh = useCallback(async () => {
    const repository = repositoryRef.current;
    if (repository === null || profile === null) {
      return;
    }
    await coalesceRefresh(async () => {
      setRefreshing(true);
      try {
        const result = await repository.refresh({
          endpointId: profile.id,
          baseUrl: profile.baseUrl,
          modelListPath: profile.compat.modelListPath,
        });
        if (alive.current) {
          setRuntime(result.catalog);
          setFailure(result.ok ? null : result.error);
        }
      } finally {
        if (alive.current) {
          setRefreshing(false);
        }
      }
    });
  }, [coalesceRefresh, profile]);

  const reload = useCallback(async () => {
    const repository = repositoryRef.current;
    if (repository === null || profile === null) {
      return;
    }
    const next = await repository.load(profile.id);
    if (alive.current) {
      setRuntime(next);
    }
  }, [profile]);

  const setOverride = useCallback(
    async (modelId: string, patch: ModelOverride | null) => {
      const repository = repositoryRef.current;
      if (repository === null || profile === null) {
        return;
      }
      await repository.setOverride(profile.id, modelId, patch);
      const next = repository.current();
      if (next !== null) {
        setRuntime({ ...next });
      }
    },
    [profile],
  );

  const addCustomModel = useCallback(
    async (modelId: string) => {
      const repository = repositoryRef.current;
      if (repository === null || profile === null) {
        return;
      }
      await repository.addCustomModel(profile.id, modelId);
      const next = repository.current();
      if (next !== null) {
        setRuntime({ ...next });
      }
    },
    [profile],
  );

  const previewOverrides = useCallback(
    async (text: string): Promise<OverridesPreview> => {
      const repository = repositoryRef.current;
      if (repository === null || profile === null) {
        return { ok: false, path: '$', message: 'Katalog belum siap.' };
      }
      return repository.previewOverrides(profile.id, text, profile);
    },
    [profile],
  );

  const applyOverridesText = useCallback(
    async (text: string): Promise<OverridesPreview> => {
      const repository = repositoryRef.current;
      if (repository === null || profile === null) {
        return { ok: false, path: '$', message: 'Katalog belum siap.' };
      }
      const result = await repository.applyOverridesText(profile.id, text, profile);
      const next = repository.current();
      if (result.ok && next !== null) {
        setRuntime({ ...next });
      }
      return result;
    },
    [profile],
  );

  const exportOverrides = useCallback(
    () => repositoryRef.current?.exportOverrides() ?? '{\n  "schemaVersion": 1,\n  "endpoints": {}\n}',
    [],
  );

  return {
    runtime,
    loading,
    refreshing,
    failure,
    reload,
    refresh,
    setOverride,
    addCustomModel,
    previewOverrides,
    applyOverridesText,
    exportOverrides,
  };
}
