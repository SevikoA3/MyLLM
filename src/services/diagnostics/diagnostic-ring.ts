import { File, Paths } from 'expo-file-system';

import { redactText } from '../../domain/error';

export const MAX_DIAGNOSTIC_RING_BYTES = 2 * 1024 * 1024;

export type DiagnosticEntry = {
  kind:
    | 'response-completed'
    | 'response-failed'
    | 'request-cancelled'
    | 'model-discovery-failed'
    | 'tool-failed'
    | 'agent-loop-failed';
  endpointId: string;
  modelId: string | null;
  toolName: string | null;
  attempt: number;
  httpStatus: number | null;
  errorCategory: string | null;
  errorDetail: string | null;
  providerCode: string | null;
  requestId: string | null;
};

export function parseDiagnosticEntry(value: unknown): DiagnosticEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (
    kind !== 'response-completed' &&
    kind !== 'response-failed' &&
    kind !== 'request-cancelled' &&
    kind !== 'model-discovery-failed' &&
    kind !== 'tool-failed' &&
    kind !== 'agent-loop-failed'
  ) {
    return null;
  }
  if (
    typeof record.endpointId !== 'string' ||
    (record.modelId !== null && typeof record.modelId !== 'string') ||
    (record.toolName !== undefined && record.toolName !== null && typeof record.toolName !== 'string') ||
    typeof record.attempt !== 'number' ||
    !Number.isFinite(record.attempt) ||
    (record.httpStatus !== null && typeof record.httpStatus !== 'number') ||
    (record.errorCategory !== null && typeof record.errorCategory !== 'string') ||
    (record.errorDetail !== undefined && record.errorDetail !== null && typeof record.errorDetail !== 'string') ||
    (record.providerCode !== undefined && record.providerCode !== null && typeof record.providerCode !== 'string') ||
    (record.requestId !== null && typeof record.requestId !== 'string')
  ) {
    return null;
  }
  return {
    kind,
    endpointId: redactText(record.endpointId).slice(0, 128),
    modelId: record.modelId === null ? null : redactText(record.modelId).slice(0, 256),
    toolName: typeof record.toolName === 'string' ? redactText(record.toolName).slice(0, 64) : null,
    attempt: record.attempt,
    httpStatus: record.httpStatus,
    errorCategory: record.errorCategory === null ? null : redactText(record.errorCategory).slice(0, 64),
    errorDetail: typeof record.errorDetail === 'string' ? redactText(record.errorDetail).slice(0, 200) : null,
    providerCode: typeof record.providerCode === 'string' ? redactText(record.providerCode).slice(0, 64) : null,
    requestId: record.requestId === null ? null : redactText(record.requestId).slice(0, 128),
  };
}

function diagnosticFile(): File {
  return new File(Paths.cache, 'myllm-diagnostics.ndjson');
}

export function appendDiagnosticLine(
  existing: string,
  entry: DiagnosticEntry,
  maxBytes = MAX_DIAGNOSTIC_RING_BYTES,
): string {
  const lines = existing.split('\n').filter((line) => line.length > 0);
  lines.push(JSON.stringify(entry));
  while (lines.length > 0 && new TextEncoder().encode(lines.join('\n') + '\n').byteLength > maxBytes) {
    lines.shift();
  }
  return lines.length === 0 ? '' : lines.join('\n') + '\n';
}

let writeQueue = Promise.resolve();

export function recordDiagnostic(entry: DiagnosticEntry): Promise<void> {
  const safe = parseDiagnosticEntry(entry);
  if (safe === null) {
    return Promise.resolve();
  }
  if (safe.kind !== 'response-completed' && safe.kind !== 'request-cancelled') {
    console.log('[MyLLM diagnostic]', JSON.stringify(safe));
  }
  writeQueue = writeQueue.then(async () => {
    const file = diagnosticFile();
    const existing = file.exists ? await file.text() : '';
    const next = appendDiagnosticLine(existing, safe);
    if (next.length === 0) {
      return;
    }
    file.create({ overwrite: true });
    file.write(next);
  }).catch(() => undefined);
  return writeQueue;
}

export async function readDiagnosticRing(): Promise<string> {
  const file = diagnosticFile();
  return file.exists ? file.text() : '';
}

export async function clearDiagnosticRing(): Promise<void> {
  await writeQueue;
  const file = diagnosticFile();
  if (file.exists) {
    file.delete();
  }
  const exported = new File(Paths.cache, 'myllm-diagnostics.json');
  if (exported.exists) {
    exported.delete();
  }
}
