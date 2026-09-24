import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { MessageBubble, ReasoningSelector, ToolApprovalControl, ToolProgress, WebSearchSourceCards, WebToolSourceCards } from '../../../src/features/chat/chat-screen';

describe('MessageBubble', () => {
  it('uses compact markdown headings and the reference transcript shape', async () => {
    const view = await render(
      <MessageBubble
        modelId="example/model"
        message={{
          id: 'assistant_1',
          role: 'assistant',
          text: '# A compact heading\n\n- A list item\n\n`inline code`',
          status: 'completed',
          reasoningSummary: null,
          attachments: [],
        }}
      />,
    );

    expect(view.getByLabelText('Assistant response')).toHaveStyle({
      padding: 12,
      borderRadius: 16,
      borderTopLeftRadius: 2,
    });
    expect(view.getByText('A compact heading')).toHaveStyle({ fontSize: 26, lineHeight: 32 });
    expect(view.getByText('inline code')).toHaveStyle({ paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2 });
  });
});

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
    expect(view.getByLabelText('Thinking, auto')).toHaveStyle({ borderRadius: 4 });
    fireEvent.press(view.getByLabelText('Thinking, auto'));
    await waitFor(() => expect(view.getByText('high')).toBeTruthy());

    fireEvent.press(view.getByLabelText('Thinking high'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('high'));
    await waitFor(() => expect(view.queryByLabelText('Thinking high')).toBeNull());
  });
});

describe('ToolApprovalControl', () => {
  it('changes read-only tool approval before a chat request', async () => {
    const onResolve = jest.fn();
    const view = await render(
      <ToolApprovalControl enabled={false} disabled={false} onToggle={onResolve} />,
    );

    fireEvent.press(view.getByLabelText('Tool approval, read-only tools require approval'));

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(true));
  });
});

describe('ToolProgress', () => {
  it('keeps tool arguments and result in an accordion', async () => {
    const view = await render(
      <ToolProgress
        calls={[{
          id: 'tool_1',
          callId: 'call_1',
          name: 'get_current_time',
          argumentsJson: '{"timezone":"Asia/Jakarta"}',
          target: 'Device clock',
          sideEffect: 'Reads device time.',
          status: 'completed',
          approval: 'not_required',
          result: { callId: 'call_1', output: '{"time":"10:00"}', isError: false },
        }]}
      />,
    );

    expect(view.queryByText('{"timezone":"Asia/Jakarta"}')).toBeNull();
    expect(view.queryByText('{"time":"10:00"}')).toBeNull();
    fireEvent.press(view.getByLabelText('Tool request, get_current_time, Tool completed'));
    await waitFor(() => expect(view.getByText('{"timezone":"Asia/Jakarta"}')).toBeTruthy());
    expect(view.getByText('{"time":"10:00"}')).toBeTruthy();
  });

  it('resolves approval from its tool request bubble', async () => {
    const onResolve = jest.fn();
    const view = await render(
      <ToolProgress
        onResolve={onResolve}
        calls={[{
          id: 'tool_1',
          callId: 'call_1',
          name: 'get_current_time',
          argumentsJson: '{"timezone":"Asia/Jakarta"}',
          target: 'Device clock',
          sideEffect: 'Reads device time.',
          status: 'awaiting_approval',
          approval: 'pending',
          result: null,
        }]}
      />,
    );

    fireEvent.press(view.getByLabelText('Approve tool request'));

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(true));
  });
});

describe('WebSearchSourceCards', () => {
  it('shows raw gateway sources', async () => {
    const view = await render(
      <WebSearchSourceCards
        output={JSON.stringify({
          query: 'example',
          results: [
            {
              title: 'Example article',
              url: 'https://example.com/article',
              snippet: 'Current information.',
              published_date: '2026-09-12',
            },
          ],
        })}
      />,
    );

    expect(view.getByLabelText('Open source Example article')).toBeTruthy();
    expect(view.getByText('Untrusted web content')).toBeTruthy();
  });

  it('shows a fetched source with its truncation state', async () => {
    const view = await render(
      <WebToolSourceCards
        name="web_fetch"
        output={JSON.stringify({
          url: 'https://example.com/article',
          title: 'Example article',
          content_type: 'text/html',
          content: 'Readable page text.',
          truncated: true,
        })}
      />,
    );

    expect(view.getByLabelText('Open source Example article')).toBeTruthy();
    expect(view.getByText('example.com · truncated')).toBeTruthy();
  });

  it('shows a Firecrawl fetched source', async () => {
    const view = await render(
      <WebToolSourceCards
        name="web_fetch"
        output={JSON.stringify({
          success: true,
          data: {
            markdown: 'Readable page text.',
            metadata: {
              title: 'Example article',
              sourceURL: 'https://example.com/article',
            },
          },
        })}
      />,
    );

    expect(view.getByLabelText('Open source Example article')).toBeTruthy();
    expect(view.getByText('Readable page text.')).toBeTruthy();
  });
});
