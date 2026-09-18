import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ReasoningSelector } from './chat-screen';

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

    expect(view.getByText('Thinking')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Thinking'));
    await waitFor(() => expect(view.getByText('high')).toBeTruthy());

    fireEvent.press(view.getByLabelText('Thinking high'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('high'));
    expect(view.queryByLabelText('Thinking high')).toBeNull();
  });
});
