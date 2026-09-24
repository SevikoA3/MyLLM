import { z } from 'zod';

export const AuthModeSchema = z.enum(['bearer', 'x-api-key']);
export type AuthMode = z.infer<typeof AuthModeSchema>;

export const ProtocolModeSchema = z.enum(['responses', 'chat-completions', 'auto']);
export type ProtocolMode = z.infer<typeof ProtocolModeSchema>;
export const ConcreteProtocolSchema = z.enum(['responses', 'chat-completions']);
export type ConcreteProtocol = z.infer<typeof ConcreteProtocolSchema>;

export const EndpointIdSchema = z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'Endpoint ID contains unsupported characters.').min(1).max(64);
export type EndpointId = z.infer<typeof EndpointIdSchema>;

export const EndpointProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: EndpointIdSchema,
  name: z.string().trim().min(1),
  baseUrl: z.string().trim().min(1),
  protocol: ProtocolModeSchema,
  authMode: AuthModeSchema,
  credentialRef: z.string().trim().min(1).nullable(),
  headers: z.record(z.string(), z.string()),
  compat: z.object({
    modelListPath: z.string().trim().min(1),
    responsesPath: z.string().trim().min(1),
    chatCompletionsPath: z.string().trim().min(1),
    responsesMaxTokensField: z.string().trim().min(1),
    chatMaxTokensField: z.string().trim().min(1),
    chatOutputCap: z.number().int().positive().nullable(),
    chatReasoningSupport: z.enum(['supported', 'unsupported', 'unknown']).default('unknown'),
    chatPromptCacheField: z.string().trim().min(1).nullable().default(null),
    usagePath: z.string().trim().min(1).nullable().default(null),
    autoReasoningBehavior: z.enum(['omit', 'literal-auto']),
    nativeContextManagement: z.enum(['supported', 'unsupported', 'unknown']),
  }),
});
export type EndpointProfile = z.infer<typeof EndpointProfileSchema>;

export const PortableEndpointProfileSchema = EndpointProfileSchema.omit({
  credentialRef: true,
  headers: true,
}).extend({ schemaVersion: z.literal(1) }).strict();
export type PortableEndpointProfile = z.infer<typeof PortableEndpointProfileSchema>;

export const EndpointExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    exportedAt: z.string().datetime(),
    endpoints: z.array(PortableEndpointProfileSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.endpoints.forEach((endpoint, index) => {
      if (ids.has(endpoint.id)) {
        context.addIssue({ code: 'custom', path: ['endpoints', index, 'id'], message: 'Endpoint IDs must be unique.' });
      }
      ids.add(endpoint.id);
    });
  });
export type EndpointExport = z.infer<typeof EndpointExportSchema>;

export function portableEndpointProfile(profile: EndpointProfile): PortableEndpointProfile {
  const { credentialRef: _credentialRef, headers: _headers, ...portable } = profile;
  return PortableEndpointProfileSchema.parse(portable);
}

export function parseEndpointExport(text: string): EndpointExport {
  return EndpointExportSchema.parse(JSON.parse(text) as unknown);
}

export function serializeEndpointExport(
  profiles: EndpointProfile[],
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify(
    EndpointExportSchema.parse({
      schemaVersion: 1,
      exportedAt,
      endpoints: profiles.map(portableEndpointProfile),
    }),
    null,
    2,
  );
}

export function createEndpointProfile(input: {
  id: EndpointId;
  name: string;
  baseUrl: string;
  protocol?: ProtocolMode;
  authMode?: AuthMode;
  credentialRef?: string | null;
}): EndpointProfile {
  return {
    schemaVersion: 1,
    id: EndpointIdSchema.parse(input.id),
    name: input.name.trim(),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    protocol: input.protocol ?? 'responses',
    authMode: input.authMode ?? 'bearer',
    credentialRef: input.credentialRef ?? null,
    headers: { 'User-Agent': 'MyLLM-Android/1' },
    compat: {
      modelListPath: '/models',
      responsesPath: '/responses',
      chatCompletionsPath: '/chat/completions',
      responsesMaxTokensField: 'max_output_tokens',
      chatMaxTokensField: 'max_tokens',
      chatOutputCap: 8192,
      chatReasoningSupport: 'unknown',
      chatPromptCacheField: null,
      usagePath: null,
      autoReasoningBehavior: 'omit',
      nativeContextManagement: 'unknown',
    },
  };
}

const BLOCKED_HEADERS = new Set(['host', 'content-length', 'authorization', 'x-api-key']);

/** Buang trailing slash tanpa menambah segmen path. */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('Base URL is empty.');
  }
  const url = parseAbsoluteUrl(trimmed);
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}${url.search}`;
}

/** Satu slash pemisah, hasil tidak pernah berisi // dua kali pada path. */
export function joinEndpointPath(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl);
  const segment = path.trim();
  if (segment.length === 0 || segment === '/') {
    return base;
  }
  let decodedSegment: string;
  try {
    decodedSegment = decodeURIComponent(segment);
  } catch {
    throw new Error('Endpoint path contains invalid encoding.');
  }
  if (decodedSegment.split(/[\\/]/).some((part) => part === '..')) {
    throw new Error('Endpoint path must not contain parent-directory segments.');
  }
  const queryStart = base.indexOf('?');
  const origin = queryStart === -1 ? base : base.slice(0, queryStart);
  const query = queryStart === -1 ? '' : base.slice(queryStart);
  return `${origin}/${segment.replace(/^\/+/, '').replace(/\/+$/, '')}${query}`;
}

export function buildAuthHeaders(mode: AuthMode, apiKey: string): Record<string, string> {
  const value = apiKey.trim();
  if (value.length === 0) {
    throw new Error('API key is empty.');
  }
  return mode === 'bearer' ? { Authorization: `Bearer ${value}` } : { 'x-api-key': value };
}

/**
 * Header profile boleh membawa user agent atau header kompatibilitas, tetapi tidak
 * boleh menimpa header yang menentukan target atau kredensial.
 */
export function buildCustomHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (BLOCKED_HEADERS.has(lower) || lower.startsWith('proxy-')) {
      continue;
    }
    safe[name] = value;
  }
  return safe;
}

/** Cek cepat untuk memisahkan input yang jelas salah sebelum request dikirim. */
export function validateBaseUrl(input: string): string | null {
  try {
    normalizeBaseUrl(input);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Base URL is invalid.';
  }
}

function parseAbsoluteUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Base URL must be an absolute URL, for example https://api.example.com/v1.');
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error('Base URL must not contain a username or password.');
  }
  if (url.hostname.length === 0) {
    throw new Error('Base URL must contain a hostname.');
  }
  if (!isSecureProtocol(url)) {
    throw new Error(
      `The ${url.protocol.replace(':', '')} scheme is not supported. Phase 1 only accepts HTTPS. Local HTTP development is added in the transport phase.`,
    );
  }
  return url;
}

/**
 * Cleartext HTTP hanya diterima untuk host loopback pada build development, jadi
 * kontrak endpoint dapat diuji dengan server lokal tanpa membuka HTTP pada release.
 */
function isSecureProtocol(url: URL): boolean {
  if (url.protocol === 'https:') {
    return true;
  }
  return url.protocol === 'http:' && isDevelopment() && isLoopback(url.hostname);
}

function isDevelopment(): boolean {
  return typeof __DEV__ === 'boolean' && __DEV__;
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
