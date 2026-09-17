import {
  buildAuthHeaders,
  buildCustomHeaders,
  joinEndpointPath,
  type EndpointProfile,
} from '../../domain/endpoint';
import {
  createAppError,
  fromHttpResponse,
  fromNetworkError,
  type AppError,
} from '../../domain/error';
import { parseResponseBody, type ParsedResponse } from '../../domain/response';

export const RESPONSE_TIMEOUT_MS = 60_000;

export type SendResponseInput = {
  modelId: string;
  prompt: string;
  previousResponseId: string | null;
  maxOutputTokens: number;
};

export type SendResponseResult =
  | { ok: true; response: ParsedResponse }
  | { ok: false; error: AppError };

export function responsesUrl(profile: EndpointProfile): string {
  return joinEndpointPath(profile.baseUrl, profile.compat.responsesPath);
}

export function buildResponsesBody(
  profile: EndpointProfile,
  input: SendResponseInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.modelId,
    input: [{ role: 'user', content: input.prompt }],
    stream: false,
    [profile.compat.responsesMaxTokensField]: input.maxOutputTokens,
  };
  if (input.previousResponseId !== null) {
    body.previous_response_id = input.previousResponseId;
  }
  return body;
}

async function send(
  profile: EndpointProfile,
  apiKey: string,
  input: SendResponseInput,
): Promise<SendResponseResult> {
  const url = responsesUrl(profile);
  const safeDetails = { endpointId: profile.id, url };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESPONSE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...buildCustomHeaders(profile.headers),
        ...buildAuthHeaders(profile.authMode, apiKey),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildResponsesBody(profile, input)),
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      return { ok: false, error: fromHttpResponse({ status: response.status, body, ...safeDetails }) };
    }
    const parsed = parseResponseBody(body);
    if (!parsed.ok) {
      return { ok: false, error: schemaError(parsed.message, safeDetails) };
    }
    if (parsed.response.text === null) {
      return { ok: false, error: schemaError('Response selesai tanpa output text.', safeDetails) };
    }
    return { ok: true, response: parsed.response };
  } catch (error) {
    return { ok: false, error: fromNetworkError(error, safeDetails) };
  } finally {
    clearTimeout(timeout);
  }
}

function schemaError(message: string, safeDetails: Record<string, string>): AppError {
  return createAppError({
    category: 'schema',
    message,
    httpStatus: null,
    providerCode: null,
    requestId: null,
    retryable: false,
    safeDetails,
  });
}

/** Client konkret Phase 4. Interface transport baru dibuat saat fallback ditambahkan. */
export const responsesClient = { send };
