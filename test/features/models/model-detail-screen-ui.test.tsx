import { act, fireEvent, render } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import type { CatalogModelFields, ModelOverride } from '../../../src/domain/catalog';
import { createEndpointProfile } from '../../../src/domain/endpoint';
import { modelRequestSnapshot } from '../../../src/domain/model-config';
import ModelDetailScreen from '../../../src/features/models/model-detail-screen';
import { useModelCatalog, type ModelCatalogState } from '../../../src/features/models/use-model-catalog';
import { useActiveEndpoint } from '../../../src/features/setup/use-active-endpoint';
import { createCatalogRepository } from '../../../src/services/persistence/catalog-store';
import { colors, interaction } from '../../../src/ui/tokens';

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('../../../src/features/setup/use-active-endpoint', () => ({ useActiveEndpoint: jest.fn() }));
jest.mock('../../../src/features/models/use-model-catalog', () => ({ useModelCatalog: jest.fn() }));

const profile = createEndpointProfile({ id: 'ep_a', name: 'Endpoint A', baseUrl: 'https://example.com/v1' });
const model: CatalogModelFields = {
  id: 'model-a', displayName: 'Model A', maxOutputTokens: 1_000, reasoningEfforts: ['low', 'high'],
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => { resolve = finish; });
  return { promise, resolve };
}

async function setup(overrides: Record<string, ModelOverride> = {}, defaults = [model]) {
  const files = new Map<string, string>([['model-overrides.json', JSON.stringify({
    schemaVersion: 1, endpoints: { ep_a: { models: overrides } },
  })]]);
  const repository = createCatalogRepository({
    storage: {
      readText: async (name) => files.get(name) ?? null,
      writeText: async (name, text) => { files.set(name, text); },
      exists: async (name) => files.has(name),
      copy: async (from, to) => { if (files.has(from)) files.set(to, files.get(from)!); },
    },
    readDefaults: async () => ({ schemaVersion: 1, models: defaults }),
    fetchModels: async () => ({ ok: true, models: [] }),
  });
  const catalog: ModelCatalogState = {
    runtime: await repository.load(profile.id), loading: false, refreshing: false, failure: null,
    reload: jest.fn(), refresh: jest.fn().mockResolvedValue(undefined), addCustomModel: jest.fn(),
    setOverride: jest.fn(async (id, patch) => {
      await repository.setOverride(profile.id, id, patch);
      catalog.runtime = repository.current();
    }),
    previewOverrides: (text) => repository.previewOverrides(profile.id, text, profile),
    applyOverridesText: (text) => repository.applyOverridesText(profile.id, text, profile),
    exportOverrides: () => repository.exportOverrides(),
  };
  jest.mocked(useLocalSearchParams).mockReturnValue({ modelId: model.id });
  jest.mocked(useActiveEndpoint).mockReturnValue({ status: 'ready', profile });
  jest.mocked(useModelCatalog).mockImplementation(() => catalog);
  return { catalog, repository };
}

