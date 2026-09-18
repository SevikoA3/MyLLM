import { render } from '@testing-library/react-native';

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
  it('menampilkan occupancy, reserve, margin, dan quality', async () => {
    const view = await render(<ContextPill budget={result()} />);

    expect(view.getByText('Input ~1,000 tok · Context 32,000 tok · Left 25,880 tok')).toBeTruthy();
    expect(
      view.getByText(
        'Prospective 6,120 tok = input + reserve + margin · 19.1% used · 80.9% left',
      ),
    ).toBeTruthy();
    expect(view.getByText('Reserve 4,096 · Margin 1,024 · estimated')).toBeTruthy();
  });

  it('tidak menampilkan persentase saat context unknown', async () => {
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

    expect(view.getByText('Input ~1,000 tok · Context unknown')).toBeTruthy();
    expect(view.getByText('Reserve 4,096 · Margin unavailable · unknown')).toBeTruthy();
    expect(view.queryByText(/% used/)).toBeNull();
  });
});
