import { createEndpointStore, type KeyValueStore } from './endpoint-store';

/** Model aktif dipisahkan per endpoint. */
export function createSettingsStore(store?: KeyValueStore) {
  const endpoints = createEndpointStore(store);
  return {
    async loadActiveModelId(endpointId: string): Promise<string | null> {
      return endpoints.loadActiveModelId(endpointId);
    },
    async saveActiveModelId(endpointId: string, modelId: string): Promise<void> {
      await endpoints.saveActiveModelId(endpointId, modelId);
    },
  };
}

export const settingsStore = createSettingsStore();
