import { z } from 'zod';

import { normalizeBaseUrl } from './endpoint';

export const DEFAULT_WEB_SEARCH_ENGINES = 'bing';
export const WebSearchProviderSchema = z.enum(['gateway', 'exa']);
export type WebSearchProvider = z.infer<typeof WebSearchProviderSchema>;

export const WebToolsSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: WebSearchProviderSchema.default('gateway'),
  baseUrl: z.string().nullable(),
  engines: z.string().default(DEFAULT_WEB_SEARCH_ENGINES),
});
export type WebToolsSettings = z.infer<typeof WebToolsSettingsSchema>;

export const DEFAULT_WEB_TOOLS_SETTINGS: WebToolsSettings = {
  enabled: false,
  provider: 'gateway',
  baseUrl: null,
  engines: DEFAULT_WEB_SEARCH_ENGINES,
};

export function createWebToolsSettings(input: z.input<typeof WebToolsSettingsSchema>): WebToolsSettings {
  const settings = WebToolsSettingsSchema.parse(input);
  const baseUrl = settings.provider === 'gateway' && settings.baseUrl !== null
    ? normalizeGatewayUrl(settings.baseUrl)
    : null;
  const engines = normalizeGatewayEngines(settings.engines);
  if (settings.enabled && settings.provider === 'gateway' && baseUrl === null) {
    throw new Error('Gateway URL is required when web tools are enabled.');
  }
  return { enabled: settings.enabled, provider: settings.provider, baseUrl, engines };
}

export function normalizeGatewayUrl(input: string): string {
  const normalized = normalizeBaseUrl(input);
  const url = new URL(normalized);
  if (url.protocol !== 'https:') {
    throw new Error('Gateway URL must use HTTPS.');
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new Error('Gateway URL must not contain a query or fragment.');
  }
  return normalized;
}

export function normalizeGatewayEngines(input: string): string {
  const engines = input.trim();
  if (engines.length === 0 || engines.length > 100) {
    throw new Error('SearXNG engines must contain 1 to 100 characters.');
  }
  return engines;
}
