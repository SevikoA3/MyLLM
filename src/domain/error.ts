/**
 * Semua pesan yang mungkin memuat secret dilewatkan redactText: message provider,
 * detail yang ikut di-render ke UI, dan payload diagnostic.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\b(bearer)\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bx-api-key\b\s*[:=]\s*[^\s,;"']+/gi,
  /\bauthorization\b\s*[:=]\s*[^\s,;"']+/gi,
  /\bsk-[A-Za-z0-9_-]{4,}/g,
];

const REDACTED = '[redacted]';

export function redactText(text: string): string {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, REDACTED), text);
}

export function redactRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([name, value]) => [name, redactText(value)]),
  );
}

export type ErrorCategory =
  | 'auth'
  | 'billing'
  | 'quota'
  | 'model'
  | 'not-found'
  | 'request'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'tls'
  | 'timeout'
  | 'cancelled'
  | 'schema'
  | 'unknown';

export type AppErrorInput = {
  category: ErrorCategory;
  message: string;
  httpStatus: number | null;
  providerCode: string | null;
  requestId: string | null;
  retryable: boolean;
  safeDetails: Record<string, string>;
};

export type AppError = Omit<AppErrorInput, 'message' | 'safeDetails'> & {
  message: string;
  safeDetails: Record<string, string>;
};

export function createAppError(input: AppErrorInput): AppError {
  return { ...input, message: redactText(input.message), safeDetails: redactRecord(input.safeDetails) };
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'category' in value &&
    'safeDetails' in value &&
    'retryable' in value
  );
}

export function appErrorToDiagnostic(error: AppError): string {
  return [
    `${error.category}: ${error.message}`,
    error.httpStatus === null ? null : `HTTP ${error.httpStatus}`,
    error.providerCode === null ? null : `code ${error.providerCode}`,
    error.requestId === null ? null : `request ${error.requestId}`,
    error.retryable ? 'retryable' : null,
    ...Object.entries(error.safeDetails).map(([key, value]) => `${key}=${value}`),
  ]
    .filter((line): line is string => line !== null)
    .join(' | ');
}

/**
 * Pemetaan status HTTP ke kategori. AmanAI dan OpenAI memakai status yang sama
 * untuk kelas error ini, jadi tabelnya satu.
 */
export function categorizeHttpStatus(status: number): { category: ErrorCategory; retryable: boolean } {
  if (status === 401 || status === 403) {
    return { category: 'auth', retryable: false };
  }
  if (status === 402) {
    return { category: 'billing', retryable: false };
  }
  if (status === 404) {
    return { category: 'not-found', retryable: false };
  }
  if (status === 408 || status === 504) {
    return { category: 'timeout', retryable: true };
  }
  if (status === 409 || status === 422) {
    return { category: 'model', retryable: false };
  }
  if (status === 429) {
    return { category: 'rate-limit', retryable: true };
  }
  if (status === 502 || status === 503) {
    return { category: 'server', retryable: true };
  }
  if (status >= 400 && status < 500) {
    return { category: 'request', retryable: false };
  }
  if (status >= 500) {
    return { category: 'server', retryable: false };
  }
  return { category: 'unknown', retryable: false };
}

/**
 * Terima body error dalam bentuk JSON, JSON sebagai string, atau teks biasa,
 * lalu ambil hanya field yang aman ditampilkan.
 */
export function parseProviderErrorBody(body: string): {
  message: string;
  providerCode: string | null;
  requestId: string | null;
} {
  let payload: unknown = body;
  try {
    payload = JSON.parse(body);
  } catch {
    return { message: redactText(body.trim()).slice(0, 200), providerCode: null, requestId: null };
  }
  const envelope = isRecord(payload) && isRecord(payload.error) ? payload.error : payload;
  const record = isRecord(envelope) ? envelope : {};
  const providerCode = pickString(record.code) ?? pickString(record.type) ?? null;
  const requestId =
    pickString(record.request_id) ??
    pickString(record.requestId) ??
    (isRecord(payload) ? pickString(payload.request_id) : null) ??
    null;
  const message =
    pickString(record.message) ?? pickString(record.detail) ?? 'Endpoint mengembalikan error tanpa pesan.';
  return { message: redactText(message), providerCode, requestId };
}

export function fromHttpResponse(input: {
  status: number;
  body: string;
  endpointId: string;
  url: string;
}): AppError {
  const { category, retryable } = categorizeHttpStatus(input.status);
  const parsed = parseProviderErrorBody(input.body);
  return createAppError({
    category,
    message: parsed.message,
    httpStatus: input.status,
    providerCode: parsed.providerCode,
    requestId: parsed.requestId,
    retryable,
    safeDetails: { endpointId: input.endpointId, url: input.url },
  });
}

export function fromNetworkError(error: unknown, safeDetails: Record<string, string>): AppError {
  const message = error instanceof Error ? error.message : String(error);
  const isTimeout = /timeout|timed out|abort/i.test(message);
  const isTls = /certificate|ssl|tls/i.test(message);
  return createAppError({
    category: isTimeout ? 'timeout' : isTls ? 'tls' : 'network',
    message,
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: isTimeout,
    safeDetails,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
