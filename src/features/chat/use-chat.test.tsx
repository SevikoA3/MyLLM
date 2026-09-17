import { act, cleanup, renderHook } from '@testing-library/react-native';

import { createEndpointProfile } from '../../domain/endpoint';
import type { SendResponseResult } from '../../services/transport/responses';
import { useChat } from './use-chat';

const mockCredentialRead = jest.fn(async () => 'sk-test');
const mockLoadModel = jest.fn(async () => 'model-exact');
const mockSend = jest.fn<Promise<SendResponseResult>, unknown[]>();

jest.mock('../../services/credentials/store', () => ({
  credentialStore: { read: () => mockCredentialRead() },
}));

jest.mock('../../services/persistence/settings-store', () => ({
  settingsStore: { loadActiveModelId: () => mockLoadModel() },
}));

jest.mock('../../services/transport/responses', () => ({
  responsesClient: {
    send: (profile: unknown, apiKey: unknown, input: unknown) =>
      mockSend(profile, apiKey, input),
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

describe('useChat', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mockCredentialRead.mockClear();
    mockLoadModel.mockClear();
    mockSend.mockReset();
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
    expect(result.current.messages.map((entry) => entry.text)).toEqual(['Halo']);
    expect(result.current.pending).toBe(true);

    await expect(result.current.send('duplikat')).resolves.toBe(false);
    expect(mockSend).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish?.({
        ok: true,
        response: { id: 'resp_1', text: 'Jawaban satu', reasoningSummary: null },
      });
      await first;
    });

    mockSend.mockResolvedValueOnce({
      ok: true,
      response: { id: 'resp_2', text: 'Jawaban dua', reasoningSummary: 'Ringkas' },
    });
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
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        ok: true,
        response: { id: 'resp_retry', text: 'Berhasil', reasoningSummary: null },
      });
    const { result } = await setup();

    await act(async () => {
      await result.current.send('coba');
    });
    expect(result.current.canRetry).toBe(true);
    expect(result.current.messages).toHaveLength(1);

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.messages.map((entry) => entry.text)).toEqual(['coba', 'Berhasil']);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('New chat membersihkan pesan, error, dan response id', async () => {
    mockSend.mockResolvedValue({
      ok: true,
      response: { id: 'resp_1', text: 'Jawaban', reasoningSummary: null },
    });
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
});
