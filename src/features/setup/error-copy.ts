import type { AppError } from '../../domain/error';
import type { ModelRecord } from '../../domain/model';

export type ErrorCopy = {
  title: string;
  body: string;
  retryable: boolean;
};

const FALLBACK: ErrorCopy = {
  title: 'Connection failed',
  body: 'The endpoint could not be reached. Check the base URL and network.',
  retryable: true,
};

// Pesan per kategori. URL final selalu ditampilkan supaya salah /v1 langsung terlihat.
export function describe(error: AppError, finalUrl: string): ErrorCopy {
  switch (error.category) {
    case 'auth':
    case 'billing':
      return {
        title: error.category === 'billing' ? 'Credential has no access' : 'Credential rejected',
        body:
          'The endpoint rejected this API key (HTTP ' +
          String(error.httpStatus ?? '-') +
          '). Enter a new key and reconnect.',
        retryable: false,
      };
    case 'not-found':
      return {
        title: 'Model list URL not found',
        body:
          'Final URL: ' +
          finalUrl +
          '. Check whether the base URL needs /v1, or change the model path in Advanced.',
        retryable: true,
      };
    case 'timeout':
      return {
        title: '15-second timeout',
        body: 'The endpoint did not respond within 15 seconds. Check the network and try again.',
        retryable: true,
      };
    case 'tls':
      return {
        title: 'TLS certificate rejected',
        body: 'The app does not trust an unverifiable certificate. Fix the certificate on the server.',
        retryable: false,
      };
    case 'schema':
      return {
        title: 'Incompatible response schema',
        body:
          'The endpoint did not return the OpenAI { data: [ ... ] } shape. Check the model path in Advanced.',
        retryable: true,
      };
    case 'model':
      return {
        title: 'No usable models',
        body:
          'The endpoint responded, but no model had a valid ID. Check model access for this key.',
        retryable: false,
      };
    case 'rate-limit':
    case 'server':
      return { title: 'Endpoint problem', body: error.message, retryable: true };
    case 'request':
      return { title: 'Invalid endpoint input', body: error.message, retryable: false };
    case 'network':
      return {
        title: 'Endpoint unreachable',
        body: error.message + ' (' + finalUrl + ')',
        retryable: true,
      };
    default:
      return FALLBACK;
  }
}

export function modelSummary(models: ModelRecord[]): string {
  return String(models.length) + ' models found';
}
