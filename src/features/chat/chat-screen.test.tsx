import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ReasoningSelector, ToolApprovalModal } from './chat-screen';

describe('ReasoningSelector', () => {
  it('memilih thinking dari dropdown', async () => {
    const onSelect = jest.fn();
    const view = await render(
      <ReasoningSelector
        options={['auto', 'low', 'high']}
        selected="auto"
        disabled={false}
        onSelect={onSelect}
      />,
    );

    expect(view.getByText('auto')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Thinking, auto'));
    await waitFor(() => expect(view.getByText('high')).toBeTruthy());

    fireEvent.press(view.getByLabelText('Thinking high'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('high'));
    expect(view.queryByLabelText('Thinking high')).toBeNull();
  });
});

describe('ToolApprovalModal', () => {
  it('shows call details and resolves one approval', async () => {
    const onResolve = jest.fn();
    const view = await render(
      <ToolApprovalModal
        activity={{
          id: 'tool_1',
          callId: 'call_1',
          name: 'get_current_time',
          argumentsJson: '{"timezone":"Asia/Jakarta"}',
          target: 'Device clock',
          sideEffect: 'Reads device time.',
          status: 'awaiting_approval',
          approval: 'pending',
          result: null,
        }}
        onResolve={onResolve}
      />,
    );

    expect(view.getByText('get_current_time')).toBeTruthy();
    expect(view.getByText('{"timezone":"Asia/Jakarta"}')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Reject tool call'));

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(false));
  });
});
