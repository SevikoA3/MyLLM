import { act, fireEvent, render } from '@testing-library/react-native';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent, PanResponderCallbacks, PanResponderGestureState } from 'react-native';

import type { ConversationSummary } from '../../../src/domain/conversation';
import { NavigationMenu } from '../../../src/features/history/navigation-menu';
import { conversationRepository } from '../../../src/services/persistence/conversation-store';
import { colors, interaction } from '../../../src/ui/tokens';

jest.mock('../../../src/services/persistence/conversation-store', () => ({
  conversationRepository: { list: jest.fn() },
}));

const conversation: ConversationSummary = {
  id: 'saved_1', title: 'Saved conversation', updatedAt: 100,
  endpointId: 'endpoint_1', activeModelId: 'example/model', status: 'completed',
};
type Page = Awaited<ReturnType<typeof conversationRepository.list>>;
const list = jest.mocked(conversationRepository.list);
const actions = { onNewChat: jest.fn(), onHistory: jest.fn(), onSettings: jest.fn(), onOpenConversation: jest.fn() };
const createResponder = PanResponder.create;
const responders: PanResponderCallbacks[] = [];
const event = {} as GestureResponderEvent;

function swipe(dx: number, dy = 0, x0 = 8): PanResponderGestureState {
  return { stateID: 1, moveX: x0 + dx, moveY: dy, x0, y0: 0, dx, dy, vx: 0, vy: 0, numberActiveTouches: 1, _accountsForMovesUpTo: 0 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  list.mockReset().mockResolvedValue({ conversations: [conversation], nextCursor: null });
  responders.length = 0;
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    responders.push(config);
    return createResponder(config);
  });
});

