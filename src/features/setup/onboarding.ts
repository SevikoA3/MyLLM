import {
  createEndpointProfile,
  normalizeBaseUrl,
  validateBaseUrl,
  type AuthMode,
  type EndpointProfile,
} from '../../domain/endpoint';
import { createAppError, type AppError } from '../../domain/error';
import {
  createCredentialStore,
  credentialStore,
  type SecureStoreLike,
} from '../../services/credentials/store';
import {
  createEndpointStore,
  type KeyValueStore,
} from '../../services/persistence/endpoint-store';
import { discoverModels } from '../../services/transport/models';

export type SetupInput = {
  name: string;
  baseUrl: string;
  apiKey: string;
  apiKeyChanged: boolean;
  authMode: AuthMode;
  modelListPath: string;
};

export type OnboardResult =
  | { ok: true; profile: EndpointProfile }
  | { ok: false; error: AppError };

export type OnboardDeps = {
  secureStore?: SecureStoreLike;
  keyValueStore?: KeyValueStore;
  discover?: typeof discoverModels;
};

export function newCredentialId(): string {
  return 'cred_' + Date.now().toString(36);
}

export function profileFromInput(input: SetupInput, credentialId: string | null): EndpointProfile {
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const profile = createEndpointProfile({
    id: 'ep_' + Date.now().toString(36),
    name: input.name.trim().length > 0 ? input.name : new URL(baseUrl).hostname,
    baseUrl,
    authMode: input.authMode,
    credentialRef: credentialId,
  });
  return {
    ...profile,
    compat: { ...profile.compat, modelListPath: input.modelListPath.trim() || '/models' },
  };
}

// Nama diisi dari hostname selama pengguna belum mengetik sendiri.
export function suggestName(baseUrl: string): string {
  if (validateBaseUrl(baseUrl) !== null) {
    return '';
  }
  try {
    return new URL(baseUrl.trim()).hostname;
  } catch {
    return '';
  }
}

/**
 * Satu percobaan connect. Profile dan credential hanya ditulis setelah endpoint
 * benar-benar mengembalikan model, jadi kegagalan tidak menyisakan data separuh.
 */
export async function connectAndDiscover(
  input: SetupInput,
  active: EndpointProfile | null,
  deps: OnboardDeps = {},
): Promise<OnboardResult> {
  const credentials = createCredentialStore(deps.secureStore);
  const endpoints = createEndpointStore(deps.keyValueStore);
  const discover = deps.discover ?? discoverModels;

  // Endpoint tersimpan tetap memakai credentialId-nya supaya tidak ada record yatim
  // di Keystore ketika pengguna hanya memperbaiki URL.
  const reusesCredential = input.apiKeyChanged === false && active !== null && active.credentialRef !== null;
  const credentialId = reusesCredential ? active.credentialRef : newCredentialId();

  let profile: EndpointProfile;
  try {
    profile = { ...profileFromInput(input, credentialId), id: active?.id ?? 'ep_' + Date.now().toString(36) };
  } catch (error) {
    return {
      ok: false,
      error: createAppError({
        category: 'request',
        message: error instanceof Error ? error.message : 'Input endpoint tidak valid.',
        httpStatus: null,
        providerCode: null,
        requestId: null,
        retryable: false,
        safeDetails: {},
      }),
    };
  }

  const apiKey = reusesCredential ? await credentials.read(credentialId ?? '') : input.apiKey.trim();
  if (apiKey === null || apiKey.length === 0) {
    return {
      ok: false,
      error: createAppError({
        category: 'auth',
        message: 'API key kosong atau tidak ada di secure storage. Masukkan key lagi.',
        httpStatus: null,
        providerCode: null,
        requestId: null,
        retryable: false,
        safeDetails: {},
      }),
    };
  }

  const discovered = await discover(profile, apiKey);
  if (!discovered.ok) {
    return discovered;
  }

  // Secret ditulis lebih dulu supaya profile tidak pernah menunjuk credential yang belum ada.
  await credentials.save(credentialId ?? '', apiKey);
  try {
    await endpoints.save(profile);
    await endpoints.saveActiveModelId(discovered.models[0].id);
  } catch {
    await credentials.remove(credentialId ?? '');
    return {
      ok: false,
      error: createAppError({
        category: 'unknown',
        message: 'Gagal menyimpan profile endpoint. Credential yang baru dibuat sudah dihapus, coba lagi.',
        httpStatus: null,
        providerCode: null,
        requestId: null,
        retryable: true,
        safeDetails: {},
      }),
    };
  }
  return { ok: true, profile };
}

export async function loadCredentialFor(profile: EndpointProfile): Promise<string | null> {
  return profile.credentialRef === null ? null : credentialStore.read(profile.credentialRef);
}

