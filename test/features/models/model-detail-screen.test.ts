import {
  providerMetadataRows,
  sourceDetails,
} from '../../../src/features/models/model-detail-screen';

describe('sourceDetails', () => {
  it('keeps catalog provenance distinct from unavailable metadata', () => {
    expect(sourceDetails('live').label).toBe('LIVE ENDPOINT');
    expect(sourceDetails('bundled').label).toBe('BUNDLED SPEC');
    expect(sourceDetails('user-override').label).toBe('USER OVERRIDE');
    expect(sourceDetails('history').label).toBe('HISTORY RECORD');
    expect(sourceDetails(null).label).toBe('UNKNOWN');
  });
});

describe('providerMetadataRows', () => {
  it('menampilkan metadata tarif Yonda tanpa menebak field yang hilang', () => {
    expect(providerMetadataRows({
      multiplier: 1.25,
      effective_rate_idr_per_m: 37_500,
    })).toEqual([
      { label: 'Billing multiplier', value: '1.25x' },
      { label: 'Effective rate', value: 'IDR 37500 / 1M tokens' },
    ]);
    expect(providerMetadataRows({ multiplier: 'unknown' })).toEqual([]);
  });
});
