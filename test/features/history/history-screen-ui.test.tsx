import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useFocusEffect } from 'expo-router';
import { StyleSheet } from 'react-native';

import type { ConversationCursor, ConversationSummary } from '../../../src/domain/conversation';
import HistoryScreen from '../../../src/features/history/history-screen';
import { conversationRepository } from '../../../src/services/persistence/conversation-store';

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: jest.fn((effect: () => void) => useEffect(effect, [effect])),
  };
});

jest.mock('../../../src/services/persistence/conversation-store', () => ({
  conversationRepository: { list: jest.fn(), rename: jest.fn(), remove: jest.fn() },
}));
jest.mock('../../../src/services/persistence/catalog-transfer', () => ({
  pickConversation: jest.fn(), shareConversation: jest.fn(),
}));
jest.mock('../../../src/services/attachments/images', () => ({ deleteStagedImages: jest.fn() }));

function conversation(index: number, overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'conversation_' + index,
    title: 'Conversation ' + index,
    updatedAt: 1000 - index,
    endpointId: 'endpoint_1',
    activeModelId: 'example/model',
    status: 'completed',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type Page = Awaited<ReturnType<typeof conversationRepository.list>>;
const firstPage = Array.from({ length: 20 }, (_, index) => conversation(index));
const cursor: ConversationCursor = { id: firstPage[19].id, updatedAt: firstPage[19].updatedAt };
const storageError = new Error('private storage diagnostic');
const list = jest.mocked(conversationRepository.list);
const rename = jest.mocked(conversationRepository.rename);
const remove = jest.mocked(conversationRepository.remove);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  list.mockReset().mockResolvedValue({ conversations: [conversation(0)], nextCursor: null });
  rename.mockReset().mockResolvedValue(undefined);
  remove.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

describe('HistoryScreen storage recovery', () => {
  it('shows an initial load failure without an empty state and retries', async () => {
    list.mockRejectedValueOnce(storageError);
    const view = await render(<HistoryScreen />);

    await waitFor(() => expect(view.getByText('Could not load conversations. Try again.')).toBeTruthy());
    expect(view.queryByText('No conversations yet')).toBeNull();
    expect(view.queryByText(storageError.message)).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(view.getByText('Conversation 0')).toBeTruthy());
    expect(list).toHaveBeenCalledTimes(2);
    expect(view.queryByText('Could not load conversations. Try again.')).toBeNull();
  });

  it('keeps loaded rows after a page failure and retries the same cursor', async () => {
    list.mockResolvedValueOnce({ conversations: firstPage, nextCursor: cursor }).mockRejectedValueOnce(storageError);
    const view = await render(<HistoryScreen />);
    await fireEvent(view.getByText('Conversation 0'), 'endReached');

    await waitFor(() => expect(view.getByText('Could not load more conversations. Try again.')).toBeTruthy());
    expect(view.getByText('Conversation 0')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    expect(list.mock.calls[1]).toEqual([20, cursor]);
    expect(list.mock.calls[2]).toEqual([20, cursor]);
    expect(view.queryByText('Could not load more conversations. Try again.')).toBeNull();
  });

  it('does not duplicate a pending page when scroll events repeat', async () => {
    const next = deferred<Page>();
    list.mockResolvedValueOnce({ conversations: firstPage, nextCursor: cursor }).mockReturnValueOnce(next.promise);
    const view = await render(<HistoryScreen />);
    await fireEvent(view.getByText('Conversation 0'), 'endReached');
    await fireEvent(view.getByText('Conversation 0'), 'endReached');

    expect(list).toHaveBeenCalledTimes(2);
    expect(view.getByText('Loading more conversations...')).toBeTruthy();
    await act(() => next.resolve({ conversations: [conversation(20)], nextCursor: null }));
    expect(view.queryByText('Loading more conversations...')).toBeNull();
  });

  it('validates empty titles and preserves the draft after a failed rename', async () => {
    rename.mockRejectedValueOnce(storageError);
    const view = await render(<HistoryScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Rename Conversation 0' }));
    await fireEvent.changeText(view.getByLabelText('Conversation title'), '   ');
    await fireEvent.press(view.getByRole('button', { name: /Save [Cc]hanges/ }));

    expect(view.getByText('Enter a conversation title.')).toBeTruthy();
    expect(rename).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText('Conversation title'), '  Revised title  ');
    await fireEvent.press(view.getByRole('button', { name: /Save [Cc]hanges/ }));

    await waitFor(() => expect(view.getByText('Could not rename conversation. Try again.')).toBeTruthy());
    expect(view.getByLabelText('Conversation title').props.value).toBe('  Revised title  ');
    expect(view.queryByText(storageError.message)).toBeNull();
    list.mockResolvedValue({ conversations: [conversation(0, { title: 'Revised title' })], nextCursor: null });
    await fireEvent.press(view.getByRole('button', { name: /Save [Cc]hanges/ }));

    await waitFor(() => expect(view.getByText('Revised title')).toBeTruthy());
    expect(rename.mock.calls).toEqual([['conversation_0', 'Revised title'], ['conversation_0', 'Revised title']]);
  });

  it('blocks duplicate deletion and dismissal while busy, preserves the row on failure, and retries', async () => {
    const deletion = deferred<void>();
    remove.mockReturnValueOnce(deletion.promise);
    const view = await render(<HistoryScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Delete Conversation 0' }));
    await fireEvent.press(view.getByRole('button', { name: 'Confirm Delete' }));

    expect(view.getByRole('button', { name: 'Confirm Delete' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'Confirm Delete' }));
    await fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
    const backdrop = view.getAllByLabelText('Dismiss delete confirmation', { includeHiddenElements: true }).at(-1)!;
    expect(backdrop).toBeDisabled();
    await fireEvent.press(backdrop);
    await fireEvent(view.getByText('Delete conversation?'), 'requestClose');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(view.getByText('Delete conversation?')).toBeTruthy();
    await act(() => deletion.reject(storageError));

    await waitFor(() => expect(view.getByText('Could not delete conversation. Try again.')).toBeTruthy());
    expect(view.getByRole('button', { name: 'Delete Conversation 0', includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByText(storageError.message)).toBeNull();
    list.mockResolvedValue({ conversations: [], nextCursor: null });
    await fireEvent.press(view.getByRole('button', { name: 'Confirm Delete' }));

    await waitFor(() => expect(view.getByText('No conversations yet')).toBeTruthy());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(view.queryByRole('button', { name: 'Delete Conversation 0' })).toBeNull();
  });
});

describe('HistoryScreen complete filtering', () => {
  it('waits for the first load before searching remaining pages and shares repeated focus requests', async () => {
    const first = deferred<Page>();
    list.mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ conversations: [conversation(20, { title: 'Older match' })], nextCursor: null });
    const view = await render(<HistoryScreen />);
    expect(view.getByText('Loading conversations...')).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Filter conversations'), 'older match');
    const focus = jest.mocked(useFocusEffect).mock.calls.at(-1)![0];
    await act(() => { focus(); focus(); });

    expect(list).toHaveBeenCalledTimes(1);
    expect(view.getByText('Searching conversations...')).toBeTruthy();
    expect(view.queryByText('No matching conversations')).toBeNull();
    await act(() => first.resolve({ conversations: firstPage, nextCursor: cursor }));
    await waitFor(() => expect(view.getByText('Older match')).toBeTruthy());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('shows plain history copy and keeps filter targets at least 44 dp', async () => {
    list.mockResolvedValue({ conversations: [], nextCursor: null });
    const view = await render(<HistoryScreen />);

    expect(list).toHaveBeenCalledTimes(1);
    expect(view.getByText('History')).toBeTruthy();
    expect(view.queryByText('MyLLM')).toBeNull();
    expect(view.getByText('No conversations yet')).toBeTruthy();
    expect(view.getAllByText('New chat')).toHaveLength(2);
    expect(StyleSheet.flatten(view.getByLabelText('Filter conversations').props.style).minHeight).toBeGreaterThanOrEqual(44);
    const filterStyle = StyleSheet.flatten(view.getByRole('button', { name: 'Show interrupted conversations only' }).props.style);
    expect(filterStyle.width).toBeGreaterThanOrEqual(44);
    expect(filterStyle.height).toBeGreaterThanOrEqual(44);
  });

  it('finds a title after the first 20 rows without claiming empty while searching', async () => {
    const next = deferred<Page>();
    list.mockResolvedValueOnce({ conversations: firstPage, nextCursor: cursor }).mockReturnValueOnce(next.promise);
    const view = await render(<HistoryScreen />);
    expect(list).toHaveBeenCalledTimes(1);
    await fireEvent.changeText(view.getByLabelText('Filter conversations'), 'older match');

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(view.getByText('Searching conversations...')).toBeTruthy();
    expect(view.queryByText('No matching conversations')).toBeNull();
    await act(() => next.resolve({ conversations: [conversation(20, { title: 'Older match' })], nextCursor: null }));

    await waitFor(() => expect(view.getByText('Older match')).toBeTruthy());
    expect(list).toHaveBeenLastCalledWith(20, cursor);
    expect(view.queryByText('Searching conversations...')).toBeNull();
  });

  it('continues through nonmatching pages for the interrupted filter', async () => {
    const secondCursor = { id: 'conversation_20', updatedAt: 980 };
    list.mockResolvedValueOnce({ conversations: firstPage, nextCursor: cursor })
      .mockResolvedValueOnce({ conversations: [conversation(20)], nextCursor: secondCursor })
      .mockResolvedValueOnce({ conversations: [conversation(21, { status: 'interrupted' })], nextCursor: null });
    const view = await render(<HistoryScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Show interrupted conversations only' }));

    await waitFor(() => expect(view.getByText('Conversation 21')).toBeTruthy());
    expect(list.mock.calls).toEqual([[20], [20, cursor], [20, secondCursor]]);
    expect(view.queryByText('Conversation 0')).toBeNull();
  });

  it('pauses on a search page failure and retries without a false empty result', async () => {
    list.mockResolvedValueOnce({ conversations: firstPage, nextCursor: cursor }).mockRejectedValueOnce(storageError)
      .mockResolvedValueOnce({ conversations: [conversation(20, { title: 'Older match' })], nextCursor: null });
    const view = await render(<HistoryScreen />);
    await fireEvent.changeText(view.getByLabelText('Filter conversations'), 'older match');

    await waitFor(() => expect(view.getByText('Could not load more conversations. Try again.')).toBeTruthy());
    expect(view.queryByText('No matching conversations')).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
    await fireEvent.press(view.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(view.getByText('Older match')).toBeTruthy());
    expect(list.mock.calls[2]).toEqual([20, cursor]);
  });

  it('shows no matches only after search completes and lets the user clear filters', async () => {
    list.mockResolvedValueOnce({ conversations: firstPage, nextCursor: cursor })
      .mockResolvedValueOnce({ conversations: [conversation(20)], nextCursor: null });
    const view = await render(<HistoryScreen />);
    await fireEvent.changeText(view.getByLabelText('Filter conversations'), 'absent');

    await waitFor(() => expect(view.getByText('No matching conversations')).toBeTruthy());
    expect(list).toHaveBeenCalledTimes(2);
    await fireEvent.press(view.getByRole('button', { name: 'Clear conversation filters' }));
    expect(view.getByText('Conversation 0')).toBeTruthy();
    expect(view.getByLabelText('Filter conversations').props.value).toBe('');
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('shares a pending page with scroll events and serializes a focus refresh', async () => {
    const next = deferred<Page>();
    list.mockResolvedValueOnce({ conversations: firstPage, nextCursor: cursor }).mockReturnValueOnce(next.promise)
      .mockResolvedValueOnce({ conversations: [conversation(0, { title: 'Fresh history' })], nextCursor: null });
    const view = await render(<HistoryScreen />);
    await fireEvent.changeText(view.getByLabelText('Filter conversations'), 'conversation');
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await fireEvent(view.getByText('Conversation 0'), 'endReached');
    await fireEvent.changeText(view.getByLabelText('Filter conversations'), '');
    const focus = jest.mocked(useFocusEffect).mock.calls.at(-1)![0];
    await act(() => { focus(); focus(); });

    expect(list).toHaveBeenCalledTimes(2);
    await act(() => next.resolve({ conversations: [conversation(20)], nextCursor: null }));
    await waitFor(() => expect(view.getByText('Fresh history')).toBeTruthy());
    expect(list).toHaveBeenCalledTimes(3);
    expect(view.queryByText('Conversation 20')).toBeNull();
  });

  it('stops loading remaining pages when filters are cleared', async () => {
    const next = deferred<Page>();
    list.mockResolvedValueOnce({ conversations: firstPage, nextCursor: cursor }).mockReturnValueOnce(next.promise);
    const view = await render(<HistoryScreen />);
    await fireEvent.changeText(view.getByLabelText('Filter conversations'), 'absent');
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await fireEvent.changeText(view.getByLabelText('Filter conversations'), '');
    await act(() => next.resolve({ conversations: [conversation(20)], nextCursor: { id: 'conversation_20', updatedAt: 980 } }));

    expect(list).toHaveBeenCalledTimes(2);
    expect(view.getByText('Conversation 0')).toBeTruthy();
    expect(view.queryByText('Searching conversations...')).toBeNull();
  });
});
