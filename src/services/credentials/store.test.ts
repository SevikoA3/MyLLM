import { createCredentialStore, type SecureStoreLike } from './store';

function fakeSecureStore() {
  const items = new Map<string, string>();
  const store: SecureStoreLike = {
    getItemAsync: async (key) => items.get(key) ?? null,
    setItemAsync: async (key, value) => {
      items.set(key, value);
    },
    deleteItemAsync: async (key) => {
      items.delete(key);
    },
  };
  return { store, items };
}

describe('credentialStore', () => {
  it('menyimpan API key dengan key berbasis credentialId', async () => {
    const { store, items } = fakeSecureStore();
    await createCredentialStore(store).save('cred_1', 'sk-rahasia');
    expect([...items.keys()]).toEqual(['myllm.credential.cred_1', 'myllm.credential.index']);
    expect(items.get('myllm.credential.cred_1')).toBe('sk-rahasia');
  });

  it('mengembalikan null untuk credential yang belum ada', async () => {
    const { store } = fakeSecureStore();
    expect(await createCredentialStore(store).read('cred_hilang')).toBeNull();
  });

  it('remove menghapus hanya credential yang diminta', async () => {
    const { store } = fakeSecureStore();
    const credentials = createCredentialStore(store);
    await credentials.save('cred_1', 'a');
    await credentials.save('cred_2', 'b');
    await credentials.remove('cred_1');
    expect(await credentials.read('cred_1')).toBeNull();
    expect(await credentials.read('cred_2')).toBe('b');
  });

  it('clearAll menghapus semua credential terdaftar', async () => {
    const { store } = fakeSecureStore();
    const credentials = createCredentialStore(store);
    await credentials.save('cred_1', 'a');
    await credentials.save('cred_2', 'b');
    await credentials.clearAll();
    expect(await credentials.read('cred_1')).toBeNull();
    expect(await credentials.read('cred_2')).toBeNull();
  });
});
