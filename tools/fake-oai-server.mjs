#!/usr/bin/env node
// Fake OpenAI-compatible endpoint untuk contract test. Scenario dipilih lewat
// prefix path atau header X-Scenario, tanpa dependency di luar node:http.
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_PORT ?? 3999);
const HOST = process.env.FAKE_HOST ?? '127.0.0.1';
const EXPECTED_KEY = process.env.FAKE_API_KEY ?? 'fake-key';
const SLOW_MS = Number(process.env.FAKE_SLOW_MS ?? 3000);
let retryBeforeEventCalls = 0;

const STANDARD_MODELS = {
  object: 'list',
  data: [
    { id: 'gpt-4o-mini', object: 'model', created: 1728000000, owned_by: 'system' },
    { id: 'llama-3.3-70b', object: 'model', created: 1730000000, owned_by: 'system' },
  ],
};

const ENRICHED_MODELS = {
  object: 'list',
  data: [
    {
      id: 'amanai/glm-5.3',
      object: 'model',
      created: 1757900000,
      owned_by: 'amanai',
      thinking: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
      context_length: 1000000,
      max_output: 128000,
      vendor: 'zai',
      input_modalities: ['text'],
      description: 'Reference profile model.',
      pricing_version: 'v3',
      pricing: {
        currency: 'amanai_credit',
        unit: 'token',
        billing: 'per_token_floor',
        prompt: '5.6',
        completion: '28',
        input_cache_read: '1.4',
        minimum_request: '1000',
      },
    },
    {
      id: 'amanai/gpt-5.6-terra',
      object: 'model',
      owned_by: 'amanai',
      thinking: ['auto', 'minimal', 'low', 'medium', 'high'],
      context_length: 400000,
      max_output: 128000,
      vendor: 'openai',
      input_modalities: ['text', 'image'],
      description: 'Reasoning model.',
    },
  ],
};

// Entri rusak untuk menguji penolakan per record: id hilang, id bukan string,
// id duplikat, dan id kosong.
const MALFORMED_MODELS = {
  object: 'list',
  data: [
    { object: 'model', owned_by: 'system' },
    { id: 42, object: 'model' },
    { id: 'dup-model' },
    { id: 'dup-model' },
    { id: '   ' },
    { id: 'ok-model', context_length: 'not-a-number' },
  ],
};

