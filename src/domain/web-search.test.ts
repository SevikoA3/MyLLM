import {
  parseWebFetchOutput,
  parseWebSearchOutput,
} from './web-search';

describe('web search output', () => {
  it('accepts only http sources for source cards', () => {
    expect(
      parseWebSearchOutput(
        JSON.stringify({
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

  it('reads raw gateway results for source cards', () => {
    expect(parseWebSearchOutput(JSON.stringify({
      query: 'example',
      results: [{
        title: 'Example article',
        url: 'https://example.com/article',
        snippet: 'Current information.',
        published_date: '2026-09-12',
      }],
    }))).toEqual({
      query: 'example',
      untrusted: true,
      results: [{
        title: 'Example article',
        url: 'https://example.com/article',
        snippet: 'Current information.',
        publishedAt: '2026-09-12',
        source: 'example.com',
      }],
    });
  });

  it('keeps fetched text untrusted and preserves unknown truncation', () => {
    expect(parseWebFetchOutput(JSON.stringify({
      url: 'https://example.com/article',
      title: null,
      content_type: null,
      content: 'Readable text.',
    }))).toEqual({
      url: 'https://example.com/article',
      title: null,
      contentType: null,
      content: 'Readable text.',
      truncated: null,
      untrusted: true,
    });
  });

});
