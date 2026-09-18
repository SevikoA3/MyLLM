import type { EndpointProfile } from '../../domain/endpoint';

export type ClearAllDataDeps = {
  loadEndpoint: () => Promise<EndpointProfile | null>;
  removeCredential: (credentialId: string) => Promise<void>;
  clearCredentials: () => Promise<void>;
  clearEndpoint: () => Promise<void>;
  clearConversation: () => Promise<void>;
  clearCatalog: () => void;
  clearTransfers: () => void;
  clearDiagnostics: () => Promise<void>;
};

export async function clearAllData(deps: ClearAllDataDeps): Promise<void> {
  const endpoint = await deps.loadEndpoint();
  if (endpoint?.credentialRef !== null && endpoint?.credentialRef !== undefined) {
    await deps.removeCredential(endpoint.credentialRef);
  }
  await deps.clearCredentials();
  await Promise.all([
    deps.clearEndpoint(),
    deps.clearConversation(),
    deps.clearDiagnostics(),
  ]);
  deps.clearCatalog();
  deps.clearTransfers();
}
