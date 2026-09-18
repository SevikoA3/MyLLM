import { File, Paths } from 'expo-file-system';

import { redactText } from '../../domain/error';

export const MAX_DIAGNOSTIC_RING_BYTES = 2 * 1024 * 1024;

export type DiagnosticEntry = {
  kind: 'response-completed' | 'response-failed' | 'request-cancelled';
  endpointId: string;
  modelId: string;
  attempt: number;
  httpStatus: number | null;
  errorCategory: string | null;
  requestId: string | null;
};

export function parseDiagnosticEntry(value: unknown): DiagnosticEntry | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind !== 'response-completed' && kind !== 'response-failed' && kind !== 'request-cancelled') {
    return null;
  }
  if (
    typeof record.endpointId !== 'string' ||
    typeof record.modelId !== 'string' ||
    typeof record.attempt !== 'number' ||
    !Number.isFinite(record.attempt) ||
    (record.httpStatus !== null && typeof record.httpStatus !== 'number') ||
    (record.errorCategory !== null && typeof record.errorCategory !== 'string') ||
    (record.requestId !== null && typeof record.requestId !== 'string')
  ) {
    return null;
  }
  return {
    kind,
    endpointId: redactText(record.endpointId).slice(0, 128),
    modelId: redactText(record.modelId).slice(0, 256),
    attempt: record.attempt,
    httpStatus: record.httpStatus,
    errorCategory: record.errorCategory === null ? null : redactText(record.errorCategory).slice(0, 64),
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
  writeQueue = writeQueue.then(async () => {
    const file = diagnosticFile();
    const existing = file.exists ? await file.text() : '';
    const safe = parseDiagnosticEntry(entry);
    if (safe === null) {
      return;
    }
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
