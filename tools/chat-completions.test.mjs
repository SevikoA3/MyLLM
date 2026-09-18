#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';

const PORT = 4132;
const BASE = `http://127.0.0.1:${PORT}/v1`;
const KEY = 'fake-key';

const { createEndpointProfile } = await import('../.tests-build/domain/endpoint.js');
const { buildSystemPrompt } = await import('../.tests-build/domain/system-prompt.js');
const { normalizeUsage } = await import('../.tests-build/domain/usage.js');
const {
  buildChatCompletionsBody,
  chatCompletionsClient,
} = await import('../.tests-build/services/transport/chat-completions.js');

const input = {
  modelId: 'amanai/glm-5.3',
  prompt: 'halo',
  history: [
    { role: 'user', content: 'sebelumnya' },
    { role: 'assistant', content: 'jawaban' },
    { role: 'user', content: 'halo' },
  ],
  previousResponseId: null,
  promptCacheKey: 'conv_1',
  maxOutputTokens: 321,
  reasoningEffort: 'high',
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

function profile(path, overrides = {}) {
  const base = createEndpointProfile({
    id: 'ep_chat',
    name: 'Fake',
    baseUrl: BASE,
  });
  const { compat: compatOverrides = {}, ...profileOverrides } = overrides;
  return {
    ...base,
    ...profileOverrides,
    compat: { ...base.compat, chatCompletionsPath: path, ...compatOverrides },
  };
}

test('request Chat Completions memetakan system, history, cap, reasoning, dan cache', () => {
  const actual = buildChatCompletionsBody(
    profile('/scenario/chat-echo', {
      compat: { chatReasoningSupport: 'supported', chatPromptCacheField: 'prompt_cache_key' },
    }),
    input,
  );
  assert.deepEqual(actual, {
    model: input.modelId,
    messages: [
      { role: 'system', content: buildSystemPrompt(input.modelId) },
      ...input.history,
    ],
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 321,
    reasoning_effort: 'high',
    prompt_cache_key: 'conv_1',
  });
});

test('field max token dapat dikonfigurasi per endpoint', () => {
  const body = buildChatCompletionsBody(
    profile('/scenario/chat-echo', { compat: { chatMaxTokensField: 'max_completion_tokens' } }),
    input,
  );
  assert.equal(body.max_completion_tokens, 321);
  assert.equal('max_tokens' in body, false);
});

test('stream delta dan usage dinormalisasi ke event internal', async () => {
  const events = [];
  const result = await chatCompletionsClient.send(profile('/scenario/chat-ok'), KEY, input, {
    onEvent: (event) => events.push(event),
  });
  assert.equal(result.ok, true);
  assert.equal(result.response.text, 'fake chat completion');
  assert.equal(result.response.usage.prompt_tokens, 12);
  assert.equal(result.response.usage.completion_tokens, 4);
  assert.equal(result.response.usage.input_tokens, 12);
  assert.equal(result.response.usage.output_tokens, 4);
  assert.equal(normalizeUsage(result.response.usage).cacheReadTokens, 3);
  assert.ok(events.some((event) => event.type === 'text.delta'));
  assert.ok(events.some((event) => event.type === 'usage.updated'));
  assert.equal(events.at(-1).type, 'response.completed');
});

test('tool_calls delta terfragmentasi dan tetap satu tool call', async () => {
  const result = await chatCompletionsClient.send(profile('/scenario/chat-tool-fragments'), KEY, input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.response.toolCalls, [
    {
      itemId: null,
      callId: 'call_chat_1',
      name: 'weather',
      arguments: '{"city":"Jakarta"}',
    },
  ]);
});
