import {
  buildAuthHeaders,
  buildCustomHeaders,
  joinEndpointPath,
  type EndpointProfile,
} from '../../domain/endpoint';
import {
  bodyTooLargeError,
  fromHttpResponse,
  fromNetworkError,
  type AppError,
} from '../../domain/error';
import { readResponseText } from './body';

export type AccountUsage = {
  balance: number | null;
  currency: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type UsageResult =
  | { ok: true; usage: AccountUsage }
  | { ok: false; error: AppError };

export function usageUrl(profile: EndpointProfile): string | null {
  return profile.compat.usagePath === null
    ? null
    : joinEndpointPath(profile.baseUrl, profile.compat.usagePath);
}

/** Tidak ada capability probe: request hanya tersedia untuk path yang tersimpan di profile. */
export async function fetchAccountUsage(
  profile: EndpointProfile,
  apiKey: string,
): Promise<UsageResult> {
  const url = usageUrl(profile);
  if (url === null) {
    return {
      ok: false,
      error: {
        category: 'request',
        message: 'This endpoint does not declare an account usage path.',
        httpStatus: null,
        providerCode: null,
        requestId: null,
        retryable: false,
        safeDetails: { endpointId: profile.id },
      },
    };
  }
  const safeDetails = { endpointId: profile.id, url };
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        ...buildAuthHeaders(profile.authMode, apiKey),
        ...buildCustomHeaders(profile.headers),
      },
    });
    if (response.status >= 300 && response.status < 400) {
      return { ok: false, error: fromHttpResponse({ status: response.status, body: 'Usage endpoint redirected the request.', ...safeDetails }) };
    }
    const body = await readResponseText(response);
    if (!body.ok) return { ok: false, error: bodyTooLargeError(safeDetails) };
    if (!response.ok) {
      return { ok: false, error: fromHttpResponse({ status: response.status, body: body.text, ...safeDetails }) };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.text) as unknown;
    } catch {
      return { ok: false, error: schemaError(safeDetails, 'Usage response is not valid JSON.') };
    }
    if (!isRecord(parsed)) {
      return { ok: false, error: schemaError(safeDetails, 'Usage response must be a JSON object.') };
    }
    return {
      ok: true,
      usage: {
        balance: numberAt(parsed, ['balance', 'credits', 'remaining', 'remaining_balance']),
        currency: stringAt(parsed, ['currency', 'unit']),
        periodStart: stringAt(parsed, ['period_start', 'start', 'from']),
        periodEnd: stringAt(parsed, ['period_end', 'end', 'to']),
      },
    };
  } catch (error) {
    return { ok: false, error: fromNetworkError(error, safeDetails) };
  }
}

function schemaError(safeDetails: Record<string, string>, message: string): AppError {
  return {
    category: 'schema',
    message,
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: false,
    safeDetails,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberAt(record: Record<string, unknown>, names: string[]): number | null {
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function stringAt(record: Record<string, unknown>, names: string[]): string | null {
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}
