import {
  DEFAULT_WEB_TOOLS_SETTINGS,
  WebToolsSettingsSchema,
  createWebToolsSettings,
  type WebToolsSettings,
} from '../../domain/web-tools';
import { nativeStorage, type KeyValueStore } from './endpoint-store';

const WEB_TOOLS_SETTINGS_KEY = 'myllm.webTools';
export const WEB_TOOLS_CREDENTIAL_ID = 'web-tools-gateway';

export function createWebToolsStore(store?: KeyValueStore) {
  async function resolve(): Promise<KeyValueStore> {
    return store ?? (await nativeStorage());
  }
  return {
    async load(): Promise<WebToolsSettings> {
      const raw = await (await resolve()).getItemAsync(WEB_TOOLS_SETTINGS_KEY);
      if (raw === null) {
        return DEFAULT_WEB_TOOLS_SETTINGS;
      }
      try {
        const parsed = WebToolsSettingsSchema.safeParse(JSON.parse(raw));
        return parsed.success ? createWebToolsSettings(parsed.data) : DEFAULT_WEB_TOOLS_SETTINGS;
      } catch {
        return DEFAULT_WEB_TOOLS_SETTINGS;
      }
    },
    async save(input: WebToolsSettings): Promise<void> {
      await (await resolve()).setItemAsync(WEB_TOOLS_SETTINGS_KEY, JSON.stringify(createWebToolsSettings(input)));
    },
    async clear(): Promise<void> {
      await (await resolve()).removeItemAsync(WEB_TOOLS_SETTINGS_KEY);
    },
  };
}

export const webToolsStore = createWebToolsStore();
