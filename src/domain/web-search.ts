export const MAX_WEB_SEARCH_QUERY_LENGTH = 512;
export const MAX_WEB_SEARCH_COUNT = 10;
export const MAX_WEB_SEARCH_RESPONSE_BYTES = 64 * 1024;
export const MAX_WEB_SEARCH_OUTPUT_BYTES = 12 * 1024;

export type WebSearchResult = {
  title: string | null;
  url: string;
  snippet: string | null;
  publishedAt: string | null;
  source: string;
};

export type WebSearchOutput = {
  provider: 'FreeSerp';
  query: string;
  untrusted: true;
  results: WebSearchResult[];
};

export function serializeWebSearchOutput(value: WebSearchOutput): string {
  const output = JSON.stringify(value);
  if (new TextEncoder().encode(output).byteLength > MAX_WEB_SEARCH_OUTPUT_BYTES) {
    throw new Error('Search result exceeds the 12 KB safety limit.');
  }
  return output;
}

export function parseWebSearchOutput(value: string): WebSearchOutput | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      parsed.provider !== 'FreeSerp' ||
      typeof parsed.query !== 'string' ||
      parsed.untrusted !== true ||
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
    return { provider: 'FreeSerp', query: parsed.query, untrusted: true, results };
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
  if (!isRecord(value) || typeof value.url !== 'string' || !isWebUrl(value.url) || typeof value.source !== 'string') {
    return null;
  }
  return {
    title: typeof value.title === 'string' ? value.title : null,
    url: value.url,
    snippet: typeof value.snippet === 'string' ? value.snippet : null,
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : null,
    source: value.source,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
