import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { createEndpointProfile, type EndpointProfile } from '../../../src/domain/endpoint';
import { ModelOverridesFileSchema, serializeModelOverrides } from '../../../src/domain/catalog';
import ModelsJsonScreen from '../../../src/features/models/models-json-screen';
import { fileCatalogStorage } from '../../../src/services/persistence/catalog-files';
import { pickOverridesJson, shareOverridesJson } from '../../../src/services/persistence/catalog-transfer';
import { endpointStore } from '../../../src/services/persistence/endpoint-store';
import { snapshotFileName } from '../../../src/services/persistence/catalog-store';
import { fonts } from '../../../src/ui/tokens';

const mockFiles = new Map<string, string>();
const mockListeners = new Set<() => void>();

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));
jest.mock('../../../src/services/persistence/endpoint-store', () => ({
  endpointStore: { load: jest.fn() },
  subscribeEndpointChanges: (listener: () => void) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
}));
jest.mock('../../../src/services/persistence/catalog-files', () => ({
  readBundledDefaults: async () => ({ schemaVersion: 1, models: [] }),
  fileCatalogStorage: {
    readText: jest.fn(),
    writeText: jest.fn(),
    copy: jest.fn(),
    exists: jest.fn(),
  },
}));
jest.mock('../../../src/services/persistence/catalog-transfer', () => ({
  pickOverridesJson: jest.fn(), shareOverridesJson: jest.fn(),
}));
jest.mock('../../../src/services/credentials/store', () => ({ credentialStore: { read: async () => 'sk-test' } }));
jest.mock('../../../src/services/transport/models', () => ({ discoverModels: jest.fn() }));

const firstProfile = createEndpointProfile({
  id: 'endpoint_1', name: 'First endpoint', baseUrl: 'https://first.example/v1', credentialRef: 'credential_1',
});
const secondProfile = createEndpointProfile({
  id: 'endpoint_2', name: 'Second endpoint', baseUrl: 'https://second.example/v1', credentialRef: 'credential_2',
});
const savedText = serializeModelOverrides({ schemaVersion: 1, endpoints: {} });
const draft = serializeModelOverrides({ schemaVersion: 1, endpoints: { endpoint_1: { models: { 'example/model': { contextWindow: 8192 } } } } });
const unsafeError = new Error('Authorization: Bearer sk-test-private-diagnostic');
const storage = jest.mocked(fileCatalogStorage);
const loadEndpoint = jest.mocked(endpointStore.load);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function seedProfile(profile: EndpointProfile) {
  mockFiles.set(snapshotFileName(profile.id), JSON.stringify({
    schemaVersion: 1, endpointId: profile.id, baseUrl: profile.baseUrl, fetchedAt: new Date().toISOString(), models: [],
  }));
}

async function switchProfile(profile: EndpointProfile) {
  loadEndpoint.mockResolvedValue(profile);
  seedProfile(profile);
  await act(() => { mockListeners.forEach((listener) => listener()); });
}

async function editor() {
  const view = await render(<ModelsJsonScreen />);
  await waitFor(() => expect(view.getByLabelText('Raw model overrides JSON')).toBeTruthy());
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.clear();
  mockFiles.set('model-overrides.json', savedText);
  seedProfile(firstProfile);
  loadEndpoint.mockReset().mockResolvedValue(firstProfile);
  storage.readText.mockReset().mockImplementation(async (name) => mockFiles.get(name) ?? null);
  storage.writeText.mockReset().mockImplementation(async (name, text) => { mockFiles.set(name, text); });
  storage.copy.mockReset().mockImplementation(async (from, to) => { mockFiles.set(to, mockFiles.get(from)!); });
  storage.exists.mockReset().mockImplementation(async (name) => mockFiles.has(name));
  jest.mocked(pickOverridesJson).mockReset().mockResolvedValue(null);
  jest.mocked(shareOverridesJson).mockReset().mockResolvedValue(undefined);
});

