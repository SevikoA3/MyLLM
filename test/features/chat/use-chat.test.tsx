import { act, cleanup, renderHook } from '@testing-library/react-native';

import { createEndpointProfile } from '../../../src/domain/endpoint';
import type { ConversationInputMessage } from '../../../src/domain/conversation';
import type {
  SendResponseOptions,
  SendResponseResult,
} from '../../../src/services/transport/contract';
import { useChat } from '../../../src/features/chat/use-chat';

const mockCredentialRead = jest.fn(async () => 'sk-test');
const mockLoadModel = jest.fn(async () => 'model-exact');
let mockReasoningEffort = 'auto';
let mockInputModalities: ('text' | 'image')[] = ['text'];
const mockLoadModelConfig = jest.fn(async () => ({
  modelId: 'model-exact',
  contextWindow: 128_000,
  contextPolicy: {
    autoCompact: true,
    triggerPercent: 80,
    targetPercent: 55,
    hardStopPercent: 95,
    minimumRecentTurns: 4,
  },
  reasoningEffort: mockReasoningEffort,
  reasoningOptions: ['auto', 'low', 'high'],
  inputModalities: mockInputModalities,
  outputLimit: null,
  effectiveMaxOutput: 128_000,
}));
const mockSaveReasoningEffort = jest.fn(async (_effort: string) => {
  mockReasoningEffort = _effort;
});
const mockSend = jest.fn<Promise<SendResponseResult>, unknown[]>();
const mockRunLocalCompaction = jest.fn();
const mockStartTurn = jest.fn(async (_input: unknown) => ({ conversationId: 'conv_1' }));
const mockRestartTurn = jest.fn(async (_turnId: unknown, _itemId: unknown) => {});
const mockFlushAssistant = jest.fn(
  async (_turnId: unknown, _itemId: unknown, _text: unknown, _reasoning: unknown) => {},
);
const mockFinishTurn = jest.fn(async (_input: unknown) => {});
const mockLoadTurnMetrics = jest.fn(async (_id: unknown) => []);
const mockLoadRequestHistory = jest.fn<Promise<ConversationInputMessage[]>, [unknown]>(
  async (_id) => [],
);
const mockLoadConversation = jest.fn<Promise<unknown>, [unknown]>(async (_id) => null);
const mockLoadLatest = jest.fn<Promise<unknown>, [unknown]>(async (_id) => null);
const mockLoadImageAttachments = jest.fn(async () => []);
const mockStageImage = jest.fn(async (_attachments: unknown) => ({ kind: 'cancelled' as const }));
const mockDeleteStagedImages = jest.fn();
const mockDeleteUnreferencedStagedImages = jest.fn();
const mockLoadWebTools = jest.fn(async () => ({ enabled: false, provider: 'gateway', baseUrl: null, engines: 'bing' }));

jest.mock('../../../src/services/credentials/store', () => ({
  credentialStore: { read: () => mockCredentialRead() },
}));

jest.mock('../../../src/services/persistence/settings-store', () => ({
  settingsStore: { loadActiveModelId: () => mockLoadModel() },
}));

jest.mock('../../../src/services/persistence/catalog-files', () => ({
  fileCatalogStorage: {},
  readBundledDefaults: jest.fn(),
}));

jest.mock('../../../src/services/persistence/catalog-store', () => ({
  loadModelRequestSnapshot: () => mockLoadModelConfig(),
  saveModelReasoningEffort: (
    _storage: unknown,
    _endpointId: unknown,
    _modelId: unknown,
    effort: string,
  ) => mockSaveReasoningEffort(effort),
}));

