#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

const PORT = 4126;
const BASE = `http://127.0.0.1:${PORT}/v1`;
const KEY = 'fake-key';

const { createEndpointProfile } = await import('../.tests-build/domain/endpoint.js');
const { buildSystemPrompt } = await import('../.tests-build/domain/system-prompt.js');
const { buildResponsesBody, parseRetryAfter, responsesClient, responsesUrl } = await import(
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
  promptCacheKey: null,
  maxOutputTokens: 1024,
  reasoningEffort: null,
};

let server;

before(async () => {
  server = spawn(process.execPath, ['tools/fake-oai-server.mjs'], {
    env: { ...process.env, FAKE_PORT: String(PORT), FAKE_API_KEY: KEY, FAKE_SLOW_MS: '1000' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => {
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) resolve();
    });
  });
});

after(() => server?.kill());

test('request body minimal memakai model exact dan stream true', async () => {
  const result = await responsesClient.send(scenario('responses-echo'), KEY, input);
  assert.equal(result.ok, true);
  const body = JSON.parse(result.response.text);
  assert.deepEqual(body, {
    model: 'amanai/glm-5.3',
    input: [
      { role: 'system', content: buildSystemPrompt('amanai/glm-5.3') },
      { role: 'user', content: 'halo' },
    ],
    stream: true,
    max_output_tokens: 1024,
  });
  assert.equal('reasoning' in body, false);
});

test('request body dapat memakai seluruh history lokal', async () => {
  const history = [
    { role: 'user', content: 'Jelaskan X.' },
    { role: 'assistant', content: 'X adalah...' },
    { role: 'user', content: 'Kamu tahu tadi aku tanya apa?' },
  ];
  const result = await responsesClient.send(scenario('responses-echo'), KEY, {
    ...input,
    prompt: 'Kamu tahu tadi aku tanya apa?',
    history,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.response.text).input, [
    { role: 'system', content: buildSystemPrompt(input.modelId) },
    ...history,
  ]);
  assert.equal('previous_response_id' in JSON.parse(result.response.text), false);
});

test('later turns preserve the complete earlier input as an exact prefix', () => {
  const firstInput = {
    ...input,
    prompt: 'First question',
    history: [{ role: 'user', content: 'First question' }],
  };
  const secondInput = {
    ...input,
    prompt: 'Second question',
    history: [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Second question' },
    ],
  };
  const firstBody = buildResponsesBody(profile, firstInput);
  const secondBody = buildResponsesBody(profile, secondInput);
  assert.deepEqual(
    secondBody.input.slice(0, firstBody.input.length),
    firstBody.input,
  );
});

test('request body memakai prompt cache key stabil bila tersedia', async () => {
  const result = await responsesClient.send(scenario('responses-echo'), KEY, {
    ...input,
    promptCacheKey: 'conv_1',
  });
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(result.response.text).prompt_cache_key, 'conv_1');
});

test('system message is sent again with previous_response_id', async () => {
  const result = await responsesClient.send(scenario('responses-echo'), KEY, {
    ...input,
    prompt: 'lanjut',
    previousResponseId: 'resp_previous',
  });
  assert.equal(result.ok, true);
  const body = JSON.parse(result.response.text);
  assert.deepEqual(body.input[0], {
    role: 'system',
    content: buildSystemPrompt(input.modelId),
  });
  assert.equal(body.previous_response_id, 'resp_previous');
});

test('Auto menghapus field request kecuali endpoint meminta literal auto', async () => {
  const omitted = await responsesClient.send(scenario('responses-echo'), KEY, {
    ...input,
    maxOutputTokens: null,
    reasoningEffort: 'auto',
  });
  assert.equal(omitted.ok, true);
  const omittedBody = JSON.parse(omitted.response.text);
  assert.equal('max_output_tokens' in omittedBody, false);
  assert.equal('reasoning' in omittedBody, false);

  const literalProfile = scenario('responses-echo');
  literalProfile.compat.autoReasoningBehavior = 'literal-auto';
  const literal = await responsesClient.send(literalProfile, KEY, {
    ...input,
    reasoningEffort: 'auto',
  });
  assert.equal(literal.ok, true);
  assert.deepEqual(JSON.parse(literal.response.text).reasoning, { effort: 'auto' });
});

