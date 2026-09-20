import { createToolRegistry } from './registry';

const gateway = {
  provider: 'gateway' as const,
  baseUrl: 'https://gateway.example.com',
  token: 'gateway-secret-token',
  engines: 'bing',
};

const exa = {
  provider: 'exa' as const,
  token: 'exa-secret-key',
};

describe('toolRegistry', () => {
  it('keeps web tools unavailable without a complete gateway configuration', async () => {
    const registry = createToolRegistry(null, () => Date.UTC(2026, 8, 18, 0, 0, 0));

    expect(registry.definitions()).toHaveLength(1);
    expect(registry.find('web_search')).toBeNull();
    await expect(
      registry.find('get_current_time')?.execute({ timezone: 'Asia/Jakarta' }, new AbortController().signal),
    ).resolves.toContain('2026-09-18T00:00:00.000Z');
  });

  it('sends an encoded, authenticated gateway search and returns its raw JSON', async () => {
    const response = {
        query: 'ignored',
        results: [{
          url: 'https://example.com/article',
          title: 'Example article',
          snippet: 'Current information.',
          published_date: '2026-09-12',
          engine: 'bing',
        }],
        unresponsive_engines: [],
      };
    const request = jest.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    const registry = createToolRegistry(gateway, Date.now, request);

    const output = await registry.find('web_search')?.execute({
      query: 'open ai & safety',
      count: 1,
      time_range: 'week',
      language: 'id',
      categories: 'news',
    }, new AbortController().signal);

    expect(output).toBe(JSON.stringify(response));
    const url = new URL(request.mock.calls[0][0]);
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('open ai & safety');
    expect(url.searchParams.get('count')).toBe('1');
    expect(url.searchParams.get('time_range')).toBe('week');
    expect(url.searchParams.get('language')).toBe('id');
    expect(url.searchParams.get('categories')).toBe('news');
    expect(url.searchParams.get('engines')).toBe('bing');
    expect(request.mock.calls[0][1].headers.Authorization).toBe('Bearer gateway-secret-token');
    expect(output).not.toContain('gateway-secret-token');
  });

  it('sends the Exa Search request with only supported filters', async () => {
    const response = {
      results: [{
        title: 'Exa result',
        url: 'https://example.com/exa',
        publishedDate: '2026-09-12T00:00:00.000Z',
      }],
    };
    const request = jest.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    const registry = createToolRegistry(exa, () => Date.UTC(2026, 8, 18), request);

    await expect(registry.find('web_search')?.execute({
      query: 'open ai safety',
      count: 2,
      time_range: 'week',
    }, new AbortController().signal)).resolves.toBe(JSON.stringify(response));

    expect(registry.find('web_fetch')).toBeTruthy();
    expect(request.mock.calls[0][0]).toBe('https://api.exa.ai/search');
    expect(request.mock.calls[0][1].headers).toMatchObject({
      'x-api-key': 'exa-secret-key',
      'Content-Type': 'application/json',
    });
    expect(request.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      query: 'open ai safety',
      numResults: 2,
      startPublishedDate: '2026-09-11T00:00:00.000Z',
    });
    expect(registry.definitions().find((tool) => tool.name === 'web_search')?.parameters.properties).not.toHaveProperty('language');
  });

  it('fetches a page through Firecrawl Keyless without a credential', async () => {
    const response = {
      success: true,
      data: {
        markdown: 'Readable page text.',
        metadata: {
          title: 'Example article',
          sourceURL: 'https://example.com/article',
        },
      },
    };
    const request = jest.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    const output = await createToolRegistry(gateway, Date.now, request)
      .find('web_fetch')
      ?.execute({ url: 'https://example.com/article' }, new AbortController().signal);

    expect(output).toBe(JSON.stringify(response));
    expect(request.mock.calls[0][0]).toBe('https://api.firecrawl.dev/v2/scrape');
    expect(request.mock.calls[0][1].headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(request.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      url: 'https://example.com/article',
      formats: ['markdown'],
      onlyMainContent: true,
    });
  });

  it.each([
    [401, 'authentication failed'],
    [502, 'unavailable'],
    [504, 'timed out'],
  ])('returns concise web_search HTTP %s errors without the token', async (status, message) => {
    const request = jest.fn().mockResolvedValue(new Response('', { status }));
    const tool = createToolRegistry(gateway, Date.now, request).find('web_search');

    await expect(tool?.execute({ query: 'example' }, new AbortController().signal)).rejects.toThrow(message);
    await expect(tool?.execute({ query: 'example' }, new AbortController().signal)).rejects.not.toThrow('gateway-secret-token');
  });

  it.each([
    [401, 'authentication failed'],
    [413, 'too large'],
    [415, 'unsupported'],
    [502, 'unavailable'],
    [504, 'timed out'],
  ])('returns concise web_fetch HTTP %s errors', async (status, message) => {
    const request = jest.fn().mockResolvedValue(new Response('', { status }));
    const tool = createToolRegistry(gateway, Date.now, request).find('web_fetch');

    await expect(tool?.execute({ url: 'https://example.com' }, new AbortController().signal)).rejects.toThrow(message);
  });

  it('passes raw provider data through and rejects output that exceeds a declared cap', async () => {
    const malformed = jest.fn().mockResolvedValue(new Response('{bad json'));
    const tool = createToolRegistry(gateway, Date.now, malformed).find('web_search');
    await expect(tool?.execute({ query: 'example' }, new AbortController().signal)).resolves.toBe('{bad json');

    const oversized = jest.fn().mockResolvedValue(new Response(JSON.stringify({ results: 'x'.repeat(12 * 1024) })));
    const fetchTool = createToolRegistry(gateway, Date.now, oversized).find('web_search');
    await expect(fetchTool?.execute({ query: 'example' }, new AbortController().signal)).rejects.toThrow('12 KB');
  });

  it('rejects invalid tool input before making a request', async () => {
    const request = jest.fn();
    const registry = createToolRegistry(gateway, Date.now, request);

    await expect(registry.find('web_search')?.execute({ query: ' ', count: 11 }, new AbortController().signal)).rejects.toThrow('query');
    await expect(registry.find('web_fetch')?.execute({ url: 'file:///secret' }, new AbortController().signal)).rejects.toThrow('HTTP or HTTPS');
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects gateway-only Exa filters before making a request', async () => {
    const request = jest.fn();
    const tool = createToolRegistry(exa, Date.now, request).find('web_search');

    await expect(tool?.execute({ query: 'example', language: 'id' }, new AbortController().signal)).rejects.toThrow('Exa accepts only');
    expect(request).not.toHaveBeenCalled();
  });
});
