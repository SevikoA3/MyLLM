import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ContextBudgetResult } from '../../domain/context';
import { ContextPill } from './context-pill';

function result(overrides: Partial<ContextBudgetResult> = {}): ContextBudgetResult {
  return {
    contextWindow: 32_000,
    inputTokensEstimate: 1_000,
    requestedOutputReserve: 4_096,
    safetyMargin: 1_024,
    prospectiveUsed: 6_120,
    remainingTokens: 25_880,
    usedPercent: 19.125,
    remainingPercent: 80.875,
    calibrationInputTokens: null,
    calibrationDeltaTokens: null,
    quality: 'estimated',
    ...overrides,
  };
}

describe('ContextPill', () => {
  it('shows a circular usage meter and hides details until opened', async () => {
    const view = await render(<ContextPill budget={result()} />);

    expect(view.getByLabelText('Context usage, 19 percent')).toBeTruthy();
    expect(view.queryByText('19%')).toBeNull();
    expect(view.queryByText('Context 32,000 · Input ~1,000 tokens · Left 80.9%')).toBeNull();

    fireEvent.press(view.getByLabelText('Context usage, 19 percent'));

    await waitFor(() =>
      expect(view.getByText('Context 32,000 · Input ~1,000 tokens · Left 80.9%')).toBeTruthy(),
    );
  });

  it('shows unknown when context usage is unavailable', async () => {
    const view = await render(
      <ContextPill
        budget={result({
          contextWindow: null,
          safetyMargin: null,
          prospectiveUsed: null,
          remainingTokens: null,
          usedPercent: null,
          remainingPercent: null,
          quality: 'unknown',
        })}
      />,
    );

    expect(view.getByLabelText('Context usage unavailable')).toBeTruthy();
    expect(view.queryByText('?')).toBeNull();
    expect(view.queryByText(/Input ~1,000 tokens/)).toBeNull();
  });
});
