#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

const PORT = 4133;
const BASE = `http://127.0.0.1:${PORT}/v1`;
const KEY = 'fake-key';

const { createEndpointProfile } = await import('../../.tests-build/domain/endpoint.js');
const { chatCompletionsTransport } = await import(
  '../../.tests-build/services/transport/chat-completions.js'
);
const {
  createProtocolTransport,
  isProtocolFallbackError,
} = await import('../../.tests-build/services/transport/protocol.js');
const { responsesTransport } = await import('../../.tests-build/services/transport/responses.js');

const input = {
  modelId: 'amanai/glm-5.3',
  prompt: 'halo',
  previousResponseId: null,
  promptCacheKey: null,
  maxOutputTokens: 100,
  reasoningEffort: null,
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

function profile(protocol, scenario, id = `ep_${protocol}`) {
  const base = createEndpointProfile({ id, name: 'Fake', baseUrl: BASE, protocol });
  return {
    ...base,
    headers: { ...base.headers, 'X-Scenario': scenario },
  };
}

test('exit gate fake endpoint: Responses-only dan Chat-only', async () => {
  const responses = await responsesTransport.send(profile('responses', 'responses-only'), KEY, input);
  assert.equal(responses.ok, true);
  assert.match(responses.response.text, /responses-only/);

  const chat = await chatCompletionsTransport.send(profile('chat-completions', 'chat-only'), KEY, input);
  assert.equal(chat.ok, true);
  assert.match(chat.response.text, /chat-only/);
});

test('exit gate dual-protocol dan event sequence internal tetap sama', async () => {
  const responseEvents = [];
  const chatEvents = [];
  const responses = await responsesTransport.send(profile('responses', 'dual', 'ep_dual_r'), KEY, input, {
    onEvent: (event) => responseEvents.push(event.type),
  });
  const chat = await chatCompletionsTransport.send(profile('chat-completions', 'dual', 'ep_dual_c'), KEY, input, {
    onEvent: (event) => chatEvents.push(event.type),
  });
  assert.equal(responses.ok, true);
  assert.equal(chat.ok, true);
  assert.deepEqual(chatEvents, responseEvents);
});

test('Auto fallback 404 sebelum output lalu cache protocol yang berhasil', async () => {
  const cache = new Map();
  const transport = createProtocolTransport({
    cache: {
      loadProtocol: async (id) => cache.get(id) ?? null,
      saveProtocol: async (id, protocol) => cache.set(id, protocol),
    },
  });
  const endpoint = profile('auto', 'chat-only', 'ep_auto_cache');
  const first = await transport.send(endpoint, KEY, input);
  assert.equal(first.ok, true);
  assert.equal(cache.get(endpoint.id), 'chat-completions');

  const second = await transport.send(endpoint, KEY, input);
  assert.equal(second.ok, true);
  assert.match(second.response.text, /chat-only/);
  assert.equal(second.attempts, 1);
});

test('Auto tidak fallback untuk 400 atau setelah output parsial', async () => {
  let chatCalls = 0;
  const failure = (status, hadModelEvent = false) => ({
    ok: false,
    error: {
      category: 'request',
      message: 'error',
      httpStatus: status,
      providerCode: null,
      requestId: null,
      retryable: false,
      safeDetails: {},
    },
    cancelled: false,
    hadModelEvent,
    partial: { id: hadModelEvent ? 'partial' : null, text: hadModelEvent ? 'x' : null, reasoningSummary: null, toolCalls: [] },
    timing: { requestStart: 1, firstEvent: hadModelEvent ? 2 : null, firstVisibleToken: hadModelEvent ? 2 : null, completed: 3 },
    diagnostics: [],
    attempts: 1,
  });
  const make = (result) => ({
    send: async (_profile, _key, _input, options = {}) => {
      options.onEvent?.({ type: 'request.started', at: 1 });
      return result;
    },
  });

  const badRequest = createProtocolTransport({
    responses: make(failure(400)),
    chatCompletions: { send: async () => { chatCalls += 1; return failure(200); } },
    cache: { loadProtocol: async () => null, saveProtocol: async () => {} },
  });
  const requestResult = await badRequest.send(profile('auto', 'unused', 'ep_400'), KEY, input);
  assert.equal(requestResult.ok, false);
  assert.equal(chatCalls, 0);

  const partial = createProtocolTransport({
    responses: make(failure(404, true)),
    chatCompletions: { send: async () => { chatCalls += 1; return failure(200); } },
    cache: { loadProtocol: async () => null, saveProtocol: async () => {} },
  });
  const partialResult = await partial.send(profile('auto', 'unused', 'ep_partial'), KEY, input);
  assert.equal(partialResult.ok, false);
  assert.equal(chatCalls, 0);
});

test('hanya 404, 405, 501 sebelum output yang boleh fallback', () => {
  for (const status of [404, 405, 501]) {
    assert.equal(isProtocolFallbackError({ ...failureResult(status), cancelled: false }), true);
  }
  assert.equal(isProtocolFallbackError({ ...failureResult(400), cancelled: false }), false);
  assert.equal(isProtocolFallbackError({ ...failureResult(404), cancelled: false, hadModelEvent: true }), false);
  assert.equal(isProtocolFallbackError({ ...failureResult(404), cancelled: true }), false);
});

function failureResult(status) {
  return {
    ok: false,
    error: {
      category: 'request',
      message: 'error',
      httpStatus: status,
      providerCode: null,
      requestId: null,
      retryable: false,
      safeDetails: {},
    },
    cancelled: false,
    hadModelEvent: false,
    partial: { id: null, text: null, reasoningSummary: null, toolCalls: [] },
    timing: { requestStart: 1, firstEvent: null, firstVisibleToken: null, completed: 2 },
    diagnostics: [],
    attempts: 1,
  };
}
