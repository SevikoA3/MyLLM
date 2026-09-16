// Contract test untuk fake endpoint. Jalankan dengan:
//   node --test tools/fake-server.test.mjs
// Tidak memakai Jest agar smoke test server tidak ikut memuat environment React Native.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

const PORT = 4123;
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = 'fake-key';
const HEADERS = { authorization: `Bearer ${KEY}` };

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

test('GET /v1/models mengembalikan standard model list dengan Bearer', async () => {
  const response = await fetch(`${BASE}/v1/models`, { headers: HEADERS });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.object, 'list');
  assert.deepEqual(
    body.data.map((model) => model.id),
    ['gpt-4o-mini', 'llama-3.3-70b'],
  );
});

test('GET /v1/models mengenali x-api-key', async () => {
  const response = await fetch(`${BASE}/v1/models`, { headers: { 'x-api-key': KEY } });
  assert.equal(response.status, 200);
});

test('enriched model list membawa context_length dan thinking', async () => {
  const response = await fetch(`${BASE}/v1/scenario/models-enriched`, { headers: HEADERS });
  const body = await response.json();
  assert.equal(body.data[0].context_length, 1000000);
  assert.deepEqual(body.data[0].thinking.slice(0, 3), ['auto', 'low', 'medium']);
});

test('scenario 401, 403, dan 404 dapat diminta lewat path', async () => {
  for (const scenario of ['models-401', 'models-403', 'models-404']) {
    const response = await fetch(`${BASE}/v1/scenario/${scenario}`, { headers: HEADERS });
    assert.equal(response.status, Number(scenario.slice(-3)));
    const body = await response.json();
    assert.equal(typeof body.error.message, 'string');
  }
});

test('credential salah menghasilkan 401 dengan provider code', async () => {
  const response = await fetch(`${BASE}/v1/models`, { headers: { authorization: 'Bearer wrong' } });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, 'invalid_api_key');
});

test('POST /v1/responses non-stream mengembalikan output text', async () => {
  const response = await fetch(`${BASE}/v1/responses`, {
    method: 'POST',
    headers: { ...HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'amanai/glm-5.3', input: 'halo', stream: false }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'completed');
  assert.equal(body.output[0].content[0].text, 'fake call 1');
  assert.equal(body.usage.input_tokens, 12);
});

test('scenario rate limit dan upstream error dapat didiagnosis', async () => {
  const rateLimited = await fetch(`${BASE}/v1/scenario/responses-429`, {
    method: 'POST',
    headers: HEADERS,
  });
  assert.equal(rateLimited.status, 429);
  assert.equal((await rateLimited.json()).error.code, 'rate_limit');

  const upstream = await fetch(`${BASE}/v1/scenario/responses-502`, { method: 'POST', headers: HEADERS });
  assert.equal(upstream.status, 502);
});

test('empty list dan invalid JSON tersedia sebagai fixture', async () => {
  const empty = await fetch(`${BASE}/v1/scenario/models-empty`, { headers: HEADERS });
  assert.deepEqual((await empty.json()).data, []);

  const invalid = await fetch(`${BASE}/v1/scenario/models-invalid-json`, { headers: HEADERS });
  const text = await invalid.text();
  assert.throws(() => JSON.parse(text));
});

test('slow response tetap dijawab', async () => {
  const started = Date.now();
  const response = await fetch(`${BASE}/v1/scenario/models-slow`, { headers: HEADERS });
  assert.equal(response.status, 200);
  assert.ok(Date.now() - started >= 200);
});

test('path yang tidak dikenal menghasilkan 404 yang jelas', async () => {
  const response = await fetch(`${BASE}/v1/tidak-ada`, { headers: HEADERS });
  assert.equal(response.status, 404);
});
