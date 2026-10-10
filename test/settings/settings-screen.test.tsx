import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import SettingsScreen from '../../app/settings';
import { createEndpointProfile } from '../../src/domain/endpoint';
import { createWebToolsSettings, type WebToolsSettings } from '../../src/domain/web-tools';
import { credentialStore } from '../../src/services/credentials/store';
import { endpointStore } from '../../src/services/persistence/endpoint-store';
import { webToolsCredentialId, webToolsStore } from '../../src/services/persistence/web-tools-store';
import { testWebGateway } from '../../src/services/tools/gateway';
import { colors, interaction } from '../../src/ui/tokens';

const mockRouter = { replace: jest.fn() };

jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useRouter: () => mockRouter }));
jest.mock('react-native/Libraries/Components/Switch/SwitchNativeComponent', () => ({
  __esModule: true, default: 'RCTSwitch', Commands: { setValue: jest.fn() },
}));
jest.mock('../../src/services/credentials/store', () => ({
  credentialStore: { read: jest.fn(), save: jest.fn(), remove: jest.fn(), clearAll: jest.fn() },
}));
jest.mock('../../src/services/persistence/endpoint-store', () => ({
  endpointStore: { load: jest.fn(), loadAll: jest.fn(), clear: jest.fn(), clearProtocol: jest.fn() },
  subscribeEndpointChanges: () => () => {},
}));
jest.mock('../../src/services/persistence/web-tools-store', () => ({
  ...jest.requireActual('../../src/services/persistence/web-tools-store'),
  webToolsStore: { load: jest.fn(), save: jest.fn(), clear: jest.fn() },
}));
jest.mock('../../src/services/diagnostics/diagnostic-ring', () => ({ clearDiagnosticRing: jest.fn() }));
jest.mock('../../src/services/diagnostics/diagnostic-transfer', () => ({ shareDiagnostics: jest.fn() }));
jest.mock('../../src/services/persistence/catalog-files', () => ({ clearCatalogCache: jest.fn() }));
jest.mock('../../src/services/persistence/catalog-transfer', () => ({ clearTransferCache: jest.fn() }));
jest.mock('../../src/services/attachments/files', () => ({ clearStagedAttachments: jest.fn() }));
jest.mock('../../src/services/persistence/conversation-store', () => ({ conversationRepository: { clear: jest.fn() } }));
jest.mock('../../src/services/tools/gateway', () => ({ testWebGateway: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

describe('SettingsScreen', () => {
  const read = jest.mocked(credentialStore.read);
  const saveCredential = jest.mocked(credentialStore.save);
  const saveSettings = jest.mocked(webToolsStore.save);
  const gatewayId = webToolsCredentialId('gateway');
  let secrets: Map<string, string>;
  let storedSettings: WebToolsSettings;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    secrets = new Map([[gatewayId, 'fake-old-token']]);
    storedSettings = createWebToolsSettings({ enabled: true, provider: 'gateway', baseUrl: 'https://old.example', engines: 'bing' });
    jest.mocked(endpointStore.load).mockResolvedValue(createEndpointProfile({ id: 'endpoint', name: 'Endpoint', baseUrl: 'https://endpoint.example/v1' }));
    jest.mocked(endpointStore.loadAll).mockResolvedValue([]);
    jest.mocked(webToolsStore.load).mockImplementation(async () => storedSettings);
    read.mockImplementation(async (id) => secrets.get(id) ?? null);
    saveCredential.mockImplementation(async (id, token) => { secrets.set(id, token); });
    jest.mocked(credentialStore.remove).mockImplementation(async (id) => { secrets.delete(id); });
    jest.mocked(credentialStore.clearAll).mockImplementation(async () => { secrets.clear(); });
    saveSettings.mockImplementation(async (settings) => { storedSettings = settings; });
    jest.mocked(testWebGateway).mockResolvedValue(undefined);
  });

  afterEach(() => { jest.restoreAllMocks(); });

  async function ready() {
    const view = await render(<SettingsScreen />);
    await waitFor(() => expect(view.getByRole('button', { name: /^save web tools$/i })).toBeEnabled());
    return view;
  }

  it('blocks actions until the initial credential read finishes', async () => {
    const pending = deferred<string | null>();
    read.mockReturnValueOnce(pending.promise);
    const view = await render(<SettingsScreen />);
    await waitFor(() => expect(view.getByLabelText('Gateway token')).toBeTruthy());

    expect(view.getByRole('radio', { name: 'Exa' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Delete all app data' })).toBeDisabled();
    await fireEvent.press(view.getByRole('radio', { name: 'Exa' }));
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));
    expect(read).toHaveBeenCalledTimes(1);
    expect(saveSettings).not.toHaveBeenCalled();

    await act(async () => { pending.resolve('fake-old-token'); });
    expect(view.getByRole('radio', { name: 'Gateway', checked: true })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeEnabled();
  });

  it.each(['resolve', 'reject'] as const)('ignores an older provider credential %s', async (completion) => {
    const view = await ready();
    const oldGatewayRead = deferred<string | null>();
    const currentExaRead = deferred<string | null>();
    read.mockResolvedValueOnce(null).mockReturnValueOnce(oldGatewayRead.promise).mockReturnValueOnce(currentExaRead.promise);
    await fireEvent.press(view.getByRole('radio', { name: 'Exa' }));
    await fireEvent.press(view.getByRole('radio', { name: 'Gateway' }));
    await fireEvent.press(view.getByRole('radio', { name: 'Exa' }));

    expect(view.getByLabelText('Exa API key').props.placeholder).toBe('Exa API key');
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeDisabled();
    await act(async () => {
      if (completion === 'resolve') oldGatewayRead.resolve('fake-stale-token');
      else oldGatewayRead.reject(new Error('fake-secret storage error'));
    });
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeDisabled();
    expect(view.queryByText('Web tools credentials could not be loaded.')).toBeNull();
    await act(async () => { currentExaRead.resolve(null); });

    expect(view.getByRole('radio', { name: 'Exa', checked: true })).toBeTruthy();
    expect(view.getByLabelText('Exa API key').props.placeholder).toBe('Exa API key');
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));
    expect(Alert.alert).toHaveBeenCalledWith('Exa API key required', expect.any(String));
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('keeps a late gateway result from marking a settled Exa selection configured', async () => {
    const view = await ready();
    const gatewayRead = deferred<string | null>();
    read.mockResolvedValueOnce(null).mockReturnValueOnce(gatewayRead.promise).mockResolvedValueOnce(null);
    await fireEvent.press(view.getByRole('radio', { name: 'Exa' }));
    await fireEvent.press(view.getByRole('radio', { name: 'Gateway' }));
    await fireEvent.press(view.getByRole('radio', { name: 'Exa' }));
    await act(async () => { gatewayRead.resolve('fake-gateway-token'); });

    expect(view.getByLabelText('Exa API key').props.placeholder).toBe('Exa API key');
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it.each(['fake-old-token', null])('restores the previous credential %s when settings storage fails', async (previousToken) => {
    if (previousToken === null) secrets.delete(gatewayId);
    const view = await ready();
    saveSettings.mockRejectedValueOnce(new Error('fake-secret settings failure'));
    await fireEvent.changeText(view.getByLabelText('Gateway URL'), 'https://new.example');
    await fireEvent.changeText(view.getByLabelText('Gateway token'), 'fake-new-token');
    await fireEvent.press(view.getByRole('button', { name: /^save web tools$/i }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Could not save web tools', expect.any(String)));

    expect(secrets.get(gatewayId) ?? null).toBe(previousToken);
    expect(storedSettings.baseUrl).toBe('https://old.example');
    expect(view.getByLabelText('Gateway token').props.value).toBe('');
    expect(view.getByText('Save to apply changes')).toBeTruthy();
    expect(view.queryByText('Web tools settings saved.')).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('fake-secret'));
  });

  it.each(['validation', 'read', 'credential'] as const)('clears typed secrets after a failed %s save attempt', async (failure) => {
    const view = await ready();
    await fireEvent.changeText(view.getByLabelText('Gateway token'), 'fake-new-token');
    if (failure === 'validation') await fireEvent.changeText(view.getByLabelText('Gateway URL'), 'invalid fake-secret URL');
    if (failure === 'read') read.mockRejectedValueOnce(new Error('fake-secret read failure'));
    if (failure === 'credential') saveCredential.mockRejectedValueOnce(new Error('fake-secret credential failure'));
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(view.getByLabelText('Gateway token').props.value).toBe('');
    expect(saveSettings).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('fake-secret'));
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeEnabled();
  });

  it('restores a credential if secure storage writes it before rejecting', async () => {
    const view = await ready();
    saveCredential.mockImplementationOnce(async (id, token) => {
      secrets.set(id, token);
      throw new Error('fake-secret index storage failure');
    });
    await fireEvent.changeText(view.getByLabelText('Gateway token'), 'fake-new-token');
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));

    expect(secrets.get(gatewayId)).toBe('fake-old-token');
    expect(saveSettings).not.toHaveBeenCalled();
    expect(view.getByLabelText('Gateway token').props.value).toBe('');
  });

  it('reports a failed rollback safely and clears the typed secret', async () => {
    const view = await ready();
    saveSettings.mockRejectedValueOnce(new Error('fake-secret settings failure'));
    saveCredential.mockImplementationOnce(async (id, token) => { secrets.set(id, token); })
      .mockRejectedValueOnce(new Error('fake-secret rollback failure'));
    await fireEvent.changeText(view.getByLabelText('Gateway token'), 'fake-new-token');
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));

    expect(Alert.alert).toHaveBeenCalledWith('Could not restore web tools credential', expect.stringContaining('Re-enter the credential'));
    expect(Alert.alert).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('fake-secret'));
    expect(view.getByLabelText('Gateway token').props.value).toBe('');
    expect(view.getByText('Token required')).toBeTruthy();
    expect(view.queryByText('Configured')).toBeNull();
  });

  it('marks settings configured only after saving the draft and credential', async () => {
    const view = await ready();
    await fireEvent.changeText(view.getByLabelText('Gateway URL'), 'https://new.example/');
    await fireEvent.changeText(view.getByLabelText('Gateway token'), ' fake-new-token ');
    await fireEvent.changeText(view.getByLabelText('SearXNG engines'), ' bing,google ');
    expect(view.getByText('Save to apply changes')).toBeTruthy();
    expect(view.queryByText('Configured')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));

    expect(storedSettings.baseUrl).toBe('https://new.example');
    expect(storedSettings.engines).toBe('bing,google');
    expect(secrets.get(gatewayId)).toBe('fake-new-token');
    expect(view.getByLabelText('Gateway token').props.value).toBe('');
    expect(view.getByText('Configured')).toBeTruthy();
    expect(view.queryByText('Save to apply changes')).toBeNull();
  });

  it('does not allow deletion or provider changes while a settings save is pending', async () => {
    const pending = deferred<void>();
    saveSettings.mockImplementationOnce(async (settings) => { await pending.promise; storedSettings = settings; });
    const view = await ready();
    await fireEvent.changeText(view.getByLabelText('Gateway token'), 'fake-new-token');
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));

    expect(view.getByRole('button', { name: 'Delete all app data' })).toBeDisabled();
    expect(view.getByRole('radio', { name: 'Exa' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Test gateway health' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Reset protocol compatibility' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'Delete all app data' }));
    expect(view.queryByText('Delete all app data?')).toBeNull();
    expect(credentialStore.clearAll).not.toHaveBeenCalled();

    await act(async () => { pending.resolve(); });
    expect(view.getByRole('button', { name: 'Delete all app data' })).toBeEnabled();
    await fireEvent.press(view.getByRole('button', { name: 'Delete all app data' }));
    await fireEvent.press(view.getByRole('button', { name: 'Delete data' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/setup'));
    expect(secrets.size).toBe(0);
  });

  it('blocks writes during deletion confirmation and deletion itself', async () => {
    const pending = deferred<void>();
    jest.mocked(webToolsStore.clear).mockReturnValueOnce(pending.promise);
    const view = await ready();
    await fireEvent.press(view.getByRole('button', { name: 'Delete all app data' }));
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Reset protocol compatibility' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));
    await fireEvent.press(view.getByRole('button', { name: 'Reset protocol compatibility' }));
    await fireEvent.press(view.getByRole('button', { name: 'Delete data' }));
    await waitFor(() => expect(webToolsStore.clear).toHaveBeenCalledTimes(1));
    await fireEvent.press(view.getByRole('button', { name: 'Save web tools' }));
    expect(saveSettings).not.toHaveBeenCalled();
    expect(endpointStore.clearProtocol).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => { pending.resolve(); });
    expect(mockRouter.replace).toHaveBeenCalledWith('/setup');
    expect(secrets.size).toBe(0);
  });

  it('keeps deletion blocked until a pending protocol reset finishes', async () => {
    const pending = deferred<void>();
    jest.mocked(endpointStore.clearProtocol).mockReturnValueOnce(pending.promise);
    const view = await ready();
    await fireEvent.press(view.getByRole('button', { name: 'Reset protocol compatibility' }));
    expect(view.getByRole('button', { name: 'Delete all app data' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'Delete all app data' }));
    expect(view.queryByText('Delete all app data?')).toBeNull();
    await act(async () => { pending.resolve(); });
    expect(view.getByRole('button', { name: 'Delete all app data' })).toBeEnabled();
  });

  it('unlocks settings after cancelling confirmation and permits retry after deletion fails', async () => {
    const view = await ready();
    await fireEvent.press(view.getByRole('button', { name: 'Delete all app data' }));
    await fireEvent.press(view.getByRole('button', { name: 'Cancel' }));
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeEnabled();
    expect(credentialStore.clearAll).not.toHaveBeenCalled();
    jest.mocked(credentialStore.clearAll).mockRejectedValueOnce(new Error('fake-secret delete failure'));
    await fireEvent.press(view.getByRole('button', { name: 'Delete all app data' }));
    await fireEvent.press(view.getByRole('button', { name: 'Delete data' }));
    expect(Alert.alert).toHaveBeenCalledWith('Could not delete all data', 'Close the app and try again.');
    expect(view.getByRole('button', { name: 'Delete data' })).toBeEnabled();
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'Delete data' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/setup');
  });

  it('labels health checks accurately and prevents editing while they run', async () => {
    const pending = deferred<void>();
    jest.mocked(testWebGateway).mockReturnValueOnce(pending.promise);
    const view = await ready();
    await fireEvent.press(view.getByRole('button', { name: 'Test gateway health' }));
    expect(view.getByLabelText('Gateway URL')).not.toBeEnabled();
    expect(view.getByLabelText('Gateway token')).not.toBeEnabled();
    expect(view.getByLabelText('SearXNG engines')).not.toBeEnabled();
    expect(view.getByRole('radio', { name: 'Exa' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Save web tools' })).toBeDisabled();
    await act(async () => { pending.resolve(); });

    expect(view.getByText('Gateway health check passed. Search authentication was not tested.')).toBeTruthy();
    expect(view.queryByText('Connected')).toBeNull();
    await fireEvent.changeText(view.getByLabelText('Gateway URL'), 'https://new.example');
    expect(view.queryByText('Gateway health check passed. Search authentication was not tested.')).toBeNull();
    expect(view.getByText('Save to apply changes')).toBeTruthy();
  });

  it('clears a previous health result when a later check fails', async () => {
    const view = await ready();
    await fireEvent.press(view.getByRole('button', { name: 'Test gateway health' }));
    jest.mocked(testWebGateway).mockRejectedValueOnce(new Error('fake-secret request failure'));
    await fireEvent.press(view.getByRole('button', { name: 'Test gateway health' }));

    expect(view.queryByText('Gateway health check passed. Search authentication was not tested.')).toBeNull();
    expect(Alert.alert).toHaveBeenCalledWith('Could not connect to gateway', expect.any(String));
    expect(Alert.alert).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('fake-secret'));
    expect(view.getByLabelText('Gateway URL')).toBeEnabled();
  });

  it('links model settings to the existing explicit route', async () => {
    const view = await ready();
    expect(view.getByRole('link', { name: 'Model catalog & overrides' }).props.href).toBe('/models');
  });

  it('uses informational notices, honest draft state, and keyboard tap handling', async () => {
    jest.mocked(webToolsStore.load).mockRejectedValueOnce(new Error('fake-secret storage failure'));
    const view = await render(<SettingsScreen />);
    expect(await view.findByText('Web tools settings could not be loaded.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Dismiss notice' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Dismiss notice' })).toHaveStyle({ minWidth: interaction.compactTouchTarget, minHeight: interaction.compactTouchTarget });
    const noticeIcon = view.getByText('Web tools settings could not be loaded.').parent?.children.find((child) => typeof child !== 'string' && child.props.name === 'info.circle');
    expect(noticeIcon).toBeTruthy();
    let scrollView = view.getByLabelText('Gateway token').parent;
    while (scrollView && scrollView.props.keyboardShouldPersistTaps === undefined) scrollView = scrollView.parent;
    expect(scrollView?.props.keyboardShouldPersistTaps).toBe('handled');
    expect(view.queryByText('Settings & Maintenance')).toBeNull();
    expect(view.getByText('Settings')).toBeTruthy();
    expect(view.queryByText('CONFIG // SYS.PREFS')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Dismiss notice' }));
    expect(view.queryByText('Web tools settings could not be loaded.')).toBeNull();

    await fireEvent(view.getByLabelText('Enable web search and fetch'), 'change', { nativeEvent: { value: true } });
    expect(view.getByText('Save to apply changes')).toBeTruthy();
    expect(view.queryByText('Configured')).toBeNull();
  });

  it('uses the shared focus color for gateway inputs', async () => {
    const view = await ready();
    await fireEvent(view.getByLabelText('Gateway URL'), 'focus');
    expect(view.getByLabelText('Gateway URL')).toHaveStyle({ borderColor: colors.primary });
    await fireEvent(view.getByLabelText('Gateway URL'), 'blur');
    expect(view.getByLabelText('Gateway URL')).toHaveStyle({ borderColor: colors.border });
  });
});
