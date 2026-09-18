import { createEndpointProfile } from '../../domain/endpoint';
import type { ToolActivity, ToolExecutor, ToolRegistry } from '../../domain/tool';
import type { SendResponseResult, StreamToolCall, Transport } from '../../services/transport/contract';
import {
  MAX_TOOL_ROUNDS,
  TOOL_TIMEOUT_MS,
  runAgentLoop,
  type ToolCallPersistence,
} from './agent-loop';

const profile = createEndpointProfile({
  id: 'endpoint_1',
  name: 'Fake',
  baseUrl: 'https://example.com/v1',
});

function success(
  toolCalls: (Omit<StreamToolCall, 'itemId'> & { itemId?: string | null })[] = [],
  text: string | null = 'Done.',
): SendResponseResult {
  return {
    ok: true,
    response: {
      id: 'response_1',
      text,
      reasoningSummary: null,
      toolCalls: toolCalls.map((call) => ({ ...call, itemId: call.itemId ?? null })),
      usage: null,
    },
    timing: { requestStart: 1, firstEvent: 2, firstVisibleToken: 3, completed: 4 },
    diagnostics: [],
    attempts: 1,
  };
}

function registry(execute: ToolExecutor['execute'], approval: 'never' | 'ask' = 'never'): ToolRegistry {
  const definition = {
    name: 'get_current_time',
    description: 'Read time',
    parameters: { type: 'object' },
    risk: 'read-only',
    approval,
    target: 'Device clock',
    sideEffect: 'Reads device time.',
  } as const;
  const tool: ToolExecutor = {
    ...definition,
    execute,
  };
  return {
    definitions: () => [definition],
    find: (name) => (name === tool.name ? tool : null),
  };
}

function transport(results: SendResponseResult[]): Transport {
  return {
    send: jest.fn(async () => results.shift() ?? success()),
  };
}

function activity(overrides: Partial<ToolActivity> = {}): ToolActivity {
  return {
    id: 'tool_1',
    callId: 'call_1',
    name: 'get_current_time',
    argumentsJson: '{"timezone":"Asia/Jakarta"}',
    target: 'Device clock',
    sideEffect: 'Reads device time.',
    status: 'completed',
    approval: 'not_required',
    result: { callId: 'call_1', output: '{"time":"now"}', isError: false },
    ...overrides,
  };
}

function start(
  transportValue: Transport,
  registryValue: ToolRegistry,
  overrides: Partial<Parameters<typeof runAgentLoop>[0]> = {},
) {
  return runAgentLoop({
    profile,
    apiKey: 'fake-key',
    turnId: 'turn_1',
    request: {
      modelId: 'model_1',
      prompt: 'time?',
      previousResponseId: null,
      promptCacheKey: null,
      maxOutputTokens: null,
      reasoningEffort: null,
    },
    transport: transportValue,
    registry: registryValue,
    definitions: registryValue.definitions(),
    policy: { approval: 'never' },
    requestApproval: async () => true,
    ...overrides,
  });
}

