import { act, cleanup, renderHook } from '@testing-library/react-native';

import { createEndpointProfile } from '../../domain/endpoint';
import type {
  SendResponseOptions,
  SendResponseResult,
} from '../../services/transport/responses';
import { useChat } from './use-chat';

const mockCredentialRead = jest.fn(async () => 'sk-test');
const mockLoadModel = jest.fn(async () => 'model-exact');
const mockSend = jest.fn<Promise<SendResponseResult>, unknown[]>();
const mockStartTurn = jest.fn(async (_input: unknown) => ({ conversationId: 'conv_1' }));
const mockRestartTurn = jest.fn(async (_turnId: unknown, _itemId: unknown) => {});
const mockFlushAssistant = jest.fn(
  async (_turnId: unknown, _itemId: unknown, _text: unknown, _reasoning: unknown) => {},
);
const mockFinishTurn = jest.fn(async (_input: unknown) => {});
const mockLoadConversation = jest.fn<Promise<unknown>, [unknown]>(async (_id) => null);
const mockLoadLatest = jest.fn<Promise<unknown>, [unknown]>(async (_id) => null);

jest.mock('../../services/credentials/store', () => ({
  credentialStore: { read: () => mockCredentialRead() },
}));

jest.mock('../../services/persistence/settings-store', () => ({
  settingsStore: { loadActiveModelId: () => mockLoadModel() },
}));

jest.mock('../../services/persistence/conversation-store', () => ({
  conversationRepository: {
    startTurn: (input: unknown) => mockStartTurn(input),
    restartTurn: (turnId: unknown, itemId: unknown) => mockRestartTurn(turnId, itemId),
    flushAssistant: (turnId: unknown, itemId: unknown, text: unknown, reasoning: unknown) =>
      mockFlushAssistant(turnId, itemId, text, reasoning),
    finishTurn: (input: unknown) => mockFinishTurn(input),
    loadConversation: (id: unknown) => mockLoadConversation(id),
    loadLatest: (id: unknown) => mockLoadLatest(id),
  },
}));

jest.mock('../../services/transport/responses', () => ({
  responsesClient: {
    send: (profile: unknown, apiKey: unknown, input: unknown, options: unknown) =>
      mockSend(profile, apiKey, input, options),
  },
}));

const profile = createEndpointProfile({
  id: 'ep_1',
  name: 'AmanAI',
  baseUrl: 'https://api.amanai.dev/v1',
  credentialRef: 'cred_1',
});

async function setup() {
  const hook = await renderHook(() => useChat(profile));
  await act(async () => hook.result.current.reloadModel());
  return hook;
}

function success(
  id: string,
  text: string,
  reasoningSummary: string | null = null,
): SendResponseResult {
  return {
    ok: true,
    response: { id, text, reasoningSummary, toolCalls: [], usage: null },
    timing: { requestStart: 1, firstEvent: 2, firstVisibleToken: 3, completed: 4 },
    diagnostics: [],
    attempts: 1,
  };
}

function failure(
  overrides: Partial<Extract<SendResponseResult, { ok: false }>> = {},
): SendResponseResult {
  return {
    ok: false,
    error: {
      category: 'rate-limit',
      message: 'Terlalu banyak request.',
      httpStatus: 429,
      providerCode: 'rate_limit',
      requestId: null,
      retryable: true,
      safeDetails: {},
    },
    cancelled: false,
    hadModelEvent: false,
    partial: { id: null, text: null, reasoningSummary: null, toolCalls: [] },
    timing: { requestStart: 1, firstEvent: null, firstVisibleToken: null, completed: 2 },
    diagnostics: [],
    attempts: 2,
    ...overrides,
  };
}

