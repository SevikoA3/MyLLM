import type { EndpointProfile } from '../../domain/endpoint';
import type { ModelRecord } from '../../domain/model';
import { type CatalogDefaults } from '../../domain/catalog';
import { normalizeModelRecord } from '../../domain/model-list';
import {
  snapshotFromModels,
  writeSnapshot,
  type CatalogStorage,
} from './catalog-store';

export type SeedCatalogDeps = {
  storage: CatalogStorage;
  readDefaults: () => Promise<CatalogDefaults>;
};

/**
 * Hasil discover pertama ditulis sebagai snapshot live supaya picker sesudah
 * onboarding berisi model nyata. Kegagalan tulis hanya berarti pengguna perlu
 * refresh katalog, jadi onboarding tidak dibatalkan.
 */
export async function seedCatalogCache(
  profile: EndpointProfile,
  models: ModelRecord[],
  deps: SeedCatalogDeps,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const valid = models.filter((model) => normalizeModelRecord(model) !== null);
  if (valid.length === 0) {
    return { ok: false, message: 'The model list is empty, so the cache was not written.' };
  }
  // Defaults dibaca supaya seed dan refresh memakai sumber katalog yang sama.
  await deps.readDefaults();
  return writeSnapshot(
    deps.storage,
    snapshotFromModels(profile.id, profile.baseUrl, valid, new Date().toISOString()),
  );
}
