// Contract test transport discovery. Jalankan dengan:
//   npm run test:transport
// Modul domain dan transport dijalankan sebagai ESM hasil kompilasi TypeScript,
// jadi perilaku fetch, redirect, dan parsing yang diuji adalah kode produksi.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

const PORT = 4131;
const BASE = `http://127.0.0.1:${PORT}/v1`;
const KEY = 'fake-key';

const { createEndpointProfile } = await import('../.tests-build/domain/endpoint.js');
const { discoverModels, modelsUrl } = await import('../.tests-build/services/transport/models.js');

let server;

before(async () => {
  server = spawn(process.execPath, ['tools/fake-oai-server.mjs'], {
    env: { ...process.env, FAKE_PORT: String(PORT), FAKE_API_KEY: KEY, FAKE_SLOW_MS: '250' },
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

function profile(overrides = {}) {
  return createEndpointProfile({
    id: 'ep_1',
    name: 'Fake',
    baseUrl: BASE,
    ...overrides,
  });
}

function withModelsPath(path) {
  const base = profile();
  return { ...base, compat: { ...base.compat, modelListPath: path } };
}

test('modelsUrl tidak menggandakan slash', () => {
  assert.equal(modelsUrl(profile()), `${BASE}/models`);
  assert.equal(modelsUrl(profile({ baseUrl: `${BASE}/` })), `${BASE}/models`);
});

test('Bearer dan x-api-key sama-sama diterima', async () => {
  const bearer = await discoverModels(profile(), KEY);
  assert.equal(bearer.ok, true);
  assert.deepEqual(
    bearer.models.map((model) => model.id),
    ['gpt-4o-mini', 'llama-3.3-70b'],
  );

  const header = await discoverModels(profile({ authMode: 'x-api-key' }), KEY);
  assert.equal(header.ok, true);
});

test('API key salah menghasilkan kategori auth tanpa membocorkan key', async () => {
  const result = await discoverModels(profile(), 'sk-bocor-1234567890');
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'auth');
  assert.equal(result.error.httpStatus, 401);
  assert.ok(!JSON.stringify(result.error).includes('sk-bocor-1234567890'));
});

test('404 memakai kategori not-found dan menyertakan URL final', async () => {
  const result = await discoverModels(withModelsPath('/tidak-ada'), KEY);
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'not-found');
  assert.equal(result.error.safeDetails.url, `${BASE}/tidak-ada`);
});

test('empty list tidak menghasilkan model palsu', async () => {
  const result = await discoverModels(withModelsPath('/scenario/models-empty'), KEY);
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'model');
});

test('record rusak ditolak per record tanpa menggagalkan list', async () => {
  const result = await discoverModels(withModelsPath('/scenario/models-malformed'), KEY);
  assert.equal(result.ok, true);
  // Id hilang, bukan string, kosong, dan duplikat dibuang tanpa menggagalkan list.
  assert.deepEqual(
    result.models.map((model) => model.id),
    ['dup-model', 'ok-model'],
  );
  assert.equal(result.models[1].contextWindow, null);
});

test('invalid JSON dilaporkan sebagai schema incompatibility', async () => {
  const result = await discoverModels(withModelsPath('/scenario/models-invalid-json'), KEY);
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'schema');
});

test('redirect tidak diikuti', async () => {
  const result = await discoverModels(withModelsPath('/scenario/models-redirect'), KEY);
  assert.equal(result.ok, false);
  assert.equal(result.error.httpStatus, 302);
  assert.match(result.error.message, /mengalihkan/);
});

test('response slow tetap selesai di bawah timeout 15 detik', async () => {
  const result = await discoverModels(withModelsPath('/scenario/models-slow'), KEY);
  assert.equal(result.ok, true);
});