describe('useChat', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mockCredentialRead.mockClear();
    mockLoadModel.mockClear();
    mockSend.mockReset();
    mockStartTurn.mockClear();
    mockRestartTurn.mockClear();
    mockFlushAssistant.mockClear();
    mockFinishTurn.mockClear();
    mockLoadConversation.mockClear();
    mockLoadLatest.mockClear();
  });

  it('menampilkan user segera, mencegah send duplikat, dan melanjutkan response id', async () => {
    let finish: ((result: SendResponseResult) => void) | undefined;
    mockSend.mockImplementationOnce(
      () => new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = await setup();

    let first: Promise<boolean> | undefined;
    await act(async () => {
      first = result.current.send(' Halo ');
      await Promise.resolve();
    });
    expect(result.current.messages.map((entry) => entry.text)).toEqual(['Halo', '']);
    expect(result.current.pending).toBe(true);

    await expect(result.current.send('duplikat')).resolves.toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish?.(success('resp_1', 'Jawaban satu'));
      await first;
    });

    mockSend.mockResolvedValueOnce(success('resp_2', 'Jawaban dua', 'Ringkas'));
    await act(async () => {
      await result.current.send('lanjut');
    });

    expect(mockCredentialRead).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][2]).toMatchObject({
      modelId: 'model-exact',
      prompt: 'lanjut',
      previousResponseId: 'resp_1',
      maxOutputTokens: 1024,
    });
    expect(result.current.messages.map((entry) => entry.text)).toEqual([
      'Halo',
      'Jawaban satu',
      'lanjut',
      'Jawaban dua',
    ]);
    expect(result.current.messages[3].reasoningSummary).toBe('Ringkas');
  });

  it('retry mengulang request gagal tanpa menggandakan user message', async () => {
    mockSend
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce(success('resp_retry', 'Berhasil'));
    const { result } = await setup();

    await act(async () => {
      await result.current.send('coba');
    });
    expect(result.current.canRetry).toBe(true);
    expect(result.current.messages.map((entry) => entry.status)).toEqual(['completed', 'failed']);

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.messages.map((entry) => entry.text)).toEqual(['coba', 'Berhasil']);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('New chat membersihkan pesan, error, dan response id', async () => {
    mockSend.mockResolvedValue(success('resp_1', 'Jawaban'));
    const { result } = await setup();
    await act(async () => {
      await result.current.send('halo');
    });

    await act(async () => result.current.newChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();

    await act(async () => {
      await result.current.send('baru');
    });
    expect(mockSend.mock.calls[1][2]).toMatchObject({ previousResponseId: null });
  });

  it('membatch delta dan Stop mempertahankan partial response', async () => {
    let options: SendResponseOptions | undefined;
    let finish: ((result: SendResponseResult) => void) | undefined;
    mockSend.mockImplementationOnce(
      (_profile, _apiKey, _input, value) =>
        new Promise((resolve) => {
          options = value as SendResponseOptions;
          finish = resolve;
          options.signal?.addEventListener('abort', () => {
            resolve(
              failure({
                cancelled: true,
                hadModelEvent: true,
                error: {
                  category: 'cancelled',
                  message: 'Request dihentikan.',
                  httpStatus: null,
                  providerCode: null,
                  requestId: null,
                  retryable: false,
                  safeDetails: {},
                },
                partial: {
                  id: 'resp_partial',
                  text: 'jawaban partial',
                  reasoningSummary: null,
                  toolCalls: [],
                },
              }),
            );
          });
        }),
    );
    const { result } = await setup();

    let pending: Promise<boolean> | undefined;
    await act(async () => {
      pending = result.current.send('halo');
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      options?.onEvent?.({ type: 'text.delta', at: 3, delta: 'jawaban partial' });
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(result.current.messages.map((entry) => entry.text)).toEqual([
      'halo',
      'jawaban partial',
    ]);
    expect(result.current.pending).toBe(true);

    await act(async () => {
      result.current.stop();
      await pending;
    });
    expect(finish).toBeDefined();
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)?.text).toBe('jawaban partial');
    expect(mockFlushAssistant).toHaveBeenCalledTimes(1);
  });

  it('error setelah event pertama mempertahankan partial dan tidak menawarkan retry', async () => {
    mockSend.mockResolvedValueOnce(
      failure({
        hadModelEvent: true,
        partial: {
          id: 'resp_partial',
          text: 'sebagian',
          reasoningSummary: null,
          toolCalls: [],
        },
      }),
    );
    const { result } = await setup();

    await act(async () => {
      await result.current.send('halo');
    });

    expect(result.current.messages.map((entry) => entry.text)).toEqual(['halo', 'sebagian']);
    expect(result.current.canRetry).toBe(false);
    expect(result.current.error).not.toBeNull();
  });

  it('memuat partial conversation yang interrupted untuk retry', async () => {
    mockLoadConversation.mockResolvedValueOnce({
      id: 'conv_saved',
      title: 'Percakapan tersimpan',
      messages: [
        {
          id: 'user_saved',
          role: 'user',
          text: 'lanjutkan',
          reasoningSummary: null,
          status: 'completed',
        },
        {
          id: 'assistant_saved',
          role: 'assistant',
          text: 'jawaban parsial',
          reasoningSummary: null,
          status: 'interrupted',
        },
      ],
      previousResponseId: null,
      previousResponseModelId: null,
      retry: {
        prompt: 'lanjutkan',
        turnId: 'turn_saved',
        assistantItemId: 'assistant_saved',
      },
    });
    const hook = await renderHook(() => useChat(profile, 'conv_saved'));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.result.current.conversationId).toBe('conv_saved');
    expect(hook.result.current.messages.at(-1)?.status).toBe('interrupted');
    expect(hook.result.current.canRetry).toBe(true);
  });
});
