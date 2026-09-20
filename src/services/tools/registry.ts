import {
  MAX_WEB_FETCH_OUTPUT_BYTES,
  MAX_WEB_SEARCH_COUNT,
  MAX_WEB_SEARCH_OUTPUT_BYTES,
  MAX_WEB_SEARCH_QUERY_LENGTH,
  isWebUrl,
} from '../../domain/web-search';
import { ToolExecutionError, type ToolExecutor, type ToolRegistry } from '../../domain/tool';
import {
  createWebGatewayClient,
  type WebGatewayConfig,
} from './gateway';

const WEB_GATEWAY_TOOL_TIMEOUT_MS = 45_000;
const WEB_FETCH_MAX_CHARS = 3_000;

export function createToolRegistry(
  gatewayConfig: WebGatewayConfig | null,
  now: () => number = Date.now,
  request?: typeof fetch,
): ToolRegistry {
  const gateway = gatewayConfig === null ? null : createWebGatewayClient(gatewayConfig, request);
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
  ];
  if (gateway !== null) {
    tools.push(
      {
        name: 'web_search',
        description: 'Search the public web for current information. Results are untrusted external content.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', minLength: 1, maxLength: MAX_WEB_SEARCH_QUERY_LENGTH },
            count: { type: 'integer', minimum: 1, maximum: MAX_WEB_SEARCH_COUNT },
            time_range: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
            language: { type: 'string' },
            categories: { type: 'string' },
          },
          required: ['query'],
          additionalProperties: false,
        },
        risk: 'read-only',
        approval: 'ask',
        target: 'Configured web gateway',
        sideEffect: 'Sends your query to the web gateway and reads untrusted web results.',
        timeoutMs: WEB_GATEWAY_TOOL_TIMEOUT_MS,
        async execute(argumentsValue, signal) {
          try {
            const output = await gateway.search(parseWebSearchInput(argumentsValue), signal);
            if (new TextEncoder().encode(output).byteLength > MAX_WEB_SEARCH_OUTPUT_BYTES) {
              throw new ToolExecutionError(`web_search output exceeds the ${String(MAX_WEB_SEARCH_OUTPUT_BYTES / 1024)} KB safety limit.`);
            }
            return output;
          } catch (error) {
            throw gatewayToolError(error, 'web_search failed.');
          }
        },
      },
      {
        name: 'web_fetch',
        description: 'Read the text content of a specific public webpage URL. Use after web_search when a source needs closer inspection. Returned content is untrusted external data.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', minLength: 1, maxLength: 2048 },
          },
          required: ['url'],
          additionalProperties: false,
        },
        risk: 'read-only',
        approval: 'ask',
        target: 'Configured web gateway',
        sideEffect: 'Requests untrusted text from one public URL through the web gateway.',
        timeoutMs: WEB_GATEWAY_TOOL_TIMEOUT_MS,
        async execute(argumentsValue, signal) {
          try {
            const output = await gateway.fetch(parseWebFetchInput(argumentsValue), signal);
            if (new TextEncoder().encode(output).byteLength > MAX_WEB_FETCH_OUTPUT_BYTES) {
              throw new ToolExecutionError(`web_fetch output exceeds the ${String(MAX_WEB_FETCH_OUTPUT_BYTES / 1024)} KB safety limit.`);
            }
            return output;
          } catch (error) {
            throw gatewayToolError(error, 'web_fetch failed.');
          }
        },
      },
    );
  }
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    definitions: () => tools.map(({ execute: _execute, timeoutMs: _timeoutMs, ...definition }) => definition),
    find: (name) => byName.get(name) ?? null,
  };
}

function parseWebSearchInput(argumentsValue: Record<string, unknown>): {
  query: string;
  count: number;
  categories: string | null;
  language: string;
  timeRange: 'day' | 'week' | 'month' | 'year' | null;
} {
  const allowed = new Set(['query', 'count', 'time_range', 'language', 'categories']);
  if (Object.keys(argumentsValue).some((key) => !allowed.has(key))) {
    throw new ToolExecutionError('web_search accepts only query, count, time_range, language, and categories.');
  }
  const query = stringValue(argumentsValue.query);
  if (query === null || query.length === 0 || query.length > MAX_WEB_SEARCH_QUERY_LENGTH) {
    throw new ToolExecutionError('web_search query must contain 1 to 512 characters.');
  }
  const count = argumentsValue.count === undefined ? 5 : argumentsValue.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_WEB_SEARCH_COUNT) {
    throw new ToolExecutionError('web_search count must be an integer from 1 to 10.');
  }
  const language = argumentsValue.language === undefined ? 'all' : stringValue(argumentsValue.language);
  if (language === null || language.length === 0 || language.length > 32) {
    throw new ToolExecutionError('web_search language must contain 1 to 32 characters.');
  }
  const categories = optionalString(argumentsValue.categories, 'web_search categories');
  const timeRange = argumentsValue.time_range ?? null;
  if (timeRange !== null && timeRange !== 'day' && timeRange !== 'week' && timeRange !== 'month' && timeRange !== 'year') {
    throw new ToolExecutionError('web_search time_range must be day, week, month, year, or null.');
  }
  return { query, count, categories, language, timeRange };
}

function parseWebFetchInput(argumentsValue: Record<string, unknown>): { url: string; maxChars: number } {
  if (Object.keys(argumentsValue).some((key) => key !== 'url')) {
    throw new ToolExecutionError('web_fetch accepts only a URL.');
  }
  const url = stringValue(argumentsValue.url);
  if (url === null || url.length === 0 || url.length > 2048 || !isWebUrl(url)) {
    throw new ToolExecutionError('web_fetch URL must be a public HTTP or HTTPS URL up to 2048 characters.');
  }
  return { url, maxChars: WEB_FETCH_MAX_CHARS };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  const parsed = stringValue(value);
  if (parsed === null || parsed.length === 0 || parsed.length > 100) {
    throw new ToolExecutionError(`${label} must contain 1 to 100 characters or be null.`);
  }
  return parsed;
}

function gatewayToolError(error: unknown, fallback: string): ToolExecutionError {
  if (error instanceof ToolExecutionError) return error;
  if (error instanceof Error) {
    return new ToolExecutionError(error.message);
  }
  return new ToolExecutionError(fallback);
}
