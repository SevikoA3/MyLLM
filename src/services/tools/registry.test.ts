import { createToolRegistry } from './registry';

describe('toolRegistry', () => {
  it('exposes app-owned read-only tools', async () => {
    const registry = createToolRegistry(() => Date.UTC(2026, 8, 18, 0, 0, 0));

    expect(registry.definitions()).toHaveLength(2);
    expect(registry.find('web_search')).toMatchObject({ risk: 'read-only', approval: 'ask' });
    expect(registry.find('missing')).toBeNull();
    await expect(
      registry.find('get_current_time')?.execute({ timezone: 'Asia/Jakarta' }, new AbortController().signal),
    ).resolves.toContain('2026-09-18T00:00:00.000Z');
  });

  it('normalizes FreeSerp web results with bounded input', async () => {
    const request = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          index: 'web',
          results: [
            {
              url: 'https://example.com/article',
              title: 'Example article',
              snippet: 'Current information.',
              published_at: '2026-09-12',
            },
          ],
        }),
      ),
    );
    const registry = createToolRegistry(() => Date.UTC(2026, 8, 18), request);

    const output = await registry
      .find('web_search')
      ?.execute({ query: 'example', count: 1, recencyDays: 7 }, new AbortController().signal);

    expect(JSON.parse(output ?? '')).toEqual({
      provider: 'FreeSerp',
      query: 'example',
      untrusted: true,
      results: [
        {
          title: 'Example article',
          url: 'https://example.com/article',
          snippet: 'Current information.',
          publishedAt: '2026-09-12',
          source: 'example.com',
        },
      ],
    });
    const url = new URL(request.mock.calls[0][0]);
    expect(url.searchParams.get('index')).toBe('web');
    expect(url.searchParams.get('published_from')).toBe('2026-09-11');
  });

  it('rejects invalid input and a FreeSerp fallback', async () => {
    const request = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, index: 'sites', engine_fallback: true, results: [] })),
    );
    const registry = createToolRegistry(Date.now, request);
    const tool = registry.find('web_search');
    const signal = new AbortController().signal;

    await expect(tool?.execute({ query: ' ', count: 11 }, signal)).rejects.toThrow('query');
    await expect(tool?.execute({ query: 'example' }, signal)).rejects.toThrow('unsupported response');
  });

  it('rejects a response above its explicit byte cap', async () => {
    const request = jest.fn().mockResolvedValue(new Response('x'.repeat(64 * 1024 + 1)));
    const tool = createToolRegistry(Date.now, request).find('web_search');

    await expect(tool?.execute({ query: 'example' }, new AbortController().signal)).rejects.toThrow(
      '64 KB',
    );
  });

  it('rejects normalized output above its explicit byte cap', async () => {
    const request = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          index: 'web',
          results: [{ url: 'https://example.com', title: 'x'.repeat(12 * 1024), snippet: null }],
        }),
      ),
    );
    const tool = createToolRegistry(Date.now, request).find('web_search');

    await expect(tool?.execute({ query: 'example' }, new AbortController().signal)).rejects.toThrow(
      '12 KB',
    );
  });
});
