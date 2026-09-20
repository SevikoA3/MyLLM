// Contract test gateway memakai client produksi yang sudah dikompilasi ke ESM.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';

const TOKEN = 'fake-gateway-token';
const requests = [];
let server;
let baseUrl;

before(async () => {
  server = createServer(async (request, response) => {
    const body = await new Promise((resolve) => {
      let value = '';
      request.on('data', (chunk) => { value += chunk; });
      request.on('end', () => resolve(value));
    });
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body,
    });
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (request.headers.authorization !== `Bearer ${TOKEN}`) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'invalid token' }));
      return;
    }
    if (request.method === 'GET' && request.url?.startsWith('/search?')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        query: 'open ai & safety',
        results: [{
          title: 'Gateway search result',
          url: 'https://example.com/source',
          snippet: 'Search text',
          published_date: '2026-09-20',
        }],
      }));
      return;
    }
    if (request.method === 'POST' && request.url === '/fetch') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        url: 'https://example.com/source',
        title: 'Gateway article',
        content_type: 'text/html',
        content: 'Readable extracted text.',
        truncated: false,
      }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => server?.close());

const { createToolRegistry } = await import('../.tests-build/services/tools/registry.js');
const { testWebGateway } = await import('../.tests-build/services/tools/gateway.js');

test('gateway search, fetch, and health use the production client contract', async () => {
  await testWebGateway(baseUrl);
  const registry = createToolRegistry({ baseUrl, token: TOKEN, engines: 'bing' });
  const signal = new AbortController().signal;
  const search = await registry.find('web_search').execute({
    query: 'open ai & safety',
    count: 1,
    time_range: 'week',
  }, signal);
  const fetched = await registry.find('web_fetch').execute({ url: 'https://example.com/source' }, signal);

  assert.deepEqual(JSON.parse(search), {
    query: 'open ai & safety',
    results: [{
      title: 'Gateway search result',
      url: 'https://example.com/source',
      snippet: 'Search text',
      published_date: '2026-09-20',
    }],
  });
  assert.equal(JSON.parse(fetched).content, 'Readable extracted text.');
  assert.equal(requests[0].authorization, undefined);
  assert.match(requests[1].url, /q=open\+ai\+%26\+safety/);
  assert.match(requests[1].url, /engines=bing/);
  assert.equal(requests[1].authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(requests[2].body), { url: 'https://example.com/source', max_chars: 3000 });
});
