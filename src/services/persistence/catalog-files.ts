import { Directory, File, Paths } from 'expo-file-system';

import defaults from '../../../assets/model-defaults.json';
import { CatalogDefaultsSchema, type CatalogDefaults } from '../../domain/catalog';
import {
  CATALOG_DIR,
  backupFileName,
  removeEndpointCatalogData,
  snapshotFileName,
  type CatalogStorage,
} from './catalog-store';

/**
 * Cache katalog disimpan di document directory (per-app-private) karena bertahan
 * setelah restart, sedangkan berkas sementara hanya lewat cache directory.
 */
function catalogDirectory(): Directory {
  const directory = new Directory(Paths.document, CATALOG_DIR);
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return directory;
}

function file(name: string): File {
  return new File(catalogDirectory(), name);
}

export const fileCatalogStorage: CatalogStorage = {
  async readText(name) {
    const target = file(name);
    return target.exists ? target.text() : null;
  },
  async writeText(name, text) {
    const target = file(name);
    // Tulis lewat temp lalu pindahkan supaya crash di tengah tulis tidak menyisakan JSON separuh.
    const temp = new File(catalogDirectory(), `${name}.writing`);
    temp.create({ overwrite: true });
    temp.write(text);
    temp.moveSync(target, { overwrite: true });
  },
  async copy(from, to) {
    const source = file(from);
    if (!source.exists) {
      return;
    }
    source.copySync(file(to), { overwrite: true });
  },
  async exists(name) {
    return file(name).exists;
  },
};

export async function readBundledDefaults(): Promise<CatalogDefaults> {
  return CatalogDefaultsSchema.parse(defaults);
}

export function clearCatalogCache(): void {
  const directory = new Directory(Paths.document, CATALOG_DIR);
  if (directory.exists) {
    directory.delete();
  }
}

/** Hapus snapshot, override, dan history model milik satu endpoint saja. */
export async function deleteCatalogForEndpoint(endpointId: string): Promise<void> {
  const snapshot = snapshotFileName(endpointId);
  const backup = backupFileName(endpointId);
  for (const name of [
    snapshot,
    backup,
    `${snapshot}.corrupt`,
    `${backup}.corrupt`,
    `${snapshot}.tmp`,
    `${snapshot}.writing`,
    `${snapshot}.tmp.writing`,
    `${backup}.writing`,
  ]) {
    const target = file(name);
    if (target.exists) {
      target.delete();
    }
  }
  await removeEndpointCatalogData(fileCatalogStorage, endpointId);
}
