import { createEndpointProfile } from '../../../src/domain/endpoint';
import { clearAllData, type ClearAllDataDeps } from '../../../src/services/persistence/clear-all';

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
      loadAllEndpoints: async () => [endpoint],
      removeCredential: async (id) => { calls.push('remove ' + id); },
      clearCredentials: async () => { calls.push('credentials'); },
      clearEndpoint: async () => { calls.push('endpoint'); },
      clearConversation: async () => { calls.push('conversation'); },
      clearCatalog: () => calls.push('catalog'),
      clearTransfers: () => calls.push('transfers'),
      clearAttachments: () => calls.push('attachments'),
      clearWebTools: async () => { calls.push('web tools'); },
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
      'attachments',
      'web tools',
      'diagnostics',
    ]));
  });
});
