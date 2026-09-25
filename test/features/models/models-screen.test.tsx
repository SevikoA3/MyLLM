import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { MergedModel } from '../../../src/domain/catalog-merge';
import { createEndpointProfile } from '../../../src/domain/endpoint';
import { useActiveEndpoint } from '../../../src/features/setup/use-active-endpoint';
import { useModelCatalog } from '../../../src/features/models/use-model-catalog';
import { modelPickerName } from '../../../src/features/models/model-badges';
import ModelsScreen, { ModelRow } from '../../../src/features/models/models-screen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void) => effect(),
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
  it('toggles model visibility without offering active selection', async () => {
    const activeEndpoint = jest.mocked(useActiveEndpoint);
    const modelCatalog = jest.mocked(useModelCatalog);
    const profile = createEndpointProfile({ id: 'endpoint_1', name: 'Example endpoint', baseUrl: 'https://example.com/v1' });
    const setOverride = jest.fn().mockResolvedValue(undefined);

    activeEndpoint.mockReturnValue({ status: 'ready', profile });
    modelCatalog.mockReturnValue({
      runtime: { models: [model()], lastFetchedAt: '2026-09-19T00:00:00.000Z' },
      loading: false,
      refreshing: false,
      failure: null,
      reload: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      setOverride,
      addCustomModel: jest.fn().mockResolvedValue(undefined),
      previewOverrides: jest.fn(),
      applyOverridesText: jest.fn(),
      exportOverrides: jest.fn(),
    } as never);

    const view = await render(<ModelsScreen />);
    expect(view.queryByText('Set as active model')).toBeNull();
    fireEvent.press(view.getByLabelText('Show amanai/glm-5.3 in picker'));

    await waitFor(() => expect(setOverride).toHaveBeenCalledWith('amanai/glm-5.3', { enabled: false }));
  });
});

describe('ModelRow', () => {
  it('menghapus prefix endpoint yang dikenal dari nama model picker', () => {
    expect(modelPickerName('yr3/gpt-4o')).toBe('gpt-4o');
    expect(modelPickerName('amanai/glm-5.3')).toBe('glm-5.3');
    expect(modelPickerName('vendor/custom/model')).toBe('vendor/custom/model');
    expect(modelPickerName('model-lokal')).toBe('model-lokal');
  });

  it('menyembunyikan prefix provider dari nama model di picker', async () => {
    const view = await render(
      <ModelRow
        model={model()}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('glm-5.3')).toBeTruthy();
    expect(view.queryByText('amanai/glm-5.3')).toBeNull();
  });

  it('mempertahankan display name buatan pengguna', async () => {
    const view = await render(
      <ModelRow
        model={model({ displayName: 'Model pilihan/saya' })}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('Model pilihan/saya')).toBeTruthy();
  });

  it('menampilkan metadata yang tersedia sebagai badge yang terbaca', async () => {
    const view = await render(
      <ModelRow
        model={model()}
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('1M ctx')).toBeTruthy();
    expect(view.getByText('128k out')).toBeTruthy();
    expect(view.getByText('reasoning 3 level')).toBeTruthy();
    expect(view.queryByText('active')).toBeNull();
  });

  it('menandai context window yang tidak diketahui sebagai unknown', async () => {
    const view = await render(
      <ModelRow
        model={model({ contextWindow: null, maxOutputTokens: null, reasoningEfforts: [] })}
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
        onToggle={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(view.getByText('disabled')).toBeTruthy();
    expect(view.getByText('Show in picker')).toBeTruthy();
    expect(view.getByRole('checkbox').props.accessibilityState).toEqual({ checked: false });
  });
});
