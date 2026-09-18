import { createEndpointProfile, type EndpointProfile } from '../../domain/endpoint';
import type { CompactionSummary } from '../../domain/compaction';
import type {
  BeginCompactionInput,
  CompactionSource,
  CompleteCompactionInput,
} from '../persistence/conversation-store';
import type {
  SendResponseInput,
  SendResponseOptions,
  SendResponseResult,
} from '../transport/responses';
import { runLocalCompaction } from './local-compaction';

const summary: CompactionSummary = {
  userGoals: ['goal'],
  constraints: ['constraint'],
  decisions: ['decision'],
  facts: ['fact'],
  artifacts: ['artifact'],
  completedActions: ['action'],
  toolResults: [],
  openQuestions: ['question'],
  nextSteps: ['next'],
  untrustedContentNotes: ['external text'],
};

const profile = createEndpointProfile({
  id: 'ep_1',
  name: 'Test',
  baseUrl: 'https://api.example.test/v1',
  credentialRef: 'cred_1',
});

describe('local compaction', () => {
  it('menolak summary invalid dan mempertahankan transcript sumber', async () => {
    const state = fakeState();
    const result = await runLocalCompaction({
      ...input(),
      repository: state.repository,
      client: client([response('{}')]),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'failed',
      message: 'Summary compaction tidak sesuai schema.',
    });
    expect(state.failed).toHaveLength(1);
    expect(state.completed).toHaveLength(0);
    expect(state.source.turns).toHaveLength(6);
  });

  it('retry satu kali saat output kosong lalu menyimpan usage terpisah', async () => {
    const state = fakeState();
    const result = await runLocalCompaction({
      ...input(),
      repository: state.repository,
      client: client([response(null), response(JSON.stringify(summary))]),
    });

    expect(result.ok).toBe(true);
    expect(state.started).toHaveLength(2);
    expect(state.failed).toHaveLength(1);
    expect(state.completed[0]?.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    expect(state.completed[0]?.summary).toEqual(summary);
  });
});

function input() {
  return {
    profile,
    apiKey: 'sk-test',
    conversationId: 'conv_1',
    modelId: 'model-exact',
    contextWindow: 128_000,
    effectiveMaxOutput: 8_192,
    reasoningEffort: 'auto',
    minimumRecentTurns: 4,
    beforeEstimate: 100_000,
  };
}

function fakeState() {
  const source: CompactionSource = {
    previousSummary: null,
    turns: Array.from({ length: 6 }, (_, index) => ({
      turnId: `turn_${index + 1}`,
      ordinal: index + 1,
      userText: `user ${index + 1}`,
      assistantText: `assistant ${index + 1}`,
    })),
  };
  const started: BeginCompactionInput[] = [];
  const completed: CompleteCompactionInput[] = [];
  const failed: string[] = [];
  return {
    source,
    started,
    completed,
    failed,
    repository: {
      loadCompactionSource: async () => source,
      beginCompaction: async (value: BeginCompactionInput) => {
        started.push(value);
        return `compact_${started.length}`;
      },
      completeCompaction: async (value: CompleteCompactionInput) => {
        completed.push(value);
      },
      failCompaction: async (id: string) => {
        failed.push(id);
      },
    },
  };
}

function client(results: SendResponseResult[]) {
  return {
    send: async (
      _profile: EndpointProfile,
      _apiKey: string,
      _input: SendResponseInput,
      _options?: SendResponseOptions,
    ): Promise<SendResponseResult> => results.shift() ?? response(JSON.stringify(summary)),
  };
}

function response(text: string | null): SendResponseResult {
  return {
    ok: true,
    response: {
      id: 'resp_compaction',
      text,
      reasoningSummary: null,
      toolCalls: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    timing: { requestStart: 1, firstEvent: 2, firstVisibleToken: 3, completed: 4 },
    diagnostics: [],
    attempts: 1,
  };
}