test('delta datang incremental dan dua turn memakai response id sebelumnya', async () => {
  const events = [];
  const first = await responsesClient.send(profile, KEY, input, {
    onEvent: (event) => events.push(event),
  });
  assert.equal(first.ok, true);
  assert.equal(first.response.text, 'fake call 1');
  assert.equal(events.filter((event) => event.type === 'text.delta').length, 2);
  assert.ok(first.timing.requestStart <= first.timing.firstEvent);
  assert.ok(first.timing.firstEvent <= first.timing.firstVisibleToken);
  assert.ok(first.timing.firstVisibleToken <= first.timing.completed);

  const second = await responsesClient.send(profile, KEY, {
    ...input,
    prompt: 'lanjut',
    previousResponseId: first.response.id,
  });
  assert.equal(second.ok, true);
  assert.equal(second.response.text, 'fake call 2');
  assert.notEqual(second.response.id, first.response.id);
});

test('multiple text item dan reasoning delta digabung', async () => {
  const result = await responsesClient.send(scenario('responses-multiple'), KEY, input);
  assert.equal(result.ok, true);
  assert.equal(result.response.text, 'Bagian satu.\n\nBagian dua.');
  assert.equal(result.response.reasoningSummary, 'Ringkasan.');
});

test('heartbeat diabaikan dan unknown event menjadi safe diagnostic', async () => {
  const result = await responsesClient.send(scenario('responses-unknown-event'), KEY, input);
  assert.equal(result.ok, true);
  assert.equal(result.response.text, 'tetap berhasil');
  assert.deepEqual(result.diagnostics, [
    { kind: 'unknown-event', eventType: 'response.future.delta' },
  ]);
});

test('fragmented tool arguments disimpan tanpa dieksekusi', async () => {
  const result = await responsesClient.send(scenario('responses-tool-fragments'), KEY, input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.response.toolCalls, [
    {
      itemId: 'item_1',
      callId: 'call_1',
      name: 'weather',
      arguments: '{"city":"Jakarta"}',
    },
  ]);
});

test('usage baru diterbitkan dari event completed', async () => {
  const types = [];
  const result = await responsesClient.send(profile, KEY, input, {
    onEvent: (event) => types.push(event.type),
  });
  assert.equal(result.ok, true);
  assert.equal(types.filter((type) => type === 'usage.updated').length, 1);
  assert.deepEqual(types.slice(-2), ['usage.updated', 'response.completed']);
  assert.equal(result.response.usage.total_tokens, 16);
});

test('abrupt EOF menghasilkan error dan mempertahankan partial text', async () => {
  const result = await responsesClient.send(scenario('responses-abrupt-eof'), KEY, input);
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'network');
  assert.equal(result.hadModelEvent, true);
  assert.equal(result.partial.text, 'partial');
  assert.equal(result.attempts, 1);
});

test('error body non-SSE tetap dipetakan sebelum parser stream', async () => {
  const result = await responsesClient.send(scenario('responses-402'), KEY, input);
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'billing');
  assert.equal(result.error.providerCode, 'insufficient_credits');
  assert.equal(result.error.httpStatus, 402);
});

test('cancel sebelum first token menutup request tanpa partial', async () => {
  const controller = new AbortController();
  const pending = responsesClient.send(scenario('responses-slow-before-token'), KEY, input, {
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 50);
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.hadModelEvent, false);
  assert.equal(result.partial.text, null);
});

test('cancel setelah partial text mempertahankan output', async () => {
  const controller = new AbortController();
  const result = await responsesClient.send(scenario('responses-slow-after-partial'), KEY, input, {
    signal: controller.signal,
    onEvent: (event) => {
      if (event.type === 'text.delta') controller.abort();
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.hadModelEvent, true);
  assert.equal(result.partial.text, 'partial');
});

test('retry otomatis hanya terjadi sebelum event model pertama', async () => {
  const result = await responsesClient.send(scenario('responses-retry-before-event'), KEY, input);
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.response.text, 'berhasil setelah retry');

  const partial = await responsesClient.send(scenario('responses-abrupt-eof'), KEY, input);
  assert.equal(partial.ok, false);
  assert.equal(partial.attempts, 1);
});

test('Retry-After diparse dengan batas aman', () => {
  assert.equal(parseRetryAfter('2'), 2000);
  assert.equal(parseRetryAfter('invalid'), null);
  assert.equal(parseRetryAfter('999999'), 60000);
});

test('response tanpa text atau tool menjadi schema error', async () => {
  const result = await responsesClient.send(scenario('responses-no-text'), KEY, input);
  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'schema');
  assert.match(result.error.message, /without output text/);
});

test('response.failed membawa provider code tanpa auto retry', async () => {
  const result = await responsesClient.send(scenario('responses-failed-event'), KEY, input);
  assert.equal(result.ok, false);
  assert.equal(result.error.providerCode, 'upstream_error');
  assert.equal(result.hadModelEvent, true);
  assert.equal(result.attempts, 1);
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