describe('runAgentLoop', () => {
  it('sends structured result to next model request', async () => {
    const execute = jest.fn(async () => '{"time":"10:00"}');
    const client = transport([
      success([{ callId: 'call_1', name: 'get_current_time', arguments: '{"timezone":"Asia/Jakarta"}' }], null),
      success([], 'It is 10:00.'),
    ]);

    await expect(start(client, registry(execute))).resolves.toMatchObject({ ok: true });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledTimes(2);
    expect((client.send as jest.Mock).mock.calls[1][2]).toMatchObject({
      toolExchanges: [
        {
          calls: [{ callId: 'call_1', name: 'get_current_time' }],
          results: [{ callId: 'call_1', output: '{"time":"10:00"}', isError: false }],
        },
      ],
    });
  });

  it('returns structured errors for invalid JSON and unknown tools', async () => {
    const client = transport([
      success([
        { callId: 'bad_json', name: 'get_current_time', arguments: '{' },
        { callId: 'unknown', name: 'missing', arguments: '{}' },
      ], null),
      success(),
    ]);

    await start(client, registry(async () => 'unused'));

    const results = (client.send as jest.Mock).mock.calls[1][2].toolExchanges[0].results;
    expect(results).toEqual([
      expect.objectContaining({ callId: 'bad_json', isError: true }),
      expect.objectContaining({ callId: 'unknown', isError: true }),
    ]);
  });

  it('asks once and returns rejection to the model', async () => {
    const approval = jest.fn(async () => false);
    const client = transport([
      success([{ callId: 'call_1', name: 'get_current_time', arguments: '{"timezone":"UTC"}' }], null),
      success(),
    ]);

    await start(client, registry(async () => 'unused', 'ask'), {
      policy: { approval: 'ask' },
      requestApproval: approval,
    });

    expect(approval).toHaveBeenCalledTimes(1);
    expect((client.send as jest.Mock).mock.calls[1][2].toolExchanges[0].results[0]).toMatchObject({
      isError: true,
      output: expect.stringContaining('rejected'),
    });
  });

  it('does not repeat a persisted call ID', async () => {
    const execute = jest.fn(async () => 'unused');
    const persistence: ToolCallPersistence = {
      recordToolCall: async () => activity(),
      updateToolCall: async (update) => activity(update),
    };
    const client = transport([
      success([{ callId: 'call_1', name: 'get_current_time', arguments: '{"timezone":"UTC"}' }], null),
      success(),
    ]);

    await start(client, registry(execute), { persistence });

    expect(execute).not.toHaveBeenCalled();
    expect((client.send as jest.Mock).mock.calls[1][2].toolExchanges[0].results[0]).toEqual(
      activity().result,
    );
  });

  it('runs at most three read-only tools at once', async () => {
    const releases: (() => void)[] = [];
    let active = 0;
    let maximum = 0;
    const execute = jest.fn(
      async () =>
        new Promise<string>((resolve) => {
          active += 1;
          maximum = Math.max(maximum, active);
          releases.push(() => {
            active -= 1;
            resolve('{"time":"now"}');
          });
        }),
    );
    const client = transport([
      success(
        Array.from({ length: 4 }, (_, index) => ({
          callId: `call_${String(index)}`,
          name: 'get_current_time',
          arguments: '{"timezone":"UTC"}',
        })),
        null,
      ),
      success(),
    ]);
    const pending = start(client, registry(execute));
    await tick();
    expect(active).toBe(3);
    releases.splice(0).forEach((release) => release());
    await tick();
    releases.splice(0).forEach((release) => release());
    await pending;

    expect(maximum).toBe(3);
  });

  it('stops safely at the round limit', async () => {
    const client = transport(
      Array.from({ length: MAX_TOOL_ROUNDS }, () =>
        success([{ callId: 'call_1', name: 'get_current_time', arguments: '{"timezone":"UTC"}' }], null),
      ),
    );

    const result = await start(client, registry(async () => '{"time":"now"}'));

    expect(result).toMatchObject({ ok: false, error: { message: expect.stringContaining('8 round') } });
    expect(client.send).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
  });

  it('cancels while approval is pending', async () => {
    const controller = new AbortController();
    const client = transport([
      success([{ callId: 'call_1', name: 'get_current_time', arguments: '{"timezone":"UTC"}' }], null),
    ]);
    const pending = start(client, registry(async () => 'unused', 'ask'), {
      policy: { approval: 'ask' },
      signal: controller.signal,
      requestApproval: async (_activity, signal) =>
        new Promise((resolve) => signal.addEventListener('abort', () => resolve(false), { once: true })),
    });
    await tick();
    controller.abort();

    await expect(pending).resolves.toMatchObject({ ok: false, cancelled: true });
  });

  it('caps timed-out tools', async () => {
    jest.useFakeTimers();
    try {
      const client = transport([
        success([{ callId: 'call_1', name: 'get_current_time', arguments: '{"timezone":"UTC"}' }], null),
        success(),
      ]);
      const pending = start(client, registry(async () => new Promise<string>(() => {})));
      await tick();
      await jest.advanceTimersByTimeAsync(TOOL_TIMEOUT_MS);
      await pending;

      expect((client.send as jest.Mock).mock.calls[1][2].toolExchanges[0].results[0]).toMatchObject({
        isError: true,
        output: expect.stringContaining('timed out'),
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

async function tick(): Promise<void> {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}
