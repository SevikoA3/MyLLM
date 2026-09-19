import { historyStatus } from './history-screen';

describe('historyStatus', () => {
  it('preserves terminal, interrupted, and active conversation states', () => {
    expect(historyStatus('streaming')).toMatchObject({ label: 'LIVE', detail: 'Inference active' });
    expect(historyStatus('interrupted')).toMatchObject({
      label: 'INTERRUPTED',
      detail: 'Interrupted when the app closed',
    });
    expect(historyStatus('failed')).toMatchObject({ label: 'FAILED', detail: 'Request did not complete' });
    expect(historyStatus(null)).toMatchObject({ label: 'COMPLETED', detail: 'Completed locally' });
  });
});
