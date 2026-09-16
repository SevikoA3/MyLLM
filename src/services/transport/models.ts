import {
  buildAuthHeaders,
  buildCustomHeaders,
  joinEndpointPath,
  type EndpointProfile,
} from '../../domain/endpoint';
import { fromHttpResponse, fromNetworkError, type AppError } from '../../domain/error';
import { parseModelList } from '../../domain/model-list';
import type { ModelRecord } from '../../domain/model';

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
      return {
        ok: false,
        error: fromHttpResponse({
          status: response.status,
          body: 'Endpoint mengalihkan request ke alamat lain. Perbarui base URL ke alamat akhir lalu hubungkan ulang.',
          ...safeDetails,
        }),
      };
    }
    const body = await response.text();
    if (!response.ok) {
      return { ok: false, error: fromHttpResponse({ status: response.status, body, ...safeDetails }) };
    }
    return parseModelList(body, safeDetails);
  } catch (error) {
    return { ok: false, error: fromNetworkError(error, safeDetails) };
  } finally {
    clearTimeout(timeout);
  }
}
