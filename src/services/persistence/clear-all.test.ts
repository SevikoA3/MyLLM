import { createEndpointProfile } from '../../domain/endpoint';
import { clearAllData, type ClearAllDataDeps } from './clear-all';

describe('clearAllData', () => {
  it('menghapus credential aktif, storage, database, cache, dan diagnostics', async () => {
    const calls: string[] = [];
    const endpoint = createEndpointProfile({
      id: 'ep_1',
      name: 'Endpoint',
      baseUrl: 'https://example.com/v1',
      credentialRef: 'cred_1',
    });
    const deps: ClearAllDataDeps = {
      loadEndpoint: async () => endpoint,
      removeCredential: async (id) => { calls.push('remove ' + id); },
      clearCredentials: async () => { calls.push('credentials'); },
      clearEndpoint: async () => { calls.push('endpoint'); },
      clearConversation: async () => { calls.push('conversation'); },
      clearCatalog: () => calls.push('catalog'),
      clearTransfers: () => calls.push('transfers'),
      clearDiagnostics: async () => { calls.push('diagnostics'); },
    };

    await clearAllData(deps);

    expect(calls).toEqual(expect.arrayContaining([
      'remove cred_1',
      'credentials',
      'endpoint',
      'conversation',
      'catalog',
      'transfers',
      'diagnostics',
    ]));
  });
});
