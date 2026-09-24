// Bukti exit gate Phase 2: pengguna memasukkan endpoint HTTPS sembarang, key
// disimpan di secure store, dan model yang dikembalikan endpoint terlihat.
// Jalankan dengan: node tools/exit-gate.mjs
import { spawn } from 'node:child_process';

const PORT = 4141;
const BASE = `http://127.0.0.1:${PORT}/v1`;

const { connectAndDiscover } = await import('../.tests-build/features/setup/onboarding.js');
const { modelsUrl } = await import('../.tests-build/services/transport/models.js');

const server = spawn(process.execPath, ['tools/fake-oai-server.mjs'], {
  env: { ...process.env, FAKE_PORT: String(PORT), FAKE_API_KEY: 'fake-key' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve) => {
  server.stdout.on('data', (chunk) => {
    if (chunk.toString().includes('listening')) {
      resolve();
    }
  });
});

const secure = new Map();
const kv = new Map();
const secureStore = {
  getItemAsync: async (key) => secure.get(key) ?? null,
  setItemAsync: async (key, value) => void secure.set(key, value),
  deleteItemAsync: async (key) => void secure.delete(key),
};
const keyValueStore = {
  getItemAsync: async (key) => kv.get(key) ?? null,
  setItemAsync: async (key, value) => void kv.set(key, value),
  removeItemAsync: async (key) => kv.delete(key),
};

console.log('form   : baseUrl=' + BASE + ' authMode=bearer key=fake-key');
console.log('preview: GET ' + modelsUrl({
  baseUrl: BASE,
  compat: { modelListPath: '/models' },
}));

const result = await connectAndDiscover(
  {
    name: '',
    baseUrl: BASE,
    apiKey: 'fake-key',
    apiKeyChanged: true,
    authMode: 'bearer',
    modelListPath: '/models',
  },
  null,
  { secureStore, keyValueStore },
);

console.log('hasil  :', result.ok ? 'ok' : result.error.category + ' / ' + result.error.message);
console.log('profile:', kv.get('myllm.activeEndpoint'));
const savedProfile = result.ok ? result.profile : null;
console.log('model  :', savedProfile === null ? null : kv.get('myllm.activeModel.' + savedProfile.id));
console.log('secure :', [...secure.keys()].join(', '));
console.log('profile memuat key?', String(kv.get('myllm.activeEndpoint')).includes('fake-key'));

server.kill();
