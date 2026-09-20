import {
  appendDiagnosticLine,
  MAX_DIAGNOSTIC_RING_BYTES,
  parseDiagnosticEntry,
  type DiagnosticEntry,
} from './diagnostic-ring';

const entry: DiagnosticEntry = {
  kind: 'response-failed',
  endpointId: 'ep_1',
  modelId: 'model_1',
  toolName: null,
  attempt: 1,
  httpStatus: 503,
  errorCategory: 'server',
  errorDetail: null,
  providerCode: null,
  requestId: null,
};

describe('diagnostic ring', () => {
  it('membuang record tertua saat cap 2 MB terlampaui', () => {
    const first = appendDiagnosticLine('', entry, 180);
    const second = appendDiagnosticLine(first, { ...entry, attempt: 2 }, 180);
    const third = appendDiagnosticLine(second, { ...entry, attempt: 3 }, 180);

    expect(new TextEncoder().encode(third).byteLength).toBeLessThanOrEqual(180);
    expect(third).not.toContain('"attempt":1');
    expect(MAX_DIAGNOSTIC_RING_BYTES).toBe(2 * 1024 * 1024);
  });

  it('menolak field content dan meredaksi nilai yang diekspor', () => {
    expect(parseDiagnosticEntry({ ...entry, prompt: 'secret' })).toEqual(entry);
    expect(parseDiagnosticEntry({ ...entry, modelId: 'sk-secret' })?.modelId).toBe('[redacted]');
    expect(parseDiagnosticEntry({ ...entry, errorDetail: 'Bearer secret' })?.errorDetail).toBe('[redacted]');
  });

  it('menyimpan metadata kegagalan tool tanpa output', () => {
    expect(parseDiagnosticEntry({
      ...entry,
      kind: 'tool-failed',
      modelId: null,
      toolName: 'web_search',
      output: '{"secret":"hidden"}',
    })).toEqual({
      ...entry,
      kind: 'tool-failed',
      modelId: null,
      toolName: 'web_search',
    });
  });

  it('membaca record lama yang belum memiliki nama tool', () => {
    const { errorDetail: _errorDetail, providerCode: _providerCode, toolName: _toolName, ...legacyEntry } = entry;
    expect(parseDiagnosticEntry(legacyEntry)).toEqual(entry);
  });
});
