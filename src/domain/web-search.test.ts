import {
  MAX_WEB_SEARCH_OUTPUT_BYTES,
  parseWebSearchOutput,
  serializeWebSearchOutput,
} from './web-search';

describe('web search output', () => {
  it('accepts only http sources for source cards', () => {
    expect(
      parseWebSearchOutput(
        JSON.stringify({
          provider: 'FreeSerp',
          query: 'example',
          untrusted: true,
          results: [
            {
              title: null,
              url: 'javascript:alert(1)',
              snippet: null,
              publishedAt: null,
              source: 'example.com',
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it('rejects output above its explicit safety cap', () => {
    expect(() =>
      serializeWebSearchOutput({
        provider: 'FreeSerp',
        query: 'example',
        untrusted: true,
        results: [
          {
            title: 'x'.repeat(MAX_WEB_SEARCH_OUTPUT_BYTES),
            url: 'https://example.com',
            snippet: null,
            publishedAt: null,
            source: 'example.com',
          },
        ],
      }),
    ).toThrow('12 KB');
  });
});
