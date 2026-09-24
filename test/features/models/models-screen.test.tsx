import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { MergedModel } from '../../../src/domain/catalog-merge';
import { createEndpointProfile } from '../../../src/domain/endpoint';
import { endpointStore } from '../../../src/services/persistence/endpoint-store';
import { useActiveEndpoint } from '../../../src/features/setup/use-active-endpoint';
import { useModelCatalog } from '../../../src/features/models/use-model-catalog';
import ModelsScreen, { ModelRow } from '../../../src/features/models/models-screen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void) => effect(),
}));

jest.mock('../../../src/services/persistence/endpoint-store', () => ({
  endpointStore: { loadActiveModelId: jest.fn(), saveActiveModelId: jest.fn() },
}));

jest.mock('../../../src/features/setup/use-active-endpoint', () => ({ useActiveEndpoint: jest.fn() }));
jest.mock('../../../src/features/models/use-model-catalog', () => ({ useModelCatalog: jest.fn() }));

function model(overrides: Partial<MergedModel> = {}): MergedModel {
  return {
    id: 'amanai/glm-5.3',
    displayName: 'amanai/glm-5.3',
    vendor: 'zai',
    ownedBy: 'amanai',
    description: null,
    contextWindow: 1_000_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: ['auto', 'low', 'high'],
    inputModalities: ['text'],
    capabilities: {
      streaming: 'unknown',
      tools: 'unknown',
      structuredOutput: 'unknown',
      nativeCompaction: 'unknown',
    },
    raw: {},
    pricing: null,
    provenance: {},
    request: { reasoningEffort: null, outputLimit: null },
    enabled: true,
    orphaned: false,
    ...overrides,
  };
}

describe('ModelsScreen', () => {
  it('returns to chat after setting an active model', async () => {
    const activeEndpoint = jest.mocked(useActiveEndpoint);
    const modelCatalog = jest.mocked(useModelCatalog);
    const profile = createEndpointProfile({ id: 'endpoint_1', name: 'Example endpoint', baseUrl: 'https://example.com/v1' });

    jest.mocked(endpointStore.loadActiveModelId).mockResolvedValue(null);
    jest.mocked(endpointStore.saveActiveModelId).mockResolvedValue(undefined);
    activeEndpoint.mockReturnValue({ status: 'ready', profile });
    modelCatalog.mockReturnValue({
      runtime: { models: [model()], lastFetchedAt: '2026-09-19T00:00:00.000Z' },
      loading: false,
      refreshing: false,
      failure: null,
      reload: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      setOverride: jest.fn().mockResolvedValue(undefined),
      addCustomModel: jest.fn().mockResolvedValue(undefined),
      previewOverrides: jest.fn(),
      applyOverridesText: jest.fn(),
      exportOverrides: jest.fn(),
    } as never);

    const view = await render(<ModelsScreen />);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Set as active model'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(endpointStore.saveActiveModelId).toHaveBeenCalledWith('endpoint_1', 'amanai/glm-5.3');
      expect(router.replace).toHaveBeenCalledWith('/(tabs)');
    });
  });
});

describe('ModelRow', () => {
  it('menampilkan metadata yang tersedia sebagai badge yang terbaca', async () => {
    const view = await render(
      <ModelRow
        model={model()}
        active
        selectable
        onPress={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('1M ctx')).toBeTruthy();
    expect(view.getByText('128k out')).toBeTruthy();
    expect(view.getByText('reasoning 3 level')).toBeTruthy();
    expect(view.getByText('active')).toBeTruthy();
  });

  it('menandai context window yang tidak diketahui sebagai unknown', async () => {
    const view = await render(
      <ModelRow
        model={model({ contextWindow: null, maxOutputTokens: null, reasoningEfforts: [] })}
        active={false}
        selectable
        onPress={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('ctx unknown')).toBeTruthy();
  });

  it('menjelaskan model yang dimatikan dan menyediakan checkbox picker', async () => {
    const view = await render(
      <ModelRow
        model={model({ enabled: false })}
        active={false}
        selectable={false}
        onPress={() => {}}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('disabled')).toBeTruthy();
    expect(view.getByText('Show in picker')).toBeTruthy();
    expect(view.getByRole('checkbox').props.accessibilityState).toEqual({ checked: false });
  });
});
