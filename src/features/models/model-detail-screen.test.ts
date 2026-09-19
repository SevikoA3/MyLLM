import { sourceDetails } from './model-detail-screen';

describe('sourceDetails', () => {
  it('keeps catalog provenance distinct from unavailable metadata', () => {
    expect(sourceDetails('live').label).toBe('LIVE ENDPOINT');
    expect(sourceDetails('bundled').label).toBe('BUNDLED SPEC');
    expect(sourceDetails('user-override').label).toBe('USER OVERRIDE');
    expect(sourceDetails('history').label).toBe('HISTORY RECORD');
    expect(sourceDetails(null).label).toBe('UNKNOWN');
  });
});