const SCENARIOS = {
  'models-standard': () => json(200, STANDARD_MODELS),
  'models-enriched': () => json(200, ENRICHED_MODELS),
  'models-401': () => json(401, { error: { message: 'Invalid API key', type: 'invalid_request_error', code: 'invalid_api_key' } }),
  'models-403': () => json(403, { error: { message: 'Key revoked', code: 'key_revoked' } }),
  'models-404': () => json(404, { error: { message: 'Not found', code: 'not_found' } }),
  'models-empty': () => json(200, { object: 'list', data: [] }),
  'models-invalid-json': () => raw(200, '{"object":"list","data":[', 'application/json'),
  'models-malformed': () => json(200, MALFORMED_MODELS),
  'models-slow': () => sleep(SLOW_MS).then(() => json(200, STANDARD_MODELS)),
  // Redirect lintas origin dipakai untuk membuktikan credential tidak diikuti.
  'models-redirect': () => ({
    status: 302,
    headers: { location: 'https://example.invalid/v1/models' },
    body: '',
  }),
  'responses-ok': ({ body }) => {
    const turn = typeof body?.previous_response_id === 'string' ? 2 : 1;
    const text = `fake call ${turn}`;
    const id = `resp_fake_000${turn}`;
    return body?.stream === true ? streamResponse(text, id) : json(200, nonStreamResponse(text, id));
  },
  'responses-echo': ({ body }) =>
    body?.stream === true
      ? streamResponse(JSON.stringify(body), 'resp_fake_echo')
      : json(200, nonStreamResponse(JSON.stringify(body))),
  'responses-multiple': ({ body }) =>
    body?.stream === true
      ? sse([
          event('response.created', { response: { id: 'resp_fake_multiple' } }),
          event('response.output_text.delta', { delta: 'Bagian satu.' }),
          event('response.reasoning_summary_text.delta', { delta: 'Ringkasan.' }),
          event('response.output_text.delta', { delta: '\n\nBagian dua.' }),
          completed('resp_fake_multiple'),
          'data: [DONE]\n\n',
        ])
      : json(200, {
      id: 'resp_fake_multiple',
      object: 'response',
      status: 'completed',
      output: [
        { type: 'function_call', call_id: 'call_1', name: 'ignored' },
        { type: 'message', content: [{ type: 'output_text', text: 'Bagian satu.' }] },
        { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Ringkasan.' }] },
        { type: 'message', content: [{ type: 'output_text', text: 'Bagian dua.' }] },
      ],
    }),
  'responses-no-text': ({ body }) =>
    body?.stream === true
      ? sse([
          event('response.created', { response: { id: 'resp_fake_no_text' } }),
          completed('resp_fake_no_text'),
          'data: [DONE]\n\n',
        ])
      : json(200, {
      id: 'resp_fake_no_text',
      object: 'response',
      status: 'completed',
      output: [{ type: 'function_call', call_id: 'call_1', name: 'ignored' }],
    }),
  'responses-unknown-event': () =>
    sse([
      ': heartbeat\r\n\r\n',
      event('response.created', { response: { id: 'resp_fake_unknown' } }, '\r\n'),
      event('response.future.delta', { opaque: true }),
      event('response.output_text.delta', { delta: 'tetap berhasil' }),
      completed('resp_fake_unknown'),
      'data: [DONE]\n\n',
    ]),
  'responses-tool-fragments': () =>
    sse([
      event('response.created', { response: { id: 'resp_fake_tool' } }),
      event('response.output_item.added', {
        output_index: 0,
        item: { id: 'item_1', type: 'function_call', call_id: 'call_1', name: 'weather' },
      }),
      event('response.function_call_arguments.delta', {
        output_index: 0,
        item_id: 'item_1',
        delta: '{"city":',
      }),
      event('response.function_call_arguments.delta', {
        output_index: 0,
        item_id: 'item_1',
        delta: '"Jakarta"}',
      }),
      event('response.function_call_arguments.done', {
        output_index: 0,
        item_id: 'item_1',
      }),
      completed('resp_fake_tool'),
      'data: [DONE]\n\n',
    ]),
  'responses-abrupt-eof': () =>
    sse([
      event('response.created', { response: { id: 'resp_fake_partial' } }),
      event('response.output_text.delta', { delta: 'partial' }),
    ]),
  'responses-slow-before-token': () =>
    sse([
      { data: event('response.created', { response: { id: 'resp_fake_slow_before' } }), delay: SLOW_MS },
      event('response.output_text.delta', { delta: 'late' }),
      completed('resp_fake_slow_before'),
    ]),
  'responses-slow-after-partial': () =>
    sse([
      event('response.created', { response: { id: 'resp_fake_slow_after' } }),
      event('response.output_text.delta', { delta: 'partial' }),
      { data: completed('resp_fake_slow_after'), delay: SLOW_MS },
    ]),
  'responses-failed-event': () =>
    sse([
      event('response.created', { response: { id: 'resp_fake_failed' } }),
      event('response.failed', {
        response: { error: { message: 'Upstream stream failed', code: 'upstream_error' } },
      }),
    ]),
  'responses-retry-before-event': () => {
    retryBeforeEventCalls += 1;
    return retryBeforeEventCalls === 1
      ? {
          ...json(503, { error: { message: 'Overloaded', code: 'overloaded_error' } }),
          headers: { 'content-type': 'application/json', 'retry-after': '0' },
        }
      : streamResponse('berhasil setelah retry', 'resp_fake_retry');
  },
  'responses-401': () => json(401, { error: { message: 'Invalid API key', code: 'invalid_api_key' } }),
  'responses-402': () => json(402, { error: { message: 'Insufficient credits', code: 'insufficient_credits' } }),
  'responses-403': () => json(403, { error: { message: 'Model forbidden', code: 'model_forbidden' } }),
  'responses-404': () => json(404, { error: { message: 'Model not found', code: 'model_not_found' } }),
  'responses-429': () => json(429, { error: { message: 'Rate limit', code: 'rate_limit' }, retry_after: 1 }),
  'responses-500': () => json(500, { error: { message: 'Internal error' } }),
  'responses-502': () => json(502, { error: { message: 'Upstream error', code: 'upstream_error' } }),
  'responses-503': () => json(503, { error: { message: 'Overloaded', code: 'overloaded_error' } }),
  'chat-ok': () => chatStream('fake chat completion', 'chatcmpl_fake_0001'),
  'chat-echo': ({ body }) => chatStream(JSON.stringify(body), 'chatcmpl_fake_echo'),
  'chat-tool-fragments': () => chatToolStream(),
  'chat-401': () => json(401, { error: { message: 'Invalid API key', code: 'invalid_api_key' } }),
  'chat-404': () => json(404, { error: { message: 'Chat endpoint missing', code: 'not_found' } }),
  'chat-405': () => json(405, { error: { message: 'Method not allowed', code: 'method_not_allowed' } }),
  'chat-501': () => json(501, { error: { message: 'Not implemented', code: 'not_implemented' } }),
  'chat-only': ({ pathname }) =>
    pathname.endsWith('/chat/completions')
      ? chatStream('chat-only completion', 'chatcmpl_chat_only')
      : json(404, { error: { message: 'Responses unsupported', code: 'not_found' } }),
  'responses-only': ({ pathname }) =>
    pathname.endsWith('/responses')
      ? streamResponse('responses-only completion', 'resp_responses_only')
      : json(404, { error: { message: 'Chat Completions unsupported', code: 'not_found' } }),
  dual: ({ pathname }) =>
    pathname.endsWith('/chat/completions')
      ? chatStream('dual chat completion', 'chatcmpl_dual')
      : streamResponse('dual responses completion', 'resp_dual'),
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const scenario = scenarioFor(url.pathname, req.headers['x-scenario']);
  const body = await readBody(req);

  const authError = checkAuth(req.headers, body);
  if (authError !== null && !scenario.startsWith('models-401')) {
    await send(res, json(401, authError));
    return;
  }

  if (scenario === '') {
    await send(res, json(404, { error: { message: `Unknown path ${url.pathname}`, code: 'not_found' } }));
    return;
  }

  const handler = SCENARIOS[scenario];
  if (handler === undefined) {
    await send(res, json(404, { error: { message: `Unknown scenario ${scenario}`, code: 'not_found' } }));
    return;
  }

  console.log(`${req.method} ${url.pathname} scenario=${scenario} auth=${authMode(req.headers)}`);
  await send(res, await handler({ body, headers: req.headers, pathname: url.pathname }));
});

