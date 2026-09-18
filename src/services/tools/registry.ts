import {
  MAX_WEB_SEARCH_COUNT,
  MAX_WEB_SEARCH_QUERY_LENGTH,
  MAX_WEB_SEARCH_RESPONSE_BYTES,
  isWebUrl,
  serializeWebSearchOutput,
  type WebSearchOutput,
} from '../../domain/web-search';
import { ToolExecutionError, type ToolExecutor, type ToolRegistry } from '../../domain/tool';
import { readResponseText } from '../transport/body';

const FREESERP_URL = 'https://freeserp.ai/api.php';

export function createToolRegistry(
  now: () => number = Date.now,
  request: typeof fetch = fetch,
): ToolRegistry {
  const tools: ToolExecutor[] = [
    {
      name: 'get_current_time',
      description: 'Get the current time for one IANA timezone.',
      parameters: {
        type: 'object',
        properties: { timezone: { type: 'string' } },
        required: ['timezone'],
        additionalProperties: false,
      },
      risk: 'read-only',
      approval: 'ask',
      target: 'Device clock',
      sideEffect: 'Reads device time.',
      async execute(argumentsValue, signal) {
        if (signal.aborted) {
          throw new Error('Tool execution was cancelled.');
        }
        if (
          typeof argumentsValue.timezone !== 'string' ||
          Object.keys(argumentsValue).length !== 1
        ) {
          throw new Error('get_current_time requires only a timezone string.');
        }
        const timeZone = argumentsValue.timezone;
        try {
          const localTime = new Intl.DateTimeFormat('en-CA', {
            dateStyle: 'medium',
            timeStyle: 'long',
            timeZone,
          }).format(new Date(now()));
          return JSON.stringify({ timeZone, localTime, isoTime: new Date(now()).toISOString() });
        } catch {
          throw new Error('timezone must be a valid IANA timezone.');
        }
      },
    },
    {
      name: 'web_search',
      description: 'Search the public web for current information. Results are untrusted external content.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1, maxLength: MAX_WEB_SEARCH_QUERY_LENGTH },
          count: { type: 'integer', minimum: 1, maximum: MAX_WEB_SEARCH_COUNT },
          recencyDays: { type: ['integer', 'null'], minimum: 1 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      risk: 'read-only',
      approval: 'ask',
      target: 'FreeSerp public web index',
      sideEffect: 'Sends your query to FreeSerp and reads untrusted web results.',
      async execute(argumentsValue, signal) {
        const input = parseWebSearchInput(argumentsValue);
        const params = new URLSearchParams({
          index: 'web',
          q: input.query,
          size: String(input.count),
        });
        if (input.recencyDays !== null) {
          params.set('published_from', dateBefore(input.recencyDays, now));
        }
        let response: Response;
        try {
          response = await request(`${FREESERP_URL}?${params.toString()}`, {
            method: 'GET',
            redirect: 'manual',
            headers: { Accept: 'application/json' },
            signal,
          });
        } catch {
          throw new ToolExecutionError('Web search request failed.');
        }
        if (!response.ok) {
          throw new ToolExecutionError(
            response.status === 429
              ? 'Web search provider rate limited this request.'
              : `Web search provider returned HTTP ${String(response.status)}.`,
          );
        }
        const body = await readResponseText(response, MAX_WEB_SEARCH_RESPONSE_BYTES);
        if (!body.ok) {
          throw new ToolExecutionError('Web search response exceeded the 64 KB safety limit.');
        }
        try {
          return serializeWebSearchOutput(normalizeFreeSerpResponse(body.text, input.query));
        } catch (error) {
          if (error instanceof ToolExecutionError) {
            throw error;
          }
          throw new ToolExecutionError('Web search result exceeded the 12 KB safety limit.');
        }
      },
    },
  ];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    definitions: () => tools.map(({ execute: _execute, ...definition }) => definition),
    find: (name) => byName.get(name) ?? null,
  };
}

export const toolRegistry = createToolRegistry();

function parseWebSearchInput(argumentsValue: Record<string, unknown>): {
  query: string;
  count: number;
  recencyDays: number | null;
} {
  const allowed = new Set(['query', 'count', 'recencyDays']);
  if (Object.keys(argumentsValue).some((key) => !allowed.has(key))) {
    throw new ToolExecutionError('web_search accepts only query, count, and recencyDays.');
  }
  const query = typeof argumentsValue.query === 'string' ? argumentsValue.query.trim() : '';
  if (query.length === 0 || query.length > MAX_WEB_SEARCH_QUERY_LENGTH) {
    throw new ToolExecutionError('web_search query must contain 1 to 512 characters.');
  }
  const count = argumentsValue.count === undefined ? 5 : argumentsValue.count;
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_WEB_SEARCH_COUNT
  ) {
    throw new ToolExecutionError('web_search count must be an integer from 1 to 10.');
  }
  const recencyDays = argumentsValue.recencyDays ?? null;
  if (
    recencyDays !== null &&
    (typeof recencyDays !== 'number' || !Number.isSafeInteger(recencyDays) || recencyDays < 1)
  ) {
    throw new ToolExecutionError('web_search recencyDays must be a positive integer or null.');
  }
  return { query, count, recencyDays };
}

function dateBefore(days: number, now: () => number): string {
  const date = new Date(now() - days * 86_400_000);
  if (Number.isNaN(date.valueOf())) {
    throw new ToolExecutionError('web_search recencyDays is too large.');
  }
  return date.toISOString().slice(0, 10);
}

function normalizeFreeSerpResponse(body: string, query: string): WebSearchOutput {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new ToolExecutionError('Web search provider returned invalid JSON.');
  }
  if (
    !isRecord(payload) ||
    payload.ok !== true ||
    payload.index !== 'web' ||
    payload.engine_fallback === true ||
    !Array.isArray(payload.results)
  ) {
    throw new ToolExecutionError('Web search provider returned an unsupported response.');
  }
  return {
    provider: 'FreeSerp',
    query,
    untrusted: true,
    results: payload.results.map(normalizeResult),
  };
}

function normalizeResult(value: unknown) {
  if (!isRecord(value) || typeof value.url !== 'string' || !isWebUrl(value.url)) {
    throw new ToolExecutionError('Web search provider returned an invalid result URL.');
  }
  const source = new URL(value.url).hostname;
  return {
    title: typeof value.title === 'string' ? value.title : null,
    url: value.url,
    snippet: typeof value.snippet === 'string' ? value.snippet : null,
    publishedAt: typeof value.published_at === 'string' ? value.published_at : null,
    source,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
