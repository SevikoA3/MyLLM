import type { EndpointProfile } from '../../domain/endpoint';

export type ClearAllDataDeps = {
  loadAllEndpoints: () => Promise<EndpointProfile[]>;
  removeCredential: (credentialId: string) => Promise<void>;
  clearCredentials: () => Promise<void>;
  clearEndpoint: () => Promise<void>;
  clearConversation: () => Promise<void>;
  clearCatalog: () => void;
  clearTransfers: () => void;
  clearAttachments: () => void;
  clearWebTools: () => Promise<void>;
  clearDiagnostics: () => Promise<void>;
};

export async function clearAllData(deps: ClearAllDataDeps): Promise<void> {
  // Hapus credential semua endpoint, bukan hanya yang aktif.
  const allEndpoints = await deps.loadAllEndpoints();
  for (const ep of allEndpoints) {
    if (ep.credentialRef !== null) {
      await deps.removeCredential(ep.credentialRef).catch(() => undefined);
    }
  }
  await deps.clearCredentials();
  await Promise.all([
    deps.clearEndpoint(),
    deps.clearConversation(),
    deps.clearDiagnostics(),
    deps.clearWebTools(),
  ]);
  deps.clearCatalog();
  deps.clearTransfers();
  deps.clearAttachments();
}