jest.mock('../../../src/services/persistence/conversation-store', () => ({
  conversationRepository: {
    startTurn: (input: unknown) => mockStartTurn(input),
    restartTurn: (turnId: unknown, itemId: unknown) => mockRestartTurn(turnId, itemId),
    flushAssistant: (turnId: unknown, itemId: unknown, text: unknown, reasoning: unknown) =>
      mockFlushAssistant(turnId, itemId, text, reasoning),
    finishTurn: (input: unknown) => mockFinishTurn(input),
    loadRequestHistory: (id: unknown) => mockLoadRequestHistory(id),
    loadTurnMetrics: (id: unknown) => mockLoadTurnMetrics(id),
    loadConversation: (id: unknown) => mockLoadConversation(id),
    loadLatest: (id: unknown) => mockLoadLatest(id),
    loadImageAttachments: () => mockLoadImageAttachments(),
  },
}));

jest.mock('../../../src/services/attachments/images', () => ({
  stageImageAttachment: (attachments: unknown) => mockStageImage(attachments),
  deleteStagedImages: (attachments: unknown) => mockDeleteStagedImages(attachments),
  deleteUnreferencedStagedImages: (attachments: unknown) => mockDeleteUnreferencedStagedImages(attachments),
}));

jest.mock('../../../src/services/persistence/web-tools-store', () => ({
  webToolsCredentialId: () => 'web_tools_gateway',
  webToolsStore: { load: () => mockLoadWebTools() },
}));

jest.mock('../../../src/services/transport/protocol', () => ({
  protocolClient: {
    send: (profile: unknown, apiKey: unknown, input: unknown, options: unknown) =>
      mockSend(profile, apiKey, input, options),
  },
}));

