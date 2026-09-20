import { fetch as expoFetch } from 'expo/fetch';

import { buildAuthHeaders, joinEndpointPath } from '../../domain/endpoint';
import { readResponseText } from '../transport/body';

const MAX_GATEWAY_RESPONSE_BYTES = 64 * 1024;
const WEB_GATEWAY_TIMEOUT_MS = 40_000;
const WEB_GATEWAY_HEALTH_TIMEOUT_MS = 10_000;
const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const FIRECRAWL_SCRAPE_URL = 'https://api.firecrawl.dev/v2/scrape';

export type WebGatewayConfig = {
  provider: 'gateway';
  baseUrl: string;
  token: string;
  engines: string;
};

export type ExaSearchConfig = {
  provider: 'exa';
  token: string;
};

export type WebSearchConfig = WebGatewayConfig | ExaSearchConfig;

export type WebSearchInput = {
  query: string;
  count: number;
  categories: string | null;
  language: string;
  timeRange: 'day' | 'week' | 'month' | 'year' | null;
};

export type FirecrawlFetchInput = {
  url: string;
};

export function createWebGatewayClient(
  config: WebGatewayConfig,
  request: typeof fetch = expoFetch,
) {
  const headers = {
    ...buildAuthHeaders('bearer', config.token),
    Accept: 'application/json',
  };
  return {
    async search(input: WebSearchInput, signal: AbortSignal): Promise<string> {
      const params = new URLSearchParams({
        q: input.query,
        count: String(input.count),
        language: input.language,
      });
      params.set('engines', config.engines);
      if (input.categories !== null) params.set('categories', input.categories);
      if (input.timeRange !== null) params.set('time_range', input.timeRange);
      const response = await requestGateway(
        request,
        `${joinEndpointPath(config.baseUrl, '/search')}?${params.toString()}`,
        { method: 'GET', headers },
        signal,
        'web_search',
        WEB_GATEWAY_TIMEOUT_MS,
        'gateway',
      );
      return readGatewayText(response, 'web_search');
    },
  };
}

export function createExaSearchClient(
  config: ExaSearchConfig,
  request: typeof fetch = expoFetch,
  now: () => number = Date.now,
) {
  const headers = {
    'x-api-key': config.token,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  return {
    async search(input: WebSearchInput, signal: AbortSignal): Promise<string> {
      const response = await requestGateway(
        request,
        EXA_SEARCH_URL,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(exaSearchBody(input, now())),
        },
        signal,
        'web_search',
        WEB_GATEWAY_TIMEOUT_MS,
        'Exa',
      );
      return readGatewayText(response, 'web_search');
    },
  };
}

export function createFirecrawlClient(request: typeof fetch = expoFetch) {
  return {
    async fetch(input: FirecrawlFetchInput, signal: AbortSignal): Promise<string> {
      const response = await requestGateway(
        request,
        FIRECRAWL_SCRAPE_URL,
        {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input.url, formats: ['markdown'], onlyMainContent: true }),
        },
        signal,
        'web_fetch',
        WEB_GATEWAY_TIMEOUT_MS,
        'Firecrawl',
      );
      return readGatewayText(response, 'web_fetch');
    },
  };
}

export async function testWebGateway(
  baseUrl: string,
  request: typeof fetch = expoFetch,
): Promise<void> {
  const response = await requestGateway(
    request,
    joinEndpointPath(baseUrl, '/health'),
    { method: 'GET', headers: { Accept: 'application/json' } },
    new AbortController().signal,
    'Gateway health check',
    WEB_GATEWAY_HEALTH_TIMEOUT_MS,
    'gateway',
  );
  const payload = await readGatewayJson(response, 'Gateway health check');
  if (!isRecord(payload) || payload.status !== 'ok') {
    throw new Error('Gateway health check returned an invalid response.');
  }
}

async function requestGateway(
  request: typeof fetch,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  operation: string,
  timeoutMs: number,
  service: string,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (signal.aborted) controller.abort();
  try {
    const response = await request(url, { ...init, redirect: 'manual', signal: controller.signal });
    if (!response.ok) {
      throw new Error(gatewayHttpError(operation, response.status, service));
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(operation)) {
      throw error;
    }
    throw new Error(timedOut ? `${operation} timed out.` : `${operation} request failed.`);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

function exaSearchBody(input: WebSearchInput, now: number): Record<string, string | number> {
  const body: Record<string, string | number> = { query: input.query, numResults: input.count };
  if (input.timeRange !== null) {
    const days = { day: 1, week: 7, month: 30, year: 365 }[input.timeRange];
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - days);
    body.startPublishedDate = start.toISOString();
  }
  return body;
}

async function readGatewayJson(response: Response, operation: string): Promise<unknown> {
  try {
    return JSON.parse(await readGatewayText(response, operation));
  } catch {
    throw new Error(`${operation} returned invalid JSON.`);
  }
}

async function readGatewayText(response: Response, operation: string): Promise<string> {
  const body = await readResponseText(response, MAX_GATEWAY_RESPONSE_BYTES);
  if (!body.ok) {
    throw new Error(`${operation} response exceeded the 64 KB safety limit.`);
  }
  return body.text;
}

function gatewayHttpError(operation: string, status: number, service: string): string {
  if (status === 401) return `${operation} authentication failed.`;
  if (status === 413) return `${operation} content is too large.`;
  if (status === 415) return `${operation} content type is unsupported.`;
  if (status === 429) return `${operation} is rate limited.`;
  if (status === 504) return `${operation} timed out.`;
  if (status === 502) return `${operation} ${service} is unavailable.`;
  return `${operation} ${service} returned HTTP ${String(status)}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
