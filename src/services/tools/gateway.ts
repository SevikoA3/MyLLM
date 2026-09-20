import { fetch as expoFetch } from 'expo/fetch';

import { buildAuthHeaders, joinEndpointPath } from '../../domain/endpoint';
import { readResponseText } from '../transport/body';

const MAX_GATEWAY_RESPONSE_BYTES = 64 * 1024;
const WEB_GATEWAY_TIMEOUT_MS = 40_000;
const WEB_GATEWAY_HEALTH_TIMEOUT_MS = 10_000;

export type WebGatewayConfig = {
  baseUrl: string;
  token: string;
  engines: string;
};

export type GatewaySearchInput = {
  query: string;
  count: number;
  categories: string | null;
  language: string;
  timeRange: 'day' | 'week' | 'month' | 'year' | null;
};

export type GatewayFetchInput = {
  url: string;
  maxChars: number;
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
    async search(input: GatewaySearchInput, signal: AbortSignal): Promise<string> {
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
      );
      return readGatewayText(response, 'web_search');
    },
    async fetch(input: GatewayFetchInput, signal: AbortSignal): Promise<string> {
      const response = await requestGateway(
        request,
        joinEndpointPath(config.baseUrl, '/fetch'),
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input.url, max_chars: input.maxChars }),
        },
        signal,
        'web_fetch',
        WEB_GATEWAY_TIMEOUT_MS,
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
      throw new Error(gatewayHttpError(operation, response.status));
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

function gatewayHttpError(operation: string, status: number): string {
  if (status === 401) return `${operation} authentication failed.`;
  if (status === 413) return `${operation} content is too large.`;
  if (status === 415) return `${operation} content type is unsupported.`;
  if (status === 429) return `${operation} is rate limited.`;
  if (status === 504) return `${operation} timed out.`;
  if (status === 502) return `${operation} gateway is unavailable.`;
  return `${operation} gateway returned HTTP ${String(status)}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