jest.mock('../../../src/services/context/local-compaction', () => ({
  runLocalCompaction: (input: unknown) => mockRunLocalCompaction(input),
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
    mockReasoningEffort = 'auto';
    mockInputModalities = ['text'];
    mockCredentialRead.mockClear();
    mockLoadModel.mockClear();
    mockLoadModelConfig.mockClear();
    mockSaveReasoningEffort.mockClear();
    mockSend.mockReset();
    mockRunLocalCompaction.mockReset();
    mockStartTurn.mockClear();
    mockRestartTurn.mockClear();
    mockFlushAssistant.mockClear();
    mockFinishTurn.mockClear();
    mockLoadRequestHistory.mockClear();
    mockLoadTurnMetrics.mockClear();
    mockLoadConversation.mockClear();
    mockLoadLatest.mockClear();
    mockLoadImageAttachments.mockClear();
    mockStageImage.mockClear();
    mockDeleteStagedImages.mockClear();
    mockDeleteUnreferencedStagedImages.mockClear();
    mockLoadWebTools.mockClear();
  });

  it('loads a conversation owned by another endpoint as read-only', async () => {
    mockLoadConversation.mockResolvedValueOnce({
      id: 'conv_other',
      endpointId: 'ep_other',
      modelId: 'model-other',
      messages: [{ id: 'message_other', role: 'user', text: 'private', reasoningSummary: null, status: 'completed', attachments: [] }],
      metrics: [],
      previousResponseId: 'response_other',
      previousResponseModelId: 'model-other',
      retry: { prompt: 'private', turnId: 'turn_other', assistantItemId: 'assistant_other' },
      autoCompact: true,
      compactionActive: false,
      toolActivities: {},
    });
    const hook = await renderHook(() => useChat(profile, 'conv_other'));

    await act(async () => { await Promise.resolve(); });

    expect(hook.result.current.conversationId).toBe('conv_other');
    expect(hook.result.current.conversationEndpointId).toBe('ep_other');
    expect(hook.result.current.conversationModelId).toBe('model-other');
    expect(hook.result.current.messages.map((message) => message.text)).toEqual(['private']);
    expect(hook.result.current.readOnly).toBe(true);
    expect(hook.result.current.canRetry).toBe(false);
    await expect(hook.result.current.send('must not send')).resolves.toBe(false);
    await expect(hook.result.current.compactNow()).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('only enables image attachments for an explicit image modality on a Responses-capable protocol', async () => {
    const { result } = await setup();
    expect(result.current.canAttachImages).toBe(false);

    mockInputModalities = ['text', 'image'];
    await act(async () => result.current.reloadModel());
    expect(result.current.canAttachImages).toBe(true);

    const autoProfile = createEndpointProfile({
      id: 'ep_auto',
      name: 'Auto',
      baseUrl: 'https://auto.example/v1',
      protocol: 'auto',
    });
    const autoHook = await renderHook(() => useChat(autoProfile));
    await act(async () => autoHook.result.current.reloadModel());
    expect(autoHook.result.current.canAttachImages).toBe(true);

    const chatProfile = createEndpointProfile({
      id: 'ep_chat',
      name: 'Chat Completions',
      baseUrl: 'https://chat.example/v1',
      protocol: 'chat-completions',
    });
    const chatHook = await renderHook(() => useChat(chatProfile));
    await act(async () => chatHook.result.current.reloadModel());
    expect(chatHook.result.current.canAttachImages).toBe(false);
  });

  it('ignores a stale model load after the endpoint changes', async () => {
    let resolveOld: ((modelId: string) => void) | undefined;
    mockLoadModel
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce('model-new');
    const second = createEndpointProfile({ id: 'ep_2', name: 'Second', baseUrl: 'https://second.example/v1' });
    const hook = await renderHook<ReturnType<typeof useChat>, { currentProfile: ReturnType<typeof createEndpointProfile> }>(
      ({ currentProfile }) => useChat(currentProfile),
      { initialProps: { currentProfile: profile } },
    );
    let oldLoad: Promise<void> | undefined;
    await act(() => { oldLoad = hook.result.current.reloadModel(); });
    await act(() => { hook.rerender({ currentProfile: second }); });
    await act(async () => hook.result.current.reloadModel());
    expect(hook.result.current.activeModelId).toBe('model-new');

    await act(async () => {
      resolveOld?.('model-old');
      await oldLoad;
    });
    expect(hook.result.current.activeModelId).toBe('model-new');
  });

  it('menampilkan user segera, mencegah send duplikat, dan mengirim history lokal', async () => {
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

    mockLoadRequestHistory
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
      { role: 'user', content: 'Halo' },
      { role: 'assistant', content: 'Jawaban satu' },
      { role: 'user', content: 'lanjut' },
      ]);
    mockSend.mockResolvedValueOnce(success('resp_2', 'Jawaban dua', 'Ringkas'));
    await act(async () => {
      await result.current.send('lanjut');
    });

    expect(mockCredentialRead).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][2]).toMatchObject({
      modelId: 'model-exact',
      prompt: 'lanjut',
      history: [
        { role: 'user', content: 'Halo' },
        { role: 'assistant', content: 'Jawaban satu' },
        { role: 'user', content: 'lanjut' },
      ],
      previousResponseId: null,
      promptCacheKey: 'conv_1',
      maxOutputTokens: null,
      reasoningEffort: 'auto',
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

  it('does not mislabel a response save failure as a request failure', async () => {
    mockSend.mockResolvedValueOnce(success('resp_1', 'Jawaban'));
    mockFinishTurn.mockRejectedValueOnce(new Error('database locked'));
    const { result } = await setup();

    await act(async () => {
      await result.current.send('halo');
    });

    expect(result.current.messages.at(-1)).toMatchObject({ text: 'Jawaban', status: 'completed' });
    expect(result.current.error).toMatchObject({ safeDetails: { stage: 'persistence' } });
    expect(result.current.canRetry).toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('mengubah reasoning dari chat dan memakai snapshot baru saat send', async () => {
    mockSend.mockResolvedValue(success('resp_1', 'Jawaban'));
    const { result } = await setup();

    expect(result.current.reasoningOptions).toEqual(['auto', 'low', 'high']);
    expect(result.current.reasoningEffort).toBe('auto');
    await act(async () => {
      await result.current.setReasoningEffort('high');
    });
    expect(mockSaveReasoningEffort).toHaveBeenCalledWith('high');
    expect(result.current.reasoningEffort).toBe('high');

    await act(async () => {
      await result.current.send('pakai high');
    });
    expect(mockSend.mock.calls[0][2]).toMatchObject({ reasoningEffort: 'high' });
    expect(mockStartTurn).toHaveBeenCalledWith(
      expect.objectContaining({ reasoningSetting: 'high' }),
    );
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

  it('memperbarui context budget setelah debounce draft', async () => {
    jest.useFakeTimers();
    try {
      const { result } = await setup();

      await act(async () => {
        result.current.updateContext(' draft 😀 ');
        jest.advanceTimersByTime(149);
      });
      expect(result.current.contextBudget).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(1);
        await Promise.resolve();
      });
      expect(result.current.contextBudget).toEqual(
        expect.objectContaining({
          contextWindow: 128_000,
          requestedOutputReserve: 4_096,
          quality: 'estimated',
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('memblokir hard stop sebelum membuat turn atau mengirim main request', async () => {
    const hardStopConfig = {
      modelId: 'model-exact',
      contextWindow: 100,
      contextPolicy: {
        autoCompact: true,
        triggerPercent: 80,
        targetPercent: 55,
        hardStopPercent: 95,
        minimumRecentTurns: 4,
      },
      reasoningEffort: mockReasoningEffort,
      reasoningOptions: ['auto', 'low', 'high'],
      inputModalities: mockInputModalities,
      outputLimit: null,
      effectiveMaxOutput: 100,
    };
    mockLoadModelConfig
      .mockResolvedValueOnce(hardStopConfig)
      .mockResolvedValueOnce(hardStopConfig);
    const { result } = await setup();

    await act(async () => {
      await expect(result.current.send('prompt panjang')).resolves.toBe(false);
    });

    expect(mockStartTurn).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(result.current.error?.message).toContain('Context is nearly full');
  });

  it('melakukan auto-compact sebelum main request saat trigger tercapai', async () => {
    const config = {
      modelId: 'model-exact',
      contextWindow: 8_000,
      contextPolicy: {
        autoCompact: true,
        triggerPercent: 80,
        targetPercent: 55,
        hardStopPercent: 95,
        minimumRecentTurns: 4,
      },
      reasoningEffort: mockReasoningEffort,
      reasoningOptions: ['auto', 'low', 'high'],
      inputModalities: mockInputModalities,
      outputLimit: null,
      effectiveMaxOutput: 512,
    };
    mockLoadModelConfig.mockResolvedValue(config);
    mockLoadConversation.mockResolvedValueOnce({
      id: 'conv_saved',
      title: 'Percakapan tersimpan',
      endpointId: 'ep_1',
      modelId: 'model-exact',
      messages: [],
      previousResponseId: null,
      previousResponseModelId: null,
      metrics: [],
      retry: null,
      autoCompact: true,
      compactionActive: false,
    });
    const longHistory: ConversationInputMessage[] = Array.from({ length: 80 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: 'x'.repeat(300),
    }));
    mockLoadRequestHistory.mockResolvedValueOnce(longHistory).mockResolvedValue([
      { role: 'user', content: 'summary' },
      { role: 'assistant', content: 'recent' },
    ]);
    mockRunLocalCompaction.mockResolvedValueOnce({
      ok: true,
      summary: {},
      afterEstimate: 2_000,
    });
    mockSend.mockResolvedValueOnce(success('resp_compacted', 'Berhasil setelah compact'));

    const hook = await renderHook(() => useChat(profile, 'conv_saved'));
    await act(async () => {
      await hook.result.current.reloadModel();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await expect(hook.result.current.send('lanjut')).resolves.toBe(true);
    });

    expect(mockRunLocalCompaction).toHaveBeenCalledWith(
      expect.objectContaining({ minimumRecentTurns: 4 }),
    );
    expect(hook.result.current.contextBudget?.usedPercent).toBeLessThan(55);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(hook.result.current.compactionActive).toBe(true);
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
      endpointId: 'ep_1',
      modelId: 'model-exact',
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
      metrics: [],
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
