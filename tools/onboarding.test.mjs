// Smoke test end-to-end onboarding terhadap fake endpoint. Jalankan dengan:
//   npm run test:onboarding
// Orkestrasi connectAndDiscover dijalankan dari kode produksi hasil kompilasi.
// Native module SecureStore dan SQLite tidak dapat dimuat Node, jadi contract test
// ini menyuntikkan store in-memory dan discovery nyata lewat HTTP.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

const PORT = 4133;
const BASE = `http://127.0.0.1:${PORT}/v1`;
const KEY = 'fake-key';

const { connectAndDiscover } = await import('../.tests-build/features/setup/onboarding.js');
const { seedCatalogCache } = await import('../.tests-build/services/persistence/catalog-seed.js');
const { parseModelList } = await import('../.tests-build/domain/model-list.js');

// Bentuk enriched field AmanAI yang dipakai seed katalog.
const AMANAI_RECORD = {
  id: 'amanai/glm-5.3',
  object: 'model',
  owned_by: 'amanai',
  vendor: 'zai',
  context_length: 1_000_000,
  max_output: 128_000,
  thinking: ['auto', 'low', 'medium', 'high'],
  input_modalities: ['text'],
};
const { discoverModels } = await import('../.tests-build/services/transport/models.js');
const { createCredentialStore } = await import('../.tests-build/services/credentials/store.js');
const {
  createEndpointStore,
} = await import('../.tests-build/services/persistence/endpoint-store.js');

let server;

before(async () => {
  server = spawn(process.execPath, ['tools/fake-oai-server.mjs'], {
    env: { ...process.env, FAKE_PORT: String(PORT), FAKE_API_KEY: KEY },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => {
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) {
        resolve();
      }
    });
  });
});

after(() => {
  server?.kill();
});

function memoryStores() {
  const secure = new Map();
  const kv = new Map();
  return {
    secure,
    kv,
    secureStore: {
      getItemAsync: async (key) => secure.get(key) ?? null,
      setItemAsync: async (key, value) => void secure.set(key, value),
      deleteItemAsync: async (key) => void secure.delete(key),
    },
    keyValueStore: {
      getItemAsync: async (key) => kv.get(key) ?? null,
      setItemAsync: async (key, value) => void kv.set(key, value),
      removeItemAsync: async (key) => kv.delete(key),
    },
  };
}

function setupInput(overrides = {}) {
  return {
    name: '',
    baseUrl: BASE,
    apiKey: KEY,
    apiKeyChanged: true,
    authMode: 'bearer',
    protocol: 'responses',
    modelListPath: '/models',
    ...overrides,
  };
}

function withDeps(stores) {
  return {
    secureStore: stores.secureStore,
    keyValueStore: stores.keyValueStore,
    discover: discoverModels,
    seedCatalog: async () => ({ ok: true }),
  };
}

test('fresh install tidak menyimpan apa pun sebelum pengguna connect', async () => {
  const stores = memoryStores();
  assert.equal(await createEndpointStore(stores.keyValueStore).load(), null);
  assert.equal(stores.secure.size, 0);
  assert.equal(stores.kv.size, 0);
});

test('connect sukses menyimpan key di secure store dan profile tanpa secret', async () => {
  const stores = memoryStores();
  const result = await connectAndDiscover(setupInput(), null, withDeps(stores));

  assert.equal(result.ok, true);
  assert.equal(stores.secure.size, 2);
  assert.equal([...stores.secure.values()][0], KEY);
  const serialized = [...stores.kv.entries()].map(([, value]) => value).join('|');
  assert.ok(!serialized.includes(KEY));
  assert.equal(stores.kv.get('myllm.activeModelId'), 'gpt-4o-mini');
  assert.equal((await createEndpointStore(stores.keyValueStore).load()).name, '127.0.0.1');
});

test('connect dengan x-api-key juga berhasil', async () => {
  const result = await connectAndDiscover(
    setupInput({ authMode: 'x-api-key' }),
    null,
    withDeps(memoryStores()),
  );
  assert.equal(result.ok, true);
});

test('credential salah tidak menyimpan apa pun dan tidak membocorkan key', async () => {
  const stores = memoryStores();
  const result = await connectAndDiscover(
    setupInput({ apiKey: 'sk-salah-abcdef' }),
    null,
    withDeps(stores),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'auth');
  assert.equal(stores.secure.size, 0);
  assert.equal(stores.kv.size, 0);
  assert.ok(!JSON.stringify(result.error).includes('sk-salah-abcdef'));
});

test('percobaan ulang memakai credential tersimpan tanpa key di form', async () => {
  const stores = memoryStores();
  const first = await connectAndDiscover(setupInput(), null, withDeps(stores));
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }

  const retry = await connectAndDiscover(
    setupInput({ apiKey: '', apiKeyChanged: false }),
    first.profile,
    withDeps(stores),
  );

  assert.equal(retry.ok, true);
  if (retry.ok) {
    assert.equal(retry.profile.id, first.profile.id);
    assert.equal(retry.profile.credentialRef, first.profile.credentialRef);
  }
  assert.equal(stores.secure.size, 2);
  assert.equal(await createCredentialStore(stores.secureStore).read(first.profile.credentialRef), KEY);
});

test('404 melaporkan URL final untuk saran /v1', async () => {
  const stores = memoryStores();
  const result = await connectAndDiscover(
    setupInput({ modelListPath: '/salah' }),
    null,
    withDeps(stores),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'not-found');
  assert.equal(result.error.safeDetails.url, `${BASE}/salah`);
  assert.equal(stores.kv.size, 0);
});

test('seed katalog menyimpan enriched field ke snapshot dan mempertahankan last-known-good', async () => {
  const files = new Map();
  const storage = {
    readText: async (name) => files.get(name) ?? null,
    writeText: async (name, text) => void files.set(name, text),
    copy: async (from, to) => {
      if (files.has(from)) {
        files.set(to, files.get(from));
      }
    },
    exists: async (name) => files.has(name),
  };
  const deps = { storage, readDefaults: async () => ({ schemaVersion: 1, models: [] }) };
  const parsed = parseModelList(JSON.stringify({ data: [AMANAI_RECORD] })).models;
  const profile = {
    id: 'ep_seed',
    baseUrl: 'https://api.amanai.dev/v1',
    compat: { modelListPath: '/models' },
  };

  assert.equal((await seedCatalogCache(profile, parsed, deps)).ok, true);
  const snapshot = JSON.parse(files.get('snapshot-ep_seed.json'));
  assert.equal(snapshot.models[0].contextWindow, 1_000_000);
  assert.equal(snapshot.models[0].maxOutputTokens, 128_000);
  assert.deepEqual(snapshot.models[0].reasoningEfforts, ['auto', 'low', 'medium', 'high']);

  // Daftar kosong tidak menimpa cache yang sudah ada.
  assert.equal((await seedCatalogCache(profile, [], deps)).ok, false);
  assert.equal(JSON.parse(files.get('snapshot-ep_seed.json')).models.length, 1);
});
