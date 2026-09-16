#!/usr/bin/env node
// Fake OpenAI-compatible endpoint untuk contract test. Scenario dipilih lewat
// prefix path atau header X-Scenario, tanpa dependency di luar node:http.
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_PORT ?? 3999);
const HOST = process.env.FAKE_HOST ?? '127.0.0.1';
const EXPECTED_KEY = process.env.FAKE_API_KEY ?? 'fake-key';
const SLOW_MS = Number(process.env.FAKE_SLOW_MS ?? 3000);

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
  'responses-ok': () => json(200, nonStreamResponse('fake call 1')),
  'responses-401': () => json(401, { error: { message: 'Invalid API key', code: 'invalid_api_key' } }),
  'responses-402': () => json(402, { error: { message: 'Insufficient credits', code: 'insufficient_credits' } }),
  'responses-403': () => json(403, { error: { message: 'Model forbidden', code: 'model_forbidden' } }),
  'responses-404': () => json(404, { error: { message: 'Model not found', code: 'model_not_found' } }),
  'responses-429': () => json(429, { error: { message: 'Rate limit', code: 'rate_limit' }, retry_after: 1 }),
  'responses-500': () => json(500, { error: { message: 'Internal error' } }),
  'responses-502': () => json(502, { error: { message: 'Upstream error', code: 'upstream_error' } }),
  'responses-503': () => json(503, { error: { message: 'Overloaded', code: 'overloaded_error' } }),
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const scenario = scenarioFor(url.pathname, req.headers['x-scenario']);
  const body = await readBody(req);

  const authError = checkAuth(req.headers, body);
  if (authError !== null && !scenario.startsWith('models-401')) {
    send(res, json(401, authError));
    return;
  }

  if (scenario === '') {
    send(res, json(404, { error: { message: `Unknown path ${url.pathname}`, code: 'not_found' } }));
    return;
  }

  const handler = SCENARIOS[scenario];
  if (handler === undefined) {
    send(res, json(404, { error: { message: `Unknown scenario ${scenario}`, code: 'not_found' } }));
    return;
  }

  console.log(`${req.method} ${url.pathname} scenario=${scenario} auth=${authMode(req.headers)}`);
  send(res, await handler());
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

function nonStreamResponse(text) {
  return {
    id: 'resp_fake_0001',
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(res, response) {
  res.writeHead(response.status, response.headers);
  res.end(response.body);
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
