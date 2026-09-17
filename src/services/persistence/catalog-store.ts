import * as z from 'zod';

import {
  CatalogDefaultsSchema,
  CatalogSnapshotSchema,
  HistoryModelsFileSchema,
  ModelOverridesFileSchema,
  type CatalogDefaults,
  type CatalogSnapshot,
  type ModelOverride,
  type ModelOverridesFile,
} from '../../domain/catalog';
import { mergeCatalog, type MergedModel } from '../../domain/catalog-merge';
import { joinEndpointPath } from '../../domain/endpoint';
import type { ModelRecord as ModelRecordType } from '../../domain/model';

export const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const CATALOG_DIR = 'catalog';

/** Layanan file dibuat sempit supaya test dapat memakai Map, bukan berkas nyata. */
export type CatalogStorage = {
  readText: (name: string) => Promise<string | null>;
  writeText: (name: string, text: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
  exists: (name: string) => Promise<boolean>;
};

export type CatalogCache = { loaded: boolean; snapshot: CatalogSnapshot | null };

export type RefreshResult =
  | { ok: true; catalog: CatalogRuntime }
  | { ok: false; catalog: CatalogRuntime; error: RefreshFailure };

export type RefreshFailure = { kind: 'cache-write' | 'network'; message: string };

export type CatalogRuntime = {
  models: MergedModel[];
  lastFetchedAt: string | null;
  overrides: ModelOverridesFile;
  defaults: CatalogDefaults;
};

export type RefreshInput = {
  endpointId: string;
  baseUrl: string;
  modelListPath: string;
};

export function snapshotFileName(endpointId: string): string {
  return `snapshot-${endpointId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
}

export function backupFileName(endpointId: string): string {
  return `snapshot-${endpointId.replace(/[^A-Za-z0-9_-]/g, '_')}.backup.json`;
}

export function modelsPathOf(profile: { baseUrl: string; compat: { modelListPath: string } }): string {
  return joinEndpointPath(profile.baseUrl, profile.compat.modelListPath);
}

function parseJson(text: string | null, schema: z.ZodType): unknown {
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function readSnapshot(storage: CatalogStorage, endpointId: string): Promise<CatalogSnapshot | null> {
  return readValidated(storage, snapshotFileName(endpointId), CatalogSnapshotSchema);
}

async function readValidated<T>(
  storage: CatalogStorage,
  name: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const parsed = schema.safeParse(parseJson(await storage.readText(name), schema));
  return parsed.success ? parsed.data : null;
}

/**
 * Tulis atomic: temp dulu, validasi hasil tulis, backup satu generasi, lalu rename.
 * Cache lama tidak pernah ditimpa oleh payload kosong atau invalid.
 */
export async function writeSnapshot(
  storage: CatalogStorage,
  snapshot: CatalogSnapshot,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const name = snapshotFileName(snapshot.endpointId);
  const temp = `${name}.tmp`;
  const backup = backupFileName(snapshot.endpointId);
  const serialized = JSON.stringify(snapshot);
  const validated = CatalogSnapshotSchema.safeParse(JSON.parse(serialized));
  if (!validated.success) {
    return { ok: false, message: 'Snapshot katalog tidak lolos validasi sebelum ditulis.' };
  }
  try {
    await storage.writeText(temp, serialized);
    const confirmed = CatalogSnapshotSchema.safeParse(parseJson(await storage.readText(temp), CatalogSnapshotSchema));
    if (!confirmed.success) {
      await storage.writeText(temp, '');
      return { ok: false, message: 'Snapshot katalog rusak setelah ditulis. Cache lama dipertahankan.' };
    }
    if (await storage.exists(name)) {
      await storage.copy(name, backup);
    }
    await storage.copy(temp, name);
    await storage.writeText(temp, '');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Gagal menulis cache katalog.',
    };
  }
}

async function readJsonFile<T>(
  storage: CatalogStorage,
  name: string,
  schema: z.ZodType<T>,
): Promise<T | null> {
  const fromDisk = await readValidated(storage, name, schema);
  if (fromDisk !== null) {
    return fromDisk;
  }
  if (!(await storage.exists(name))) {
    return null;
  }
  // File ada tetapi rusak: pindahkan ke .corrupt supaya tidak menimpa last-known-good.
  await storage.copy(name, `${name}.corrupt`);
  await storage.writeText(name, '');
  return null;
}

export function defaultSnapshot(endpointId: string, baseUrl: string, models: ModelRecordType[]): CatalogSnapshot {
  return CatalogSnapshotSchema.parse({
    schemaVersion: 1,
    endpointId,
    baseUrl,
    fetchedAt: new Date().toISOString(),
    models: models.map(snapshotFields),
  });
}

function snapshotFields(model: ModelRecordType): Record<string, unknown> {
  return {
    id: model.id,
    displayName: model.displayName,
    vendor: model.vendor,
    ownedBy: model.ownedBy,
    description: model.description,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens,
    reasoningEfforts: model.reasoningEfforts,
    inputModalities: model.inputModalities,
    capabilities: { ...model.capabilities },
    raw: model.raw,
  };
}

export function snapshotFromModels(
  endpointId: string,
  baseUrl: string,
  models: ModelRecordType[],
  fetchedAt: string,
): CatalogSnapshot {
  return CatalogSnapshotSchema.parse({
    schemaVersion: 1,
    endpointId,
    baseUrl,
    fetchedAt,
    models: models.map(snapshotFields),
  });
}

export function mergedFrom(
  defaults: CatalogDefaults,
  snapshot: CatalogSnapshot | null,
  overrides: ModelOverridesFile,
  endpointId: string,
  history: { id: string; displayName: string }[] = [],
): CatalogRuntime {
  const models = mergeCatalog({
    defaults: defaults.models,
    live: snapshot?.models ?? [],
    overrides: overrides.endpoints[endpointId]?.models ?? {},
    history,
  });
  return { models, lastFetchedAt: snapshot?.fetchedAt ?? null, overrides, defaults };
}

/** Model picker hanya menampilkan model yang belum dimatikan pengguna. */
export function pickerModels(runtime: CatalogRuntime): MergedModel[] {
  return runtime.models.filter((model) => model.enabled);
}

export type CatalogRepositoryDeps = {
  storage: CatalogStorage;
  readDefaults: () => Promise<CatalogDefaults>;
  fetchModels: (input: { baseUrl: string; modelListPath: string }) => Promise<
    { ok: true; models: ModelRecordType[] } | { ok: false; message: string }
  >;
  now?: () => number;
};

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;

/**
 * Satu instance per endpoint aktif. Cache dipisah per endpointId, jadi dua endpoint
 * pada base URL yang sama tidak saling menimpa.
 */
export function createCatalogRepository(deps: CatalogRepositoryDeps) {
  const now = deps.now ?? (() => Date.now());
  let runtime: CatalogRuntime | null = null;
  let refreshInFlight: Promise<RefreshResult> | null = null;

  async function readOverrides(): Promise<ModelOverridesFile> {
    const parsed = await readJsonFile(deps.storage, 'model-overrides.json', ModelOverridesFileSchema);
    return parsed ?? { schemaVersion: 1, endpoints: {} };
  }

  async function readHistory(endpointId: string): Promise<{ id: string; displayName: string }[]> {
    const parsed = await readJsonFile(deps.storage, 'history-models.json', HistoryModelsFileSchema);
    const entries = parsed?.endpoints[endpointId] ?? {};
    return Object.entries(entries).map(([id, value]) => ({ id, displayName: value.displayName }));
  }

  async function load(endpointId: string): Promise<CatalogRuntime> {
    const defaults = CatalogDefaultsSchema.parse(await deps.readDefaults());
    const [snapshot, overrides, history] = await Promise.all([
      readSnapshotWithBackup(endpointId),
      readOverrides(),
      readHistory(endpointId),
    ]);
    runtime = mergedFrom(defaults, snapshot, overrides, endpointId, history);
    return runtime;
  }

  async function readSnapshotWithBackup(endpointId: string): Promise<CatalogSnapshot | null> {
    const primary = await readSnapshot(deps.storage, endpointId);
    if (primary !== null) {
      return primary;
    }
    return readValidated(deps.storage, backupFileName(endpointId), CatalogSnapshotSchema);
  }

  /** Satu GET /models untuk semua pemanggil yang datang bersamaan. */
  function refresh(input: RefreshInput): Promise<RefreshResult> {
    if (refreshInFlight !== null) {
      return refreshInFlight;
    }
    refreshInFlight = runRefresh(input).finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function runRefresh(input: RefreshInput): Promise<RefreshResult> {
    const current = runtime ?? (await load(input.endpointId));
    const fetched = await deps.fetchModels({
      baseUrl: input.baseUrl,
      modelListPath: input.modelListPath,
    });
    if (!fetched.ok) {
      return { ok: false, catalog: current, error: { kind: 'network', message: fetched.message } };
    }
    const models = uniqueDiscovered(fetched.models);
    if (models === null) {
      return {
        ok: false,
        catalog: current,
        error: { kind: 'network', message: 'Response model list kosong atau tidak valid. Cache lama dipakai.' },
      };
    }
    const snapshot = snapshotFromModels(
      input.endpointId,
      input.baseUrl,
      models,
      new Date(now()).toISOString(),
    );
    const written = await writeSnapshot(deps.storage, snapshot);
    if (!written.ok) {
      return { ok: false, catalog: current, error: { kind: 'cache-write', message: written.message } };
    }
    runtime = mergedFrom(current.defaults, snapshot, current.overrides, input.endpointId);
    return { ok: true, catalog: runtime };
  }

  return {
    load,
    refresh,
    current: () => runtime,
    applyOverrides,
    async setOverride(
      endpointId: string,
      modelId: string,
      patch: ModelOverride | null,
    ): Promise<void> {
      const overrides = await readOverrides();
      const bucket = overrides.endpoints[endpointId]?.models ?? {};
      if (patch === null) {
        delete bucket[modelId];
      } else {
        bucket[modelId] = { ...bucket[modelId], ...patch };
      }
      const next: ModelOverridesFile = {
        schemaVersion: 1,
        endpoints: {
          ...overrides.endpoints,
          [endpointId]: { models: bucket },
        },
      };
      await applyOverrides(endpointId, next);
    },
  };

  /** File override selalu dijaga berpasangan dengan backup satu generasi. */
  async function applyOverrides(endpointId: string, next: ModelOverridesFile): Promise<void> {
    const validated = ModelOverridesFileSchema.parse(next);
    const name = 'model-overrides.json';
    if (await deps.storage.exists(name)) {
      await deps.storage.copy(name, `${name}.backup`);
    }
    await deps.storage.writeText(name, JSON.stringify(validated));
    if (runtime !== null) {
      runtime = mergedFrom(
        runtime.defaults,
        await readSnapshotWithBackup(endpointId),
        validated,
        endpointId,
      );
    }
  }
}

function uniqueDiscovered(entries: ModelRecordType[]): ModelRecordType[] | null {
  const models: ModelRecordType[] = [];
  const seen = new Set<string>();
  for (const model of entries) {
    if (seen.has(model.id)) {
      continue;
    }
    seen.add(model.id);
    models.push(model);
  }
  return models.length === 0 ? null : models;
}

/** Cache ikon tidak boleh menggagalkan refresh katalog. */
export async function materializeIcons(
  storage: CatalogStorage,
  models: ModelRecordType[],
): Promise<void> {
  for (const model of models) {
    const url = typeof model.raw.icon_url === 'string' ? model.raw.icon_url : null;
    if (url === null) {
      continue;
    }
    const name = `icon-${model.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    if (await storage.exists(name)) {
      continue;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal, redirect: 'manual' });
      clearTimeout(timer);
      if (!response.ok) {
        continue;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      await storage.writeText(name, bytesToBase64(bytes));
    } catch {
      continue;
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
