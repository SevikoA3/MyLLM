import {
  parseWebFetchOutput,
  parseWebSearchOutput,
} from '../../src/domain/web-search';

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

  it('reads Exa source cards without inventing a missing query', () => {
    expect(parseWebSearchOutput(JSON.stringify({
      results: [{
        title: 'Exa article',
        url: 'https://example.com/article',
        publishedDate: '2026-09-12T00:00:00.000Z',
      }],
    }))).toEqual({
      query: null,
      untrusted: true,
      results: [{
        title: 'Exa article',
        url: 'https://example.com/article',
        snippet: null,
        publishedAt: '2026-09-12T00:00:00.000Z',
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

  it('reads raw Firecrawl markdown for the fetched source card', () => {
    expect(parseWebFetchOutput(JSON.stringify({
      success: true,
      data: {
        markdown: 'Readable text.',
        metadata: {
          title: 'Example article',
          sourceURL: 'https://example.com/article',
        },
      },
    }))).toEqual({
      url: 'https://example.com/article',
      title: 'Example article',
      contentType: 'text/markdown',
      content: 'Readable text.',
      truncated: null,
      untrusted: true,
    });
  });

});
