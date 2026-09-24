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
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => server?.close());

const { createToolRegistry } = await import('../../.tests-build/services/tools/registry.js');
const { createFirecrawlClient, testWebGateway } = await import('../../.tests-build/services/tools/gateway.js');

test('gateway search and health use the production client contract', async () => {
  await testWebGateway(baseUrl);
  const registry = createToolRegistry({ provider: 'gateway', baseUrl, token: TOKEN, engines: 'bing' });
  const signal = new AbortController().signal;
  const search = await registry.find('web_search').execute({
    query: 'open ai & safety',
    count: 1,
    time_range: 'week',
  }, signal);

  assert.deepEqual(JSON.parse(search), {
    query: 'open ai & safety',
    results: [{
      title: 'Gateway search result',
      url: 'https://example.com/source',
      snippet: 'Search text',
      published_date: '2026-09-20',
    }],
  });
  assert.equal(requests[0].authorization, undefined);
  assert.match(requests[1].url, /q=open\+ai\+%26\+safety/);
  assert.match(requests[1].url, /engines=bing/);
  assert.equal(requests[1].authorization, `Bearer ${TOKEN}`);
});

test('Firecrawl Keyless fetch uses the production request contract', async () => {
  let requestUrl;
  let requestInit;
  const client = createFirecrawlClient(async (url, init) => {
    requestUrl = url;
    requestInit = init;
    return new Response(JSON.stringify({ success: true, data: { markdown: 'Readable extracted text.' } }));
  });

  const fetched = await client.fetch({ url: 'https://example.com/source' }, new AbortController().signal);

  assert.equal(JSON.parse(fetched).data.markdown, 'Readable extracted text.');
  assert.equal(requestUrl, 'https://api.firecrawl.dev/v2/scrape');
  assert.equal(requestInit.headers.authorization, undefined);
  assert.deepEqual(JSON.parse(requestInit.body), {
    url: 'https://example.com/source',
    formats: ['markdown'],
    onlyMainContent: true,
  });
});
