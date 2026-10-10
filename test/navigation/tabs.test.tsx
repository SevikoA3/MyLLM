import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { createEndpointProfile } from '../../src/domain/endpoint';
import { useChat, type ChatState } from '../../src/features/chat/use-chat';
import { useModelCatalog } from '../../src/features/models/use-model-catalog';
import { conversationRepository } from '../../src/services/persistence/conversation-store';

let mockProfile = createEndpointProfile({ id: 'endpoint_1', name: 'Example', baseUrl: 'https://example.test/v1' });

jest.mock('../../global.css', () => ({}));
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true],
}));
jest.mock('../../src/features/setup/use-active-endpoint', () => ({
  useActiveEndpoint: () => ({ status: 'ready', profile: mockProfile }),
}));
jest.mock('../../src/features/chat/use-chat', () => ({ useChat: jest.fn() }));
jest.mock('../../src/features/models/use-model-catalog', () => ({ useModelCatalog: jest.fn() }));
jest.mock('../../src/services/persistence/endpoint-store', () => ({
  endpointStore: { loadAll: async () => [] }, subscribeEndpointChanges: () => () => {},
}));
jest.mock('../../src/services/persistence/settings-store', () => ({ settingsStore: { saveActiveModelId: jest.fn() } }));
jest.mock('../../src/services/persistence/conversation-store', () => ({ conversationRepository: { list: jest.fn() } }));

const routes = {
  appDir: './app',
  overrides: {
    'settings/index': () => <Text>General content</Text>,
    'settings/models/index': () => <Text>Models content</Text>,
    'settings/models/model': () => <Text>Model details content</Text>,
    'settings/models/json': () => <Text>Model JSON content</Text>,
    'settings/endpoints': () => <Text>Endpoints content</Text>,
    'settings/usage': () => <Text>Usage content</Text>,
  },
};

beforeEach(() => {
  jest.mocked(conversationRepository.list).mockReset().mockResolvedValue({ conversations: [], nextCursor: null });
  mockProfile = createEndpointProfile({ id: 'endpoint_1', name: 'Example', baseUrl: 'https://example.test/v1' });
  jest.mocked(useChat).mockReturnValue({
    messages: [], metrics: [], toolActivities: {}, attachments: [], activeModelId: 'example/model', conversationModelId: null,
    readOnly: false, pending: false, compacting: false, loadingModel: false, loadingConversation: false,
    reasoningOptions: [], contextBudget: null, error: null, canRetry: false, attachmentMimeTypes: [], pickingAttachment: false,
    reloadModel: jest.fn(), updateContext: jest.fn(), send: jest.fn(), newChat: jest.fn(),
  } as unknown as ChatState);
  jest.mocked(useModelCatalog).mockReturnValue({ runtime: null, loading: false, reload: jest.fn() } as unknown as ReturnType<typeof useModelCatalog>);
});

it.each(['/', '/chat', '/chat/new', '/chat/conversation_1'])(
  'opens Settings from the side menu at %s and returns to the same chat',
  async (initialUrl) => {
    const view = renderRouter(routes, { initialUrl });
    await view;
    const chatPath = initialUrl === '/' ? '/chat/new' : initialUrl;
    expect(view.getPathname()).toBe(chatPath);
    expect(useChat).toHaveBeenLastCalledWith(mockProfile, initialUrl === '/chat/conversation_1' ? 'conversation_1' : null, chatPath === '/chat/new');
    expect(screen.getByTestId('navigation-swipe-area')).toBeTruthy();
    expect(screen.queryByText('General')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('No conversations yet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }));
    await act(() => jest.runOnlyPendingTimers());

    for (const tab of ['General', 'Models', 'Endpoints']) {
      expect(screen.getByText(tab)).toBeTruthy();
    }
    expect(screen.queryByText('Usage')).toBeNull();
    expect(screen.getByText('General content')).toBeTruthy();

    await fireEvent.press(screen.getByText('Models'));
    expect(screen.getByText('Models content')).toBeTruthy();
    await fireEvent.press(screen.getByText('Endpoints'));
    expect(screen.getByText('Endpoints content')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close Settings' }));
    expect(view.getPathname()).toBe(chatPath);
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeTruthy();
  },
);

it('only offers the Usage tab for an endpoint with a documented usage path', async () => {
  mockProfile = { ...mockProfile, compat: { ...mockProfile.compat, usagePath: '/usage' } };
  const view = renderRouter(routes, { initialUrl: '/settings' });
  await view;
  await fireEvent.press(screen.getByText('Usage'));
  expect(screen.getByText('Usage content')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Close Settings' }));
  expect(view.getPathname()).toBe('/chat');
});

it('lists conversations inside the side menu and opens one without bottom tabs', async () => {
  jest.mocked(conversationRepository.list).mockResolvedValue({
    conversations: [{ id: 'saved_1', title: 'Saved conversation', updatedAt: 100, endpointId: 'endpoint_1', activeModelId: 'example/model', status: 'completed' }],
    nextCursor: null,
  });
  const view = renderRouter(routes, { initialUrl: '/chat' });
  await view;
  await fireEvent.press(screen.getByRole('button', { name: 'Open navigation menu' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Open Saved conversation' }));
  await act(() => jest.runOnlyPendingTimers());
  expect(view.getPathname()).toBe('/chat/saved_1');
  expect(screen.queryByText('General')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
});

it.each([
  ['/settings/models/model?modelId=example%2Fmodel', 'Model details content'],
  ['/settings/models/json', 'Model JSON content'],
  ['/settings/model?modelId=example%2Fmodel', 'Model details content'],
  ['/settings/models-json', 'Model JSON content'],
])('keeps model configuration inside the Models tab at %s', async (initialUrl, content) => {
  const view = renderRouter(routes, { initialUrl });
  await view;
  expect(screen.getByText(content)).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Models(?:,|$)/, selected: true })).toBeTruthy();
  expect(screen.queryByText('models/model')).toBeNull();
  expect(screen.queryByText('models/json')).toBeNull();
  await fireEvent.press(screen.getByText('General'));
  expect(screen.getByText('General content')).toBeTruthy();
});
