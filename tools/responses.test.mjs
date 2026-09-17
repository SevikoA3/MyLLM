#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

const PORT = 4126;
const BASE = `http://127.0.0.1:${PORT}/v1`;
const KEY = 'fake-key';

const { createEndpointProfile } = await import('../.tests-build/domain/endpoint.js');
const { responsesClient, responsesUrl } = await import(
  '../.tests-build/services/transport/responses.js'
);

const profile = createEndpointProfile({
  id: 'ep_responses',
  name: 'Fake',
  baseUrl: BASE,
  credentialRef: 'cred_fake',
});
const input = {
  modelId: 'amanai/glm-5.3',
  prompt: 'halo',
  previousResponseId: null,
  maxOutputTokens: 1024,
};

let server;

before(async () => {
  server = spawn(process.execPath, ['tools/fake-oai-server.mjs'], {
    env: { ...process.env, FAKE_PORT: String(PORT), FAKE_API_KEY: KEY },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => {
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) resolve();
    });
  });
});

after(() => server?.kill());

test('request body minimal memakai model exact tanpa reasoning', async () => {
  const result = await responsesClient.send(scenario('responses-echo'), KEY, input);
  assert.equal(result.ok, true);
  const body = JSON.parse(result.response.text);
  assert.deepEqual(body, {
    model: 'amanai/glm-5.3',
    input: [{ role: 'user', content: 'halo' }],
    stream: false,
    max_output_tokens: 1024,
  });
  assert.equal('reasoning' in body, false);
});

test('dua turn memakai response id sebelumnya', async () => {
  const first = await responsesClient.send(profile, KEY, input);
  assert.equal(first.ok, true);
  assert.equal(first.response.text, 'fake call 1');

  const second = await responsesClient.send(profile, KEY, {
    ...input,
    prompt: 'lanjut',
    previousResponseId: first.response.id,
  });
  assert.equal(second.ok, true);
  assert.equal(second.response.text, 'fake call 2');
  assert.notEqual(second.response.id, first.response.id);
});

test('multiple output items dan reasoning summary diekstrak', async () => {
  const result = await responsesClient.send(scenario('responses-multiple'), KEY, input);
  assert.equal(result.ok, true);
  assert.equal(result.response.text, 'Bagian satu.\n\nBagian dua.');
  assert.equal(result.response.reasoningSummary, 'Ringkasan.');
});

test('response tanpa text menjadi schema error tanpa output palsu', async () => {
  const result = await responsesClient.send(scenario('responses-no-text'), KEY, input);
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'schema');
  assert.match(result.error.message, /tanpa output text/);
});

test('structured provider error mempertahankan kategori dan code', async () => {
  const result = await responsesClient.send(scenario('responses-402'), KEY, input);
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'billing');
  assert.equal(result.error.providerCode, 'insufficient_credits');
  assert.equal(result.error.httpStatus, 402);
});

test('401, 403, 429, dan 5xx dipetakan konsisten', async () => {
  const expected = [
    ['responses-401', 'auth', false],
    ['responses-403', 'auth', false],
    ['responses-429', 'rate-limit', true],
    ['responses-500', 'server', false],
    ['responses-503', 'server', true],
  ];
  for (const [name, category, retryable] of expected) {
    const result = await responsesClient.send(scenario(name), KEY, input);
    assert.equal(result.ok, false);
    assert.equal(result.error.category, category);
    assert.equal(result.error.retryable, retryable);
  }
});

test('URL Responses dibangun dari profile tanpa slash ganda', () => {
  assert.equal(responsesUrl(profile), `${BASE}/responses`);
});

function scenario(name) {
  return {
    ...profile,
    compat: { ...profile.compat, responsesPath: `/scenario/${name}` },
  };
}
