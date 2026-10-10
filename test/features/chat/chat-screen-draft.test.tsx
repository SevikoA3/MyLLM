import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ChatScreen from '../../../src/features/chat/chat-screen';
import { useChat, type ChatState } from '../../../src/features/chat/use-chat';
import { useModelCatalog } from '../../../src/features/models/use-model-catalog';
import { createEndpointProfile } from '../../../src/domain/endpoint';
import { useActiveEndpoint } from '../../../src/features/setup/use-active-endpoint';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));
jest.mock('../../../src/features/setup/use-active-endpoint', () => ({
  useActiveEndpoint: jest.fn(),
}));
jest.mock('../../../src/features/chat/use-chat', () => ({ useChat: jest.fn() }));
jest.mock('../../../src/features/models/use-model-catalog', () => ({ useModelCatalog: jest.fn() }));
jest.mock('../../../src/services/persistence/endpoint-store', () => ({
  endpointStore: { loadAll: async () => [] }, subscribeEndpointChanges: () => () => {},
}));
jest.mock('../../../src/services/persistence/settings-store', () => ({ settingsStore: { saveActiveModelId: jest.fn() } }));

function setupState(send: ChatState['send']) {
  jest.mocked(useActiveEndpoint).mockReturnValue({ status: 'ready', profile: createEndpointProfile({ id: 'ep_1', name: 'Example', baseUrl: 'https://example.test/v1' }) });
  jest.mocked(useChat).mockReturnValue({
    messages: [], metrics: [], toolActivities: {}, attachments: [], activeModelId: 'example/model', conversationModelId: null,
    readOnly: false, pending: false, compacting: false, loadingModel: false, loadingConversation: false,
    reasoningOptions: [], contextBudget: null, error: null, canRetry: false, attachmentMimeTypes: [], pickingAttachment: false,
    reloadModel: jest.fn(), updateContext: jest.fn(), send,
  } as unknown as ChatState);
  jest.mocked(useModelCatalog).mockReturnValue({ runtime: null, loading: false, reload: jest.fn() } as unknown as ReturnType<typeof useModelCatalog>);
}

describe('Chat composer', () => {
  it('shows file failure details and recovery separately from endpoint errors', async () => {
    setupState(jest.fn());
    const state = useChat(null);
    jest.mocked(useChat).mockReturnValue({ ...state, error: {
      category: 'request', message: 'File selection failed. Try again.', retryable: false,
      httpStatus: null, providerCode: null, requestId: null,
      safeDetails: { stage: 'attachment', operation: 'read', detail: 'Cannot read sk-private1234' },
    } });
    const view = await render(<ChatScreen />);
    expect(view.getByText('Attachment failed')).toBeTruthy();
    expect(view.getByText('Reading selected file: Cannot read [redacted]')).toBeTruthy();
    expect(view.getByText(/attach it again/)).toBeTruthy();
    expect(view.queryByText(/check the endpoint and active model/)).toBeNull();
  });

  it('opens Files and removes a selected document through the composer controls', async () => {
    setupState(jest.fn());
    const state = useChat(null);
    const addAttachment = jest.fn();
    const removeAttachment = jest.fn();
    jest.mocked(useChat).mockReturnValue({ ...state, attachmentMimeTypes: ['application/pdf'], addAttachment, removeAttachment, attachments: [{ id: 'file_1', name: 'notes.pdf', mimeType: 'application/pdf', byteSize: 100, uri: 'file:///notes.pdf' }] });
    const view = await render(<ChatScreen />);
    expect(view.getByText('notes.pdf')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('Attach file'));
    expect(addAttachment).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByLabelText('Remove notes.pdf'));
    expect(removeAttachment).toHaveBeenCalledWith('file_1');
  });

  it.each(['pending', 'compacting', 'pickingAttachment'] as const)('disables file selection while %s', async (busyState) => {
    setupState(jest.fn());
    const state = useChat(null);
    jest.mocked(useChat).mockReturnValue({ ...state, attachmentMimeTypes: ['application/pdf'], [busyState]: true });
    const view = await render(<ChatScreen />);
    expect(view.getByLabelText('Attach file')).toBeDisabled();
  });

  it('offers loading recovery and a new chat after history fails to load', async () => {
    setupState(jest.fn());
    const state = useChat(null);
    const reload = jest.fn();
    const newChat = jest.fn();
    jest.mocked(useChat).mockReturnValue({ ...state, readOnly: true, reloadModel: reload, newChat, error: { category: 'unknown', message: 'Could not load conversation.', retryable: true, httpStatus: null, providerCode: null, requestId: null, safeDetails: { stage: 'conversation-load' } } });
    const view = await render(<ChatScreen />);
    await fireEvent.press(view.getByLabelText('Retry loading conversation'));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Start new chat')).toBeEnabled();
    await fireEvent.press(view.getByLabelText('Start new chat'));
    expect(newChat).toHaveBeenCalledTimes(1);
  });
  it('preserves the draft when preflight rejects a send', async () => {
    const send = jest.fn().mockResolvedValue(false);
    setupState(send);
    const view = await render(<ChatScreen />);
    await fireEvent.changeText(view.getByLabelText('Message'), 'Keep this draft');
    await fireEvent.press(view.getByLabelText('Send'));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(view.getByLabelText('Message').props.value).toBe('Keep this draft');
  });

  it('clears the draft when the turn is accepted before the response completes', async () => {
    let finish!: (sent: boolean) => void;
    let accept!: () => void;
    setupState((_prompt, _images, onAccepted) => {
      accept = onAccepted!;
      return new Promise((resolve) => { finish = resolve; });
    });
    const view = await render(<ChatScreen />);
    await fireEvent.changeText(view.getByLabelText('Message'), 'Accepted draft');
    await fireEvent.press(view.getByLabelText('Send'));
    await act(async () => { accept(); });
    expect(view.getByLabelText('Message').props.value).toBe('');
    await act(async () => { finish(false); });
    expect(view.getByLabelText('Message').props.value).toBe('');
  });
});
