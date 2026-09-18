import type { ToolExecutor, ToolRegistry } from '../../domain/tool';

export function createToolRegistry(now: () => number = Date.now): ToolRegistry {
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
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    definitions: () => tools.map(({ execute: _execute, ...definition }) => definition),
    find: (name) => byName.get(name) ?? null,
  };
}

export const toolRegistry = createToolRegistry();