server.listen(PORT, HOST, () => {
  console.log(`fake-oai-server listening on http://${HOST}:${PORT}`);
  console.log(`scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
});

function scenarioFor(pathname, headerScenario) {
  if (typeof headerScenario === 'string' && headerScenario.length > 0) {
    return headerScenario;
  }
  const key = pathname.replace(/^\/+/, '').replace(/^v1\//, '').replace(/^scenario\//, '');
  if (key === 'models') {
    return 'models-standard';
  }
  if (key === 'responses') {
    return 'responses-ok';
  }
  if (key === 'chat/completions') {
    return 'chat-ok';
  }
  return key;
}

function checkAuth(headers, body) {
  const header = headers.authorization;
  if (typeof header === 'string') {
    return header === `Bearer ${EXPECTED_KEY}` ? null : { error: { message: 'Invalid token', code: 'invalid_api_key' } };
  }
  const apiKey = headers['x-api-key'];
  if (typeof apiKey === 'string') {
    return apiKey === EXPECTED_KEY ? null : { error: { message: 'Invalid x-api-key', code: 'invalid_api_key' } };
  }
  // Sebagian endpoint menerima key lewat body; dipakai hanya untuk fixture.
  if (typeof body?.api_key === 'string') {
    return body.api_key === EXPECTED_KEY ? null : { error: { message: 'Invalid body key', code: 'invalid_api_key' } };
  }
  return { error: { message: 'Missing credentials', code: 'invalid_auth' } };
}

function authMode(headers) {
  if (typeof headers.authorization === 'string') {
    return 'bearer';
  }
  if (typeof headers['x-api-key'] === 'string') {
    return 'x-api-key';
  }
  return 'body';
}

function nonStreamResponse(text, id = 'resp_fake_0001') {
  return {
    id,
    object: 'response',
    created_at: 1757900000,
    status: 'completed',
    model: 'amanai/glm-5.3',
    output: [
      {
        id: 'msg_fake_0001',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 4,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 16,
    },
  };
}

function json(status, payload) {
  return { status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) };
}

function raw(status, body, contentType) {
  return { status, headers: { 'content-type': contentType }, body };
}

function streamResponse(text, id) {
  const split = Math.max(1, Math.floor(text.length / 2));
  return sse([
    ': heartbeat\n\n',
    event('response.created', { response: { id, status: 'in_progress' } }),
    { data: event('response.output_text.delta', { delta: text.slice(0, split) }), delay: 15 },
    { data: event('response.output_text.delta', { delta: text.slice(split) }), delay: 15 },
    completed(id),
    'data: [DONE]\n\n',
  ]);
}

function chatStream(text, id) {
  const split = Math.max(1, Math.floor(text.length / 2));
  return sse([
    `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`,
    { data: `data: ${JSON.stringify({ id, choices: [{ index: 0, delta: { content: text.slice(0, split) }, finish_reason: null }] })}\n\n`, delay: 15 },
    { data: `data: ${JSON.stringify({ id, choices: [{ index: 0, delta: { content: text.slice(split) }, finish_reason: 'stop' }] })}\n\n`, delay: 15 },
    `data: ${JSON.stringify({ id, choices: [], usage: chatUsage() })}\n\n`,
    'data: [DONE]\n\n',
  ]);
}

function chatToolStream() {
  const id = 'chatcmpl_fake_tool';
  return sse([
    `data: ${JSON.stringify({ id, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_chat_1', type: 'function', function: { name: 'weather', arguments: '{"city":' } }] }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ id, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"Jakarta"}' } }] }, finish_reason: 'tool_calls' }] })}\n\n`,
    `data: ${JSON.stringify({ id, choices: [], usage: chatUsage() })}\n\n`,
    'data: [DONE]\n\n',
  ]);
}

function chatUsage() {
  return {
    prompt_tokens: 12,
    prompt_tokens_details: { cached_tokens: 3 },
    completion_tokens: 4,
    total_tokens: 16,
  };
}

function completed(id) {
  return event('response.completed', {
    response: {
      id,
      status: 'completed',
      usage: {
        input_tokens: 12,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 4,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 16,
      },
    },
  });
}

function event(type, payload, newline = '\n') {
  return `event: ${type}${newline}data: ${JSON.stringify({ type, ...payload })}${newline}${newline}`;
}

function sse(chunks) {
  return {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    chunks: chunks.map((chunk) =>
      typeof chunk === 'string' ? { data: chunk, delay: 0 } : chunk,
    ),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function send(res, response) {
  res.writeHead(response.status, response.headers);
  if (response.chunks === undefined) {
    res.end(response.body);
    return;
  }
  res.flushHeaders();
  for (const chunk of response.chunks) {
    if (chunk.delay > 0) {
      await sleep(chunk.delay);
    }
    if (res.destroyed || res.writableEnded) {
      return;
    }
    res.write(chunk.data);
  }
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