describe('ModelDetailScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses one model settings title while preserving provider metadata', async () => {
    await setup({}, [{ ...model, raw: { multiplier: 1.25, effective_rate_idr_per_m: 37500 } }]);
    const view = await render(<ModelDetailScreen />);
    expect(view.getByText('Model settings')).toBeTruthy();
    expect(view.queryByText('MyLLM')).toBeNull();
    expect(view.queryByText('CATALOG / INSPECTION')).toBeNull();
    expect(view.getByText('Billing multiplier')).toBeTruthy();
    expect(view.getByText('Effective rate')).toBeTruthy();
    expect(view.getAllByText('Tool calling')).toHaveLength(2);
  });

  it('keeps reset confirmation scrollable inside the bottom safe area', async () => {
    await setup();
    const view = await render(<ModelDetailScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reset to inherited values' }));
    const scroll = view.getByLabelText('Reset model confirmation');
    expect(scroll).toHaveStyle({ flexShrink: 1 });
    let safeArea = scroll.parent;
    while (safeArea && safeArea.props.edges === undefined) safeArea = safeArea.parent;
    expect(safeArea?.props.edges).toMatchObject({ bottom: 'additive', top: 'off' });
    expect(view.getByRole('button', { name: 'Reset model' })).toBeEnabled();
  });

  it('rejects a request limit above the proposed model maximum', async () => {
    const { repository } = await setup();
    const view = await render(<ModelDetailScreen />);
    await fireEvent.changeText(view.getByLabelText('Override max output tokens'), '100');
    await fireEvent.changeText(view.getByLabelText('Output limit'), '500');
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    expect(repository.current()?.overrides.endpoints.ep_a.models['model-a']).toBeUndefined();
    expect(view.getByText(/limit.*100/i)).toBeTruthy();
    expect(view.getByLabelText('Output limit').props.value).toBe('500');
  });

  it('accepts a limit made valid by raising the proposed maximum', async () => {
    const { repository } = await setup();
    const view = await render(<ModelDetailScreen />);
    await fireEvent.changeText(view.getByLabelText('Override max output tokens'), '2000');
    await fireEvent.changeText(view.getByLabelText('Output limit'), '1500');
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    expect(repository.current()?.overrides.endpoints.ep_a.models['model-a']).toMatchObject({
      maxOutputTokens: 2000, request: { outputLimit: 1500 },
    });
    expect(modelRequestSnapshot(repository.current()!.models[0], profile).outputLimit).toBe(1500);
  });

  it('validates inherited limits after a field reset', async () => {
    const { repository } = await setup({ 'model-a': { maxOutputTokens: 100 } });
    const view = await render(<ModelDetailScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reset Override max output tokens' }));
    await fireEvent.changeText(view.getByLabelText('Output limit'), '500');
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    expect(modelRequestSnapshot(repository.current()!.models[0], profile).effectiveMaxOutput).toBe(1000);
    expect(repository.current()?.models[0].request.outputLimit).toBe(500);
  });

  it('rejects a selected reasoning effort removed by the draft', async () => {
    const { repository } = await setup();
    const view = await render(<ModelDetailScreen />);
    await fireEvent.press(view.getByRole('radio', { name: 'Thinking: high' }));
    await fireEvent.changeText(view.getByLabelText('Reasoning efforts'), 'low');
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    expect(repository.current()?.overrides.endpoints.ep_a.models['model-a']).toBeUndefined();
    expect(view.getByText(/high.*not available/)).toBeTruthy();
  });

  it('offers new reasoning choices from the draft before saving', async () => {
    const { repository } = await setup({}, [{ ...model, reasoningEfforts: [] }]);
    const view = await render(<ModelDetailScreen />);
    await fireEvent.changeText(view.getByLabelText('Reasoning efforts'), 'low, high');
    await fireEvent.press(view.getByRole('radio', { name: 'Thinking: high' }));
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    expect(repository.current()?.models[0].request.reasoningEffort).toBe('high');
  });

  it('clears the draft and confirmation when the endpoint identity changes', async () => {
    const { catalog, repository } = await setup();
    const view = await render(<ModelDetailScreen />);
    await fireEvent.changeText(view.getByLabelText('Display name'), 'Endpoint A draft');
    await fireEvent.press(view.getByRole('button', { name: /Reset to/ }));
    const other = { ...profile, id: 'ep_b' };
    catalog.runtime = await repository.load(other.id);
    jest.mocked(useActiveEndpoint).mockReturnValue({ status: 'ready', profile: other });
    await view.rerender(<ModelDetailScreen />);
    expect(view.getByLabelText('Display name').props.value).toBe('');
    expect(view.queryByText('Discard Client Overrides?')).toBeNull();
  });

  it('clears the draft when the route model changes', async () => {
    await setup({}, [model, { ...model, id: 'model-b', displayName: 'Model B' }]);
    const view = await render(<ModelDetailScreen />);
    await fireEvent.changeText(view.getByLabelText('Display name'), 'Model A draft');
    jest.mocked(useLocalSearchParams).mockReturnValue({ modelId: 'model-b' });
    await view.rerender(<ModelDetailScreen />);
    expect(view.getByLabelText('Display name').props.value).toBe('');
  });

  it('ignores an old save completion after the model changes', async () => {
    const { catalog } = await setup({}, [model, { ...model, id: 'model-b' }]);
    const pending = deferred();
    catalog.setOverride = jest.fn(() => pending.promise);
    const view = await render(<ModelDetailScreen />);
    await fireEvent.changeText(view.getByLabelText('Display name'), 'Old draft');
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    jest.mocked(useLocalSearchParams).mockReturnValue({ modelId: 'model-b' });
    await view.rerender(<ModelDetailScreen />);
    await act(async () => { pending.resolve(); });
    expect(view.queryByText(/Overrides saved locally/)).toBeNull();
    expect(view.getByLabelText('Display name').props.value).toBe('');
  });

  it('ignores a save from a previous visit to the same model', async () => {
    const { catalog } = await setup({}, [model, { ...model, id: 'model-b' }]);
    const pending = deferred();
    catalog.setOverride = jest.fn(() => pending.promise);
    const view = await render(<ModelDetailScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    jest.mocked(useLocalSearchParams).mockReturnValue({ modelId: 'model-b' });
    await view.rerender(<ModelDetailScreen />);
    jest.mocked(useLocalSearchParams).mockReturnValue({ modelId: 'model-a' });
    await view.rerender(<ModelDetailScreen />);
    await act(async () => { pending.resolve(); });
    expect(view.queryByText(/Overrides saved locally/)).toBeNull();
    expect(view.getByRole('button', { name: 'Save Overrides' })).toBeEnabled();
  });

  it('preserves the model and draft when reset fails', async () => {
    const { catalog, repository } = await setup({ 'model-a': { displayName: 'Custom model' } }, []);
    catalog.setOverride = jest.fn().mockRejectedValue(new Error('Storage unavailable'));
    const view = await render(<ModelDetailScreen />);
    await fireEvent.changeText(view.getByLabelText('Display name'), 'Preserved draft');
    await fireEvent.press(view.getByRole('button', { name: 'Reset to inherited values' }));
    await fireEvent.press(view.getByRole('button', { name: 'Reset model' }));
    expect(repository.current()?.models[0].displayName).toBe('Custom model');
    expect(view.getByLabelText('Display name').props.value).toBe('Preserved draft');
    expect(view.getByText(/Storage unavailable/)).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('blocks duplicate saves and reset while a save is pending', async () => {
    const { catalog } = await setup();
    const pending = deferred();
    catalog.setOverride = jest.fn(() => pending.promise);
    const view = await render(<ModelDetailScreen />);
    const save = view.getByRole('button', { name: 'Save Overrides' });
    await act(async () => { await fireEvent.press(save); await fireEvent.press(save); });
    expect(catalog.setOverride).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: /Reset to/ })).toBeDisabled();
    expect(view.getByLabelText('Display name').props.editable).toBe(false);
    expect(view.getByRole('radio', { name: 'Thinking: high' })).toBeDisabled();
    await act(async () => { pending.resolve(); });
    expect(view.getByRole('button', { name: 'Save Overrides' })).toBeEnabled();
  });

  it('blocks reset repetition and dismissal during the write', async () => {
    const { catalog } = await setup({ 'model-a': { displayName: 'Local name' } });
    const pending = deferred();
    catalog.setOverride = jest.fn(() => pending.promise);
    const view = await render(<ModelDetailScreen />);
    await fireEvent.press(view.getByRole('button', { name: /Reset to/ }));
    const confirm = view.getByRole('button', { name: /Reset (All|model)/i });
    await act(async () => { await fireEvent.press(confirm); await fireEvent.press(confirm); });
    expect(catalog.setOverride).toHaveBeenCalledTimes(1);
    expect(view.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(view.getByRole('button', { name: /Reset (All|model)/i })).toBeDisabled();
    await act(async () => { pending.resolve(); });
  });

  it('keeps failures recoverable and permits another save', async () => {
    const { catalog } = await setup();
    catalog.setOverride = jest.fn().mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue(undefined);
    const view = await render(<ModelDetailScreen />);
    await fireEvent.changeText(view.getByLabelText('Display name'), 'Preserved draft');
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    expect(view.getByText(/Storage unavailable/)).toBeTruthy();
    expect(view.getByLabelText('Display name').props.value).toBe('Preserved draft');
    await fireEvent.press(view.getByRole('button', { name: 'Save Overrides' }));
    expect(view.getByText(/Overrides saved locally/)).toBeTruthy();
  });

  it('keeps back and refresh recovery available for a missing model', async () => {
    const { catalog } = await setup({}, []);
    catalog.failure = { kind: 'network', message: 'Discovery failed' };
    const view = await render(<ModelDetailScreen />);
    expect(view.getByText(/Discovery failed/)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Refresh model catalog' }));
    expect(catalog.refresh).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole('button', { name: 'Back to model catalog' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('shows loading rather than missing while discovery is running', async () => {
    const { catalog } = await setup({}, []);
    catalog.refreshing = true;
    const view = await render(<ModelDetailScreen />);
    expect(view.getByText('Loading model specification.')).toBeTruthy();
    expect(view.queryByText('Model not found.')).toBeNull();
    expect(view.getByRole('button', { name: 'Refresh model catalog' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Back to model catalog' })).toBeEnabled();
  });

  it('reports refresh rejection while leaving recovery enabled', async () => {
    const { catalog } = await setup({}, []);
    catalog.refresh = jest.fn().mockRejectedValue(new Error('Discovery unavailable'));
    const view = await render(<ModelDetailScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Refresh model catalog' }));
    expect(view.getByText('Discovery unavailable')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Refresh model catalog' })).toBeEnabled();
  });

  it('warns that resetting a custom model removes it and then navigates back', async () => {
    const { repository } = await setup({ 'model-a': { displayName: 'Custom model' } }, []);
    const view = await render(<ModelDetailScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Reset to inherited values' }));
    expect(view.getByText(/remov.*custom model/i)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Reset model' }));
    expect(repository.current()?.models).toHaveLength(0);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('uses a 48 dp input with emerald cursor and focus feedback', async () => {
    await setup();
    const view = await render(<ModelDetailScreen />);
    const field = view.getByLabelText('Display name');
    expect(field).toHaveStyle({ minHeight: interaction.touchTarget, borderColor: colors.border });
    expect(field.props.cursorColor).toBe(colors.primary);
    expect(field.props.selectionColor).toBe(colors.primary);
    await fireEvent(field, 'focus');
    expect(view.getByLabelText('Display name')).toHaveStyle({ borderColor: colors.primary });
    await fireEvent(view.getByLabelText('Display name'), 'blur');
    expect(view.getByLabelText('Display name')).toHaveStyle({ borderColor: colors.border });
  });
});