afterEach(async () => {
  await act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('loads history only on opening and marks the current conversation selected', async () => {
  const first = deferred<Page>();
  list.mockReturnValueOnce(first.promise);
  const view = await render(<NavigationMenu {...actions} currentConversationId={conversation.id} />);
  expect(list).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  expect(view.getByText('Loading conversations...')).toBeTruthy();
  expect(view.queryByText('No conversations yet')).toBeNull();
  await act(() => first.resolve({ conversations: [conversation], nextCursor: null }));
  const row = view.getByRole('button', { name: 'Open Saved conversation', selected: true });
  await fireEvent(row, 'focus');
  expect(StyleSheet.flatten(row.props.style)).toMatchObject({ minHeight: interaction.touchTarget, borderColor: colors.primary, borderWidth: 2 });
  await fireEvent.press(row);
  expect(actions.onOpenConversation).not.toHaveBeenCalled();
  expect(view.getByRole('button', { name: 'Settings' })).toBeDisabled();
  await act(() => jest.runOnlyPendingTimers());
  expect(actions.onOpenConversation).toHaveBeenCalledWith(conversation.id);
  expect(view.queryByRole('button', { name: 'Settings' })).toBeNull();
});

it('preserves loaded rows after pagination fails and retries the same cursor', async () => {
  const cursor = { id: conversation.id, updatedAt: conversation.updatedAt };
  const next = { ...conversation, id: 'saved_2', title: 'Older conversation' };
  list.mockResolvedValueOnce({ conversations: [conversation], nextCursor: cursor })
    .mockRejectedValueOnce(new Error('private database diagnostic'))
    .mockResolvedValueOnce({ conversations: [next], nextCursor: null });
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await fireEvent.press(view.getByRole('button', { name: 'Load more conversations' }));
  expect(view.getByText('Saved conversation')).toBeTruthy();
  expect(view.getByRole('alert')).toHaveTextContent('Could not load conversations. Try again.');
  expect(view.queryByText('private database diagnostic')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Retry history' }));
  expect(list.mock.calls.slice(1)).toEqual([[20, cursor], [20, cursor]]);
  expect(view.getByText('Older conversation')).toBeTruthy();
  expect(view.getByText('Saved conversation')).toBeTruthy();
  expect(view.queryByRole('alert')).toBeNull();
});

it('retries an initial failure without showing a misleading empty state', async () => {
  list.mockRejectedValueOnce(new Error('private database diagnostic'));
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  expect(view.getByRole('alert')).toBeTruthy();
  expect(view.queryByText('No conversations yet')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'Retry history' }));
  expect(list.mock.calls).toEqual([[20, null], [20, null]]);
  expect(view.getByText('Saved conversation')).toBeTruthy();
});

it('does not duplicate a pending page when scrolling repeats', async () => {
  const cursor = { id: conversation.id, updatedAt: conversation.updatedAt };
  const next = deferred<Page>();
  list.mockResolvedValueOnce({ conversations: [conversation], nextCursor: cursor }).mockReturnValueOnce(next.promise);
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await fireEvent(view.getByText('Saved conversation'), 'endReached');
  await fireEvent(view.getByText('Saved conversation'), 'endReached');
  expect(list).toHaveBeenCalledTimes(2);
  await act(() => next.resolve({ conversations: [], nextCursor: null }));
});

it.each(['backdrop', 'Android back'] as const)('dismisses using %s without navigating', async (dismissal) => {
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await act(() => jest.runOnlyPendingTimers());
  if (dismissal === 'backdrop') await fireEvent.press(view.getByRole('button', { name: 'Dismiss navigation menu', includeHiddenElements: true }));
  else await fireEvent(view.getByTestId('navigation-modal'), 'requestClose');
  await act(() => jest.runOnlyPendingTimers());
  expect(view.queryByText('Settings')).toBeNull();
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
});

it('ignores an old history result after closing and reopening', async () => {
  const stale = deferred<Page>();
  list.mockReturnValueOnce(stale.promise).mockResolvedValueOnce({ conversations: [], nextCursor: null });
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await fireEvent.press(view.getByRole('button', { name: 'Close navigation menu' }));
  await act(() => jest.runOnlyPendingTimers());
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await act(() => stale.resolve({ conversations: [conversation], nextCursor: null }));
  expect(view.getByText('No conversations yet')).toBeTruthy();
  expect(view.queryByText('Saved conversation')).toBeNull();
});

it('opens from an edge swipe around screen content while preserving the header trigger', async () => {
  const view = await render(
    <NavigationMenu {...actions} currentConversationId={conversation.id}>
      {(trigger) => <View>{trigger}<Text>Transcript</Text></View>}
    </NavigationMenu>,
  );
  expect(view.getByTestId('navigation-swipe-area').props.onMoveShouldSetResponderCapture).toBeDefined();
  expect(view.getByText('Transcript')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Open navigation menu', expanded: false })).toBeTruthy();
  expect(responders[0].onMoveShouldSetPanResponderCapture?.(event, swipe(12, 0, 40))).toBe(true);
  expect(list).not.toHaveBeenCalled();
  await act(() => responders[0].onPanResponderRelease?.(event, swipe(80, 0, 40)));
  expect(view.getByRole('button', { name: 'Open navigation menu', expanded: true })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Open Saved conversation', selected: true })).toBeTruthy();
});

it.each([
  ['horizontal content', swipe(80, 0, 100)],
  ['horizontal content just outside the 48 dp edge', swipe(80, 0, 49)],
  ['vertical scrolling', swipe(10, 80)],
  ['left swipe', swipe(-80)],
  ['tap', swipe(0)],
] as const)('leaves %s with screen content', async (_name, gesture) => {
  const view = await render(<NavigationMenu {...actions}>{(trigger) => <View>{trigger}</View>}</NavigationMenu>);
  expect(responders[0].onMoveShouldSetPanResponderCapture?.(event, gesture)).toBe(false);
  await act(() => responders[0].onPanResponderRelease?.(event, gesture));
  expect(view.getByRole('button', { name: 'Open navigation menu', expanded: false })).toBeTruthy();
  expect(list).not.toHaveBeenCalled();
});

it('keeps the menu closed after a short or cancelled opening swipe', async () => {
  const view = await render(<NavigationMenu {...actions}>{(trigger) => <View>{trigger}</View>}</NavigationMenu>);
  await act(() => responders[0].onPanResponderRelease?.(event, swipe(20)));
  await act(() => responders[0].onPanResponderTerminate?.(event, swipe(80)));
  expect(view.getByRole('button', { name: 'Open navigation menu', expanded: false })).toBeTruthy();
  expect(list).not.toHaveBeenCalled();
});

it('drags left to close and keeps the modal mounted until the close animation finishes', async () => {
  const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await act(() => jest.runOnlyPendingTimers());
  expect(view.getByTestId('navigation-panel').props.onMoveShouldSetResponderCapture).toBeDefined();
  expect(responders[1].onMoveShouldSetPanResponderCapture?.(event, swipe(-12, 2, 180))).toBe(true);
  expect(responders[1].onMoveShouldSetPanResponderCapture?.(event, swipe(80))).toBe(false);
  expect(responders[1].onMoveShouldSetPanResponderCapture?.(event, swipe(-10, 80))).toBe(false);
  await act(() => responders[1].onPanResponderGrant?.(event, swipe(0)));
  await act(() => responders[1].onPanResponderMove?.(event, swipe(-80)));
  expect(setValue).toHaveBeenCalledWith(-80);
  await act(() => responders[1].onPanResponderRelease?.(event, swipe(-80)));
  expect(view.getByRole('button', { name: 'Settings' })).toBeDisabled();
  expect(view.getByTestId('navigation-panel')).toBeTruthy();
  expect(responders[1].onMoveShouldSetPanResponderCapture?.(event, swipe(-80))).toBe(false);
  await act(() => jest.runOnlyPendingTimers());
  expect(view.queryByTestId('navigation-panel')).toBeNull();
  for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
});

it.each(['short', 'reversed', 'vertical', 'cancelled'] as const)('settles an interrupted %s closing swipe back to the open position', async (interruption) => {
  const timing = jest.spyOn(Animated, 'timing');
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await act(() => jest.runOnlyPendingTimers());
  await act(() => responders[1].onPanResponderGrant?.(event, swipe(0)));
  await act(() => responders[1].onPanResponderMove?.(event, swipe(-20)));
  if (interruption === 'cancelled') await act(() => responders[1].onPanResponderTerminate?.(event, swipe(-80)));
  else await act(() => responders[1].onPanResponderRelease?.(event,
    interruption === 'vertical' ? swipe(-80, 80) : swipe(interruption === 'short' ? -20 : 10)));
  await act(() => jest.runOnlyPendingTimers());
  expect(view.getByRole('button', { name: 'Settings' })).toBeEnabled();
  expect(timing).toHaveBeenLastCalledWith(expect.any(Animated.Value), expect.objectContaining({ toValue: 0 }));
  expect(view.getByRole('button', { name: 'Open navigation menu', expanded: true })).toBeTruthy();
});

it('does not reopen when Android back interrupts a closing drag', async () => {
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await act(() => jest.runOnlyPendingTimers());
  await act(() => responders[1].onPanResponderGrant?.(event, swipe(0)));
  await act(() => responders[1].onPanResponderMove?.(event, swipe(-20)));
  await fireEvent(view.getByTestId('navigation-modal'), 'requestClose');
  await act(() => responders[1].onPanResponderTerminate?.(event, swipe(-20)));
  await act(() => jest.runOnlyPendingTimers());
  expect(view.queryByTestId('navigation-panel')).toBeNull();
});

it('finishes closing when a delayed gesture grant arrives after Android back', async () => {
  const view = await render(<NavigationMenu {...actions} />);
  await fireEvent.press(view.getByRole('button', { name: 'Open navigation menu' }));
  await act(() => jest.runOnlyPendingTimers());
  await fireEvent(view.getByTestId('navigation-modal'), 'requestClose');
  await act(() => responders[1].onPanResponderGrant?.(event, swipe(0)));
  await act(() => responders[1].onPanResponderTerminate?.(event, swipe(-20)));
  await act(() => jest.runOnlyPendingTimers());
  expect(view.queryByTestId('navigation-modal')).toBeNull();
});
