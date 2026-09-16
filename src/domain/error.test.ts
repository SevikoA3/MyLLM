import {
  appErrorToDiagnostic,
  categorizeHttpStatus,
  createAppError,
  fromHttpResponse,
  fromNetworkError,
  parseProviderErrorBody,
  redactText,
} from './error';
import { buildAuthHeaders } from './endpoint';

const TEST_KEY = 'sk-test-abcdef123456';

describe('redactText', () => {
  it('menyamarkan Authorization, x-api-key, bearer, dan pola sk-', () => {
    const redacted = redactText(
      `Authorization: Bearer ${TEST_KEY} dan x-api-key: ${TEST_KEY} juga ${TEST_KEY}`,
    );
    expect(redacted).not.toContain(TEST_KEY);
    expect(redacted).toContain('[redacted]');
  });

  it('membiarkan teks tanpa secret apa adanya', () => {
    expect(redactText('Model tidak ditemukan di katalog.')).toBe('Model tidak ditemukan di katalog.');
  });
});

describe('createAppError', () => {
  it('menyimpan category, httpStatus, providerCode, requestId, retryable, dan safeDetails', () => {
    const error = createAppError({
      category: 'auth',
      message: 'Key ditolak',
      httpStatus: 401,
      providerCode: 'invalid_api_key',
      requestId: 'req_1',
      retryable: false,
      safeDetails: { endpointId: 'amanai-main' },
    });

    expect(error).toEqual({
      category: 'auth',
      message: 'Key ditolak',
      httpStatus: 401,
      providerCode: 'invalid_api_key',
      requestId: 'req_1',
      retryable: false,
      safeDetails: { endpointId: 'amanai-main' },
    });
  });

  it('meredaksi secret pada message dan safeDetails', () => {
    const error = createAppError({
      category: 'auth',
      message: `Bearer ${TEST_KEY} ditolak`,
      httpStatus: 401,
      providerCode: null,
      requestId: null,
      retryable: false,
      safeDetails: { authorization: `Bearer ${TEST_KEY}` },
    });

    expect(JSON.stringify(error)).not.toContain(TEST_KEY);
    expect(JSON.stringify(error)).not.toContain('sk-');
  });
});

describe('header auth dan diagnostic', () => {
  it('tidak membocorkan header auth lewat diagnostic', () => {
    const headers = buildAuthHeaders('bearer', TEST_KEY);
    const error = createAppError({
      category: 'auth',
      message: 'Unauthorized',
      httpStatus: 401,
      providerCode: null,
      requestId: null,
      retryable: false,
      safeDetails: { headers: JSON.stringify(headers) },
    });

    const diagnostic = appErrorToDiagnostic(error);
    expect(diagnostic).not.toContain(TEST_KEY);
    expect(diagnostic).toContain('401');
  });

  it('menyusun diagnostic tanpa field yang tidak tersedia', () => {
    const error = createAppError({
      category: 'network',
      message: 'Connection refused',
      httpStatus: null,
      providerCode: null,
      requestId: null,
      retryable: true,
      safeDetails: { url: 'https://api.example.com/v1/models' },
    });

    expect(appErrorToDiagnostic(error)).toBe(
      'network: Connection refused | retryable | url=https://api.example.com/v1/models',
    );
  });
});

describe('categorizeHttpStatus', () => {
  it('memetakan status yang dipakai endpoint ke kategori dan retry policy', () => {
    expect(categorizeHttpStatus(401)).toEqual({ category: 'auth', retryable: false });
    expect(categorizeHttpStatus(402)).toEqual({ category: 'billing', retryable: false });
    expect(categorizeHttpStatus(403)).toEqual({ category: 'auth', retryable: false });
    expect(categorizeHttpStatus(404)).toEqual({ category: 'not-found', retryable: false });
    expect(categorizeHttpStatus(429)).toEqual({ category: 'rate-limit', retryable: true });
    expect(categorizeHttpStatus(500)).toEqual({ category: 'server', retryable: false });
    expect(categorizeHttpStatus(502)).toEqual({ category: 'server', retryable: true });
    expect(categorizeHttpStatus(503)).toEqual({ category: 'server', retryable: true });
  });

  it('tidak menandai 400 generik sebagai retryable', () => {
    expect(categorizeHttpStatus(400)).toEqual({ category: 'request', retryable: false });
  });
});

describe('parseProviderErrorBody', () => {
  it('membaca envelope error standar', () => {
    const parsed = parseProviderErrorBody(
      JSON.stringify({
        error: { message: 'Model not found', code: 'model_not_found', request_id: 'req_9' },
      }),
    );
    expect(parsed).toEqual({ message: 'Model not found', providerCode: 'model_not_found', requestId: 'req_9' });
  });

  it('membaca request ID di level atas', () => {
    const parsed = parseProviderErrorBody(JSON.stringify({ message: 'boom', request_id: 'req_top' }));
    expect(parsed.requestId).toBe('req_top');
  });

  it('menerima error sebagai string JSON', () => {
    const parsed = parseProviderErrorBody(
      JSON.stringify({ error: JSON.stringify({ message: 'nested', code: 'x' }) }),
    );
    expect(parsed.message).toBe('Endpoint mengembalikan error tanpa pesan.');
  });

  it('memangkas body non-JSON dan tetap meredaksi secret', () => {
    const parsed = parseProviderErrorBody(`<html>Bearer ${TEST_KEY}</html>`);
    expect(parsed.providerCode).toBeNull();
    expect(parsed.message).not.toContain(TEST_KEY);
  });
});

describe('fromHttpResponse', () => {
  it('menghasilkan AppError lengkap dari response error', () => {
    const error = fromHttpResponse({
      status: 429,
      body: JSON.stringify({ error: { message: 'Rate limit', code: 'rate_limit' } }),
      endpointId: 'amanai-main',
      url: 'https://api.amanai.dev/v1/responses',
    });

    expect(error.category).toBe('rate-limit');
    expect(error.retryable).toBe(true);
    expect(error.httpStatus).toBe(429);
    expect(error.providerCode).toBe('rate_limit');
  });
});

describe('fromNetworkError', () => {
  it('menandai timeout sebagai retryable', () => {
    const error = fromNetworkError(new Error('Request timeout after 15000ms'), { endpointId: 'x' });
    expect(error.category).toBe('timeout');
    expect(error.retryable).toBe(true);
  });

  it('memisahkan TLS failure dari network generic', () => {
    const error = fromNetworkError(new Error('SSL certificate problem: self signed certificate'), {
      endpointId: 'x',
    });
    expect(error.category).toBe('tls');
    expect(error.retryable).toBe(false);
  });
});