describe('ModelsJsonScreen recovery', () => {
  it('reviews changes before replacing the file and applies only the reviewed snapshot', async () => {
    const previous = serializeModelOverrides({ schemaVersion: 1, endpoints: { endpoint_2: { models: { removed: { contextWindow: 4096 } } } } });
    mockFiles.set('model-overrides.json', previous);
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    await fireEvent.press(view.getByRole('button', { name: 'Review changes' }));

    expect(storage.writeText).not.toHaveBeenCalled();
    expect(storage.copy).not.toHaveBeenCalled();
    expect(mockFiles.get('model-overrides.json')).toBe(previous);
    expect(view.getByText(new RegExp('endpoint_2/removed'))).toBeTruthy();
    expect(view.getByText('Replaces model overrides for every endpoint in this JSON file. Removed entries inherit defaults.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Apply overrides' }));

    await waitFor(() => expect(view.getByText('Model overrides saved.')).toBeTruthy());
    expect(ModelOverridesFileSchema.parse(JSON.parse(mockFiles.get('model-overrides.json')!))).toEqual(JSON.parse(draft));
  });

  it('requires another review after editing previously reviewed JSON', async () => {
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    await fireEvent.press(view.getByRole('button', { name: 'Review changes' }));
    expect(view.getByRole('button', { name: 'Apply overrides' })).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), savedText);
    await fireEvent.press(view.getByRole('button', { name: 'Review changes' }));

    expect(storage.writeText).not.toHaveBeenCalled();
    expect(view.getByText('Valid schema. No model overrides change.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Apply overrides' }));
    await waitFor(() => expect(view.getByText('Model overrides saved.')).toBeTruthy());
    expect(mockFiles.get('model-overrides.json')).toBe(savedText);
  });

  it('offers connect and back when there is no active endpoint', async () => {
    loadEndpoint.mockResolvedValue(null);
    const view = await render(<ModelsJsonScreen />);
    await waitFor(() => expect(view.getByText('Connect an endpoint to edit model overrides.')).toBeTruthy());

    expect(view.queryByText('Loading model overrides.')).toBeNull();
    expect(view.queryByLabelText('Raw model overrides JSON')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Connect endpoint' }));
    expect(router.push).toHaveBeenCalledWith('/setup');
    await fireEvent.press(view.getByRole('button', { name: 'Back to model catalog' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('allows back while the endpoint is loading', async () => {
    const endpoint = deferred<EndpointProfile | null>();
    loadEndpoint.mockReturnValueOnce(endpoint.promise);
    const view = await render(<ModelsJsonScreen />);

    expect(view.getByText('Loading model overrides.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Back to model catalog' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    await act(() => endpoint.resolve(null));
  });

  it('preserves the draft after a rejected preview and lets validation retry', async () => {
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    storage.readText.mockRejectedValueOnce(unsafeError);
    await fireEvent.press(view.getByRole('button', { name: 'Validate' }));

    await waitFor(() => expect(view.getByText('Could not validate model overrides. Try again.')).toBeTruthy());
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(draft);
    expect(view.queryByText(unsafeError.message)).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Validate' }));
    await waitFor(() => expect(view.getByText('Valid schema. Changed models: example/model')).toBeTruthy());
    expect(view.queryByText('Could not validate model overrides. Try again.')).toBeNull();
  });

  it('preserves the draft after a rejected save and applies it on retry', async () => {
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    await fireEvent.press(view.getByRole('button', { name: 'Review changes' }));
    storage.writeText.mockRejectedValueOnce(unsafeError);
    await fireEvent.press(view.getByRole('button', { name: 'Apply overrides' }));

    await waitFor(() => expect(view.getByText('Could not save model overrides. Try again.')).toBeTruthy());
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(draft);
    expect(mockFiles.get('model-overrides.json')).toBe(savedText);
    expect(view.queryByText(unsafeError.message)).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Apply overrides' }));
    await waitFor(() => expect(view.getByText('Model overrides saved.')).toBeTruthy());
    expect(ModelOverridesFileSchema.parse(JSON.parse(mockFiles.get('model-overrides.json')!))).toEqual(JSON.parse(draft));
  });

  it('keeps schema validation failures visible without discarding invalid JSON', async () => {
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), '{');
    await fireEvent.press(view.getByRole('button', { name: 'Review changes' }));

    await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe('{');
    expect(storage.writeText).not.toHaveBeenCalled();
  });

  it('redacts validation paths that contain secret-shaped model IDs', async () => {
    const view = await editor();
    const invalid = JSON.stringify({ schemaVersion: 1, endpoints: { endpoint_1: { models: { 'sk-test-private-model': { contextWindow: -1 } } } } });
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), invalid);
    await fireEvent.press(view.getByRole('button', { name: 'Validate' }));

    await waitFor(() => expect(view.getByText(/redacted/)).toBeTruthy());
    expect(view.queryByText(/sk-test-private-model/)).toBeNull();
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(invalid);
  });

  it('locks editing and duplicate saves while the current draft is being saved', async () => {
    const write = deferred<void>();
    const view = await editor();
    storage.writeText.mockImplementationOnce(async (name, text) => { mockFiles.set(name, text); await write.promise; });
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    await fireEvent.press(view.getByRole('button', { name: 'Review changes' }));
    await fireEvent.press(view.getByRole('button', { name: 'Apply overrides' }));

    await waitFor(() => expect(storage.writeText).toHaveBeenCalledTimes(1));
    expect(view.getByLabelText('Raw model overrides JSON').props.editable).toBe(false);
    expect(view.getByRole('button', { name: 'Apply overrides' })).toBeDisabled();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), 'newer edit');
    await fireEvent.press(view.getByRole('button', { name: 'Apply overrides' }));
    expect(storage.writeText).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(draft);
    await act(() => write.resolve(undefined));
    await waitFor(() => expect(view.getByText('Model overrides saved.')).toBeTruthy());
    expect(view.getByLabelText('Raw model overrides JSON').props.editable).toBe(true);
  });
});

