export const MAX_WEB_SEARCH_QUERY_LENGTH = 512;
export const MAX_WEB_SEARCH_COUNT = 10;
export const MAX_WEB_SEARCH_OUTPUT_BYTES = 12 * 1024;
export const MAX_WEB_FETCH_OUTPUT_BYTES = 12 * 1024;

export type WebSearchResult = {
  title: string | null;
  url: string;
  snippet: string | null;
  publishedAt: string | null;
  source: string;
};

export type WebSearchOutput = {
  query: string;
  untrusted: true;
  results: WebSearchResult[];
};

export type WebFetchOutput = {
  url: string;
  title: string | null;
  contentType: string | null;
  content: string;
  truncated: boolean | null;
  untrusted: true;
};

export function parseWebSearchOutput(value: string): WebSearchOutput | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      typeof parsed.query !== 'string' ||
      !Array.isArray(parsed.results)
    ) {
      return null;
    }
    const results: WebSearchResult[] = [];
    for (const value of parsed.results) {
      const result = parseResult(value);
      if (result === null) {
        return null;
      }
      results.push(result);
    }
    return { query: parsed.query, untrusted: true, results };
  } catch {
    return null;
  }
}

export function parseWebFetchOutput(value: string): WebFetchOutput | null {
  try {
    const parsed: unknown = JSON.parse(value);
    const url = isRecord(parsed) && typeof parsed.url === 'string' ? parsed.url : null;
    if (
      !isRecord(parsed) ||
      url === null ||
      !isWebUrl(url) ||
      typeof parsed.content !== 'string' ||
      (parsed.truncated !== undefined && parsed.truncated !== null && typeof parsed.truncated !== 'boolean')
    ) {
      return null;
    }
    return {
      url,
      title: typeof parsed.title === 'string' ? parsed.title : null,
      contentType: typeof parsed.contentType === 'string'
        ? parsed.contentType
        : typeof parsed.content_type === 'string'
          ? parsed.content_type
          : null,
      content: parsed.content,
      truncated: typeof parsed.truncated === 'boolean' ? parsed.truncated : null,
      untrusted: true,
    };
  } catch {
    return null;
  }
}

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function parseResult(value: unknown): WebSearchResult | null {
  if (!isRecord(value) || typeof value.url !== 'string' || !isWebUrl(value.url)) {
    return null;
  }
  return {
    title: typeof value.title === 'string' ? value.title : null,
    url: value.url,
    snippet: typeof value.snippet === 'string' ? value.snippet : null,
    publishedAt: typeof value.publishedAt === 'string'
      ? value.publishedAt
      : typeof value.published_date === 'string'
        ? value.published_date
        : null,
    source: typeof value.source === 'string' ? value.source : new URL(value.url).hostname,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
