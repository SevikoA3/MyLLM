import {
  buildAuthHeaders,
  buildCustomHeaders,
  joinEndpointPath,
  type EndpointProfile,
} from '../../domain/endpoint';
import { bodyTooLargeError, fromHttpResponse, fromNetworkError, type AppError } from '../../domain/error';
import { parseModelList } from '../../domain/model-list';
import type { ModelRecord } from '../../domain/model';
import { recordDiagnostic } from '../diagnostics/diagnostic-ring';
import { readResponseText } from './body';

export const DISCOVERY_TIMEOUT_MS = 15_000;

export type DiscoverResult =
  | { ok: true; models: ModelRecord[] }
  | { ok: false; error: AppError };

export function modelsUrl(profile: Pick<EndpointProfile, 'baseUrl' | 'compat'>): string {
  return joinEndpointPath(profile.baseUrl, profile.compat.modelListPath);
}

/**
 * Credential hanya dikirim ke origin yang tertulis di profile. Redirect tidak
 * diikuti, jadi header auth tidak pernah berpindah host tanpa keputusan pengguna.
 */
export async function discoverModels(
  profile: EndpointProfile,
  apiKey: string,
): Promise<DiscoverResult> {
  const url = modelsUrl(profile);
  const safeDetails = { endpointId: profile.id, url };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        ...buildAuthHeaders(profile.authMode, apiKey),
        ...buildCustomHeaders(profile.headers),
      },
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      return discoveryFailure(
        profile,
        fromHttpResponse({
          status: response.status,
          body: 'Endpoint mengalihkan request ke alamat lain. Perbarui base URL ke alamat akhir lalu hubungkan ulang.',
          ...safeDetails,
        }),
      );
    }
    const bodyResult = await readResponseText(response);
    if (!bodyResult.ok) {
      return discoveryFailure(profile, bodyTooLargeError(safeDetails));
    }
    const body = bodyResult.text;
    if (!response.ok) {
      return discoveryFailure(profile, fromHttpResponse({ status: response.status, body, ...safeDetails }));
    }
    const result = parseModelList(body, safeDetails);
    return result.ok ? result : discoveryFailure(profile, result.error);
  } catch (error) {
    return discoveryFailure(profile, fromNetworkError(error, safeDetails));
  } finally {
    clearTimeout(timeout);
  }
}

function discoveryFailure(profile: EndpointProfile, error: AppError): DiscoverResult {
  void recordDiagnostic({
    kind: 'model-discovery-failed',
    endpointId: profile.id,
    modelId: null,
    toolName: null,
    attempt: 1,
    httpStatus: error.httpStatus,
    errorCategory: error.category,
    errorDetail: error.httpStatus === null ? error.message : null,
    providerCode: error.providerCode,
    requestId: error.requestId,
  });
  return { ok: false, error };
}