describe('ModelsJsonScreen endpoint isolation and export', () => {
  it('shows the current endpoint name and uses the shared editor font', async () => {
    const view = await editor();
    expect(view.getByText('First endpoint')).toBeTruthy();
    expect(view.queryByText('endpoint_1')).toBeNull();
    expect(StyleSheet.flatten(view.getByLabelText('Raw model overrides JSON').props.style).fontFamily).toBe(fonts.mono);
  });

  it('clears the old draft and preview on endpoint switch', async () => {
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    await fireEvent.press(view.getByRole('button', { name: 'Validate' }));
    await waitFor(() => expect(view.getByText('Valid schema. Changed models: example/model')).toBeTruthy());
    await switchProfile(secondProfile);

    await waitFor(() => expect(view.getByText('Second endpoint')).toBeTruthy());
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(savedText);
    expect(view.queryByText('Valid schema. Changed models: example/model')).toBeNull();
    expect(view.getByText('No validation result yet.')).toBeTruthy();
  });

  it('clears an old draft when the same endpoint ID changes origin', async () => {
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    await switchProfile({ ...firstProfile, baseUrl: 'https://changed.example/v1', name: 'Changed endpoint' });

    await waitFor(() => expect(view.getByText('Changed endpoint')).toBeTruthy());
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(savedText);
  });

  it('ignores a pending import completion after the endpoint changes', async () => {
    const imported = deferred<string | null>();
    jest.mocked(pickOverridesJson).mockReturnValueOnce(imported.promise);
    const view = await editor();
    await fireEvent.press(view.getByRole('button', { name: 'Import' }));
    await switchProfile(secondProfile);
    await waitFor(() => expect(view.getByLabelText('Raw model overrides JSON')).toBeTruthy());
    const nextDraft = '{"schemaVersion":1,"endpoints":{}}';
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), nextDraft);
    await act(() => imported.resolve(draft));

    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(nextDraft);
    expect(view.queryByText('Valid schema. Changed models: example/model')).toBeNull();
  });

  it('ignores a pending validation result after the endpoint changes', async () => {
    const snapshot = deferred<string | null>();
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    storage.readText.mockReturnValueOnce(snapshot.promise);
    await fireEvent.press(view.getByRole('button', { name: 'Validate' }));
    expect(view.getByRole('button', { name: 'Validate' })).toBeDisabled();
    await switchProfile(secondProfile);
    await waitFor(() => expect(view.getByText('Second endpoint')).toBeTruthy());
    const nextDraft = '{"schemaVersion":1,"endpoints":{}}';
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), nextDraft);
    await act(() => snapshot.resolve(mockFiles.get(snapshotFileName(firstProfile.id))!));

    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(nextDraft);
    expect(view.queryByText('Valid schema. Changed models: example/model')).toBeNull();
  });

  it('does not replace a new endpoint draft when an earlier save completes', async () => {
    const write = deferred<void>();
    const view = await editor();
    storage.writeText.mockImplementationOnce(async (name, text) => { mockFiles.set(name, text); await write.promise; });
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    await fireEvent.press(view.getByRole('button', { name: 'Review changes' }));
    await fireEvent.press(view.getByRole('button', { name: 'Apply overrides' }));
    await waitFor(() => expect(storage.writeText).toHaveBeenCalledTimes(1));
    await switchProfile(secondProfile);
    await waitFor(() => expect(view.getByText('Second endpoint')).toBeTruthy());
    const nextDraft = '{"schemaVersion":1,"endpoints":{}}';
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), nextDraft);
    await act(() => write.resolve(undefined));

    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(nextDraft);
    expect(view.queryByText('Model overrides saved.')).toBeNull();
  });

  it('clearly exports saved JSON while preserving the unsaved visible draft', async () => {
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    expect(view.getByText('Export shares saved overrides. Unsaved edits are not included.')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Export saved JSON' }));

    expect(shareOverridesJson).toHaveBeenCalledWith(savedText);
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(draft);
  });

  it.each(['import', 'export'] as const)('shows a safe %s error without changing the draft', async (operation) => {
    const view = await editor();
    await fireEvent.changeText(view.getByLabelText('Raw model overrides JSON'), draft);
    if (operation === 'import') jest.mocked(pickOverridesJson).mockRejectedValueOnce(unsafeError);
    else jest.mocked(shareOverridesJson).mockRejectedValueOnce(unsafeError);
    await fireEvent.press(view.getByRole('button', { name: operation === 'import' ? 'Import' : /Export/ }));

    await waitFor(() => expect(view.getByText(operation === 'import'
      ? 'Could not import model overrides. Try again.'
      : 'Could not export saved model overrides. Try again.')).toBeTruthy());
    expect(view.queryByText(unsafeError.message)).toBeNull();
    expect(view.getByLabelText('Raw model overrides JSON').props.value).toBe(draft);
  });
});
