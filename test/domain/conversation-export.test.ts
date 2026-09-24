import { parseConversationExport, serializeConversationExport } from '../../src/domain/conversation-export';

describe('conversation export schema', () => {
  it('round trips complete tool statuses and structured compaction', () => {
    const value = {
      schemaVersion: 1 as const,
      exportedAt: '2026-09-24T00:00:00.000Z',
      sourceConversationId: 'conv_1',
      title: 'Test conversation',
      endpointId: 'ep_1',
      modelId: 'model-1',
      turns: [{
        ordinal: 1,
        userText: 'hello',
        assistantText: 'world',
        reasoningSummary: null,
        status: 'completed' as const,
        modelId: 'model-1',
        endpointId: 'ep_1',
        reasoningSetting: null,
        outputCeiling: null,
        responseId: 'resp_1',
        toolCalls: [{
          callId: 'call_1',
          name: 'get_current_time',
          argumentsJson: '{}',
          target: 'Device clock',
          sideEffect: 'Reads device time.',
          status: 'timed_out' as const,
          approval: 'not_required' as const,
          result: null,
        }],
        usageRaw: { input_tokens: 1 },
        timingMs: { requestStart: 1, firstEvent: 2, firstVisibleToken: 3, completed: 4 },
      }],
      compactions: [{
        sourceStartOrdinal: 1,
        sourceEndOrdinal: 1,
        modelId: 'model-1',
        promptVersion: 1,
        summary: {
          userGoals: [], constraints: [], decisions: [], facts: [], artifacts: [],
          completedActions: [], toolResults: [], openQuestions: [], nextSteps: [], untrustedContentNotes: [],
        },
        status: 'active' as const,
      }],
    };

    expect(parseConversationExport(serializeConversationExport(value))).toEqual(value);
  });

  it('rejects a turn from a different endpoint', () => {
    const value = {
      schemaVersion: 1,
      exportedAt: '2026-09-24T00:00:00.000Z',
      sourceConversationId: 'conv_1',
      title: 'Mixed endpoint',
      endpointId: 'ep_1',
      modelId: 'model-1',
      turns: [{
        ordinal: 1,
        userText: 'hello',
        assistantText: 'world',
        reasoningSummary: null,
        status: 'completed',
        modelId: 'model-1',
        endpointId: 'ep_other',
        reasoningSetting: null,
        outputCeiling: null,
        responseId: null,
        toolCalls: [],
        usageRaw: null,
        timingMs: { requestStart: null, firstEvent: null, firstVisibleToken: null, completed: null },
      }],
      compactions: [],
    };

    expect(() => parseConversationExport(JSON.stringify(value))).toThrow(
      'Every imported turn must belong to the conversation endpoint.',
    );
  });

  it('accepts an empty valid transcript', () => {
    expect(() => parseConversationExport(JSON.stringify({
      schemaVersion: 1,
      exportedAt: '2026-09-24T00:00:00.000Z',
      sourceConversationId: 'conv_1', title: 'Bad', endpointId: 'ep_1', modelId: 'model-1',
      turns: [],
      compactions: [],
    }))).not.toThrow();
  });

  it('rejects duplicate turn ordinals', () => {
    const turn = {
      ordinal: 1, userText: 'hello', assistantText: 'world', reasoningSummary: null,
      status: 'completed', modelId: 'model-1', endpointId: 'ep_1', reasoningSetting: null,
      outputCeiling: null, responseId: null, toolCalls: [], usageRaw: null,
      timingMs: { requestStart: null, firstEvent: null, firstVisibleToken: null, completed: null },
    };
    expect(() => parseConversationExport(JSON.stringify({
      schemaVersion: 1, exportedAt: '2026-09-24T00:00:00.000Z', sourceConversationId: 'conv_1',
      title: 'Duplicate', endpointId: 'ep_1', modelId: 'model-1', turns: [turn, turn], compactions: [],
    }))).toThrow(/unique/);
  });
});
