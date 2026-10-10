import { act, fireEvent, render } from '@testing-library/react-native';

import SetupScreen from '../../app/setup';
import { createEndpointProfile } from '../../src/domain/endpoint';
import { connectAndDiscover, type OnboardResult } from '../../src/features/setup/onboarding';
import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(), replace: jest.fn() };
let mockParams: { mode?: string } = {};

jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('../../src/features/setup/use-active-endpoint', () => ({ useActiveEndpoint: jest.fn() }));
jest.mock('../../src/features/setup/onboarding', () => ({
  ...jest.requireActual('../../src/features/setup/onboarding'), connectAndDiscover: jest.fn(),
}));
jest.mock('../../src/services/persistence/catalog-files', () => ({ fileCatalogStorage: {}, readBundledDefaults: jest.fn() }));
jest.mock('../../src/services/persistence/catalog-seed', () => ({ seedCatalogCache: jest.fn() }));

const saved = createEndpointProfile({
  id: 'custom', name: 'My private endpoint', baseUrl: 'https://api.example/v1', credentialRef: 'saved_credential',
});
const failed: OnboardResult = {
  ok: false,
  error: {
    category: 'network', message: 'Endpoint unreachable. Try again.', httpStatus: null,
    providerCode: null, requestId: null, retryable: true, safeDetails: {},
  },
};

describe('SetupScreen', () => {
  const activeEndpoint = jest.mocked(useActiveEndpoint);
  const connect = jest.mocked(connectAndDiscover);

  beforeEach(() => {
    jest.resetAllMocks();
    mockParams = {};
    activeEndpoint.mockReturnValue({ status: 'ready', profile: saved });
    connect.mockResolvedValue({ ok: true, profile: saved });
    mockRouter.canGoBack.mockReturnValue(true);
  });

  it('preserves a custom saved name when only the URL is edited', async () => {
    const view = await render(<SetupScreen />);
    expect(view.getByLabelText('Endpoint name').props.value).toBe(saved.name);
    expect(view.getByLabelText('API key').props.value).toBe('');
    await fireEvent.changeText(view.getByLabelText('Endpoint base URL'), 'https://changed.example/v1');
    await fireEvent.press(view.getByRole('button', { name: /^Connect/ }));

    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      name: saved.name, baseUrl: 'https://changed.example/v1', apiKey: '', apiKeyChanged: false,
    }), saved, expect.any(Object));
    expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
  });

  it.each(['/../models', '/%'])('disables Connect for an invalid models path %s and recovers when corrected', async (path) => {
    const view = await render(<SetupScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Show advanced settings' }));
    await fireEvent.changeText(view.getByLabelText('Models path'), path);

    expect(view.queryByText('https://api.example/v1/models')).toBeNull();
    expect(view.getByRole('button', { name: /^Connect/ })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: /^Connect/ }));
    expect(connect).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByLabelText('Models path'), '/catalog');
    expect(view.getByText('https://api.example/v1/catalog')).toBeTruthy();
    expect(view.getByRole('button', { name: /^Connect/ })).toBeEnabled();
  });

  it('locks editable controls while connecting and restores them after failure', async () => {
    let finish!: (value: OnboardResult) => void;
    connect.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const view = await render(<SetupScreen />);
    await fireEvent.press(view.getByRole('button', { name: 'Show advanced settings' }));
    await fireEvent.changeText(view.getByLabelText('API key'), 'fake-key');
    await fireEvent.press(view.getByRole('button', { name: /^Connect/ }));

    for (const label of ['Endpoint name', 'Endpoint base URL', 'API key', 'Models path']) {
      expect(view.getByLabelText(label).props.editable).toBe(false);
      expect(view.getByLabelText(label).props.accessibilityState).toEqual({ disabled: true });
    }
    for (const label of ['Auth mode x-api-key', 'Chat protocol auto', 'Hide advanced settings']) {
      expect(view.getByRole('button', { name: label })).toBeDisabled();
      await fireEvent.press(view.getByRole('button', { name: label }));
    }
    await fireEvent.press(view.getByRole('button', { name: /^Connect/ }));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('API key').props.value).toBe('fake-key');

    await act(async () => { finish(failed); });
    expect(view.getByRole('alert')).toBeTruthy();
    expect(view.getByLabelText('API key').props.value).toBe('');
    expect(view.getByLabelText('Endpoint name').props.value).toBe(saved.name);
    expect(view.getByLabelText('Models path').props.editable).toBe(true);
    expect(view.getByRole('button', { name: /^Connect/ })).toBeEnabled();
  });

  it('ignores duplicate submit events while a connection is pending', async () => {
    let finish!: (value: OnboardResult) => void;
    connect.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const view = await render(<SetupScreen />);
    const button = view.getByRole('button', { name: /^Connect/ });

    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(connect).toHaveBeenCalledTimes(1);
    await act(async () => { finish(failed); });
  });

  it('recovers from a rejected connection without exposing secrets or losing endpoint edits', async () => {
    connect.mockRejectedValueOnce(new Error('Secure storage unavailable: fake-secret'));
    const view = await render(<SetupScreen />);
    await fireEvent.changeText(view.getByLabelText('Endpoint name'), 'Renamed endpoint');
    await fireEvent.changeText(view.getByLabelText('Endpoint base URL'), 'https://changed.example/v1');
    await fireEvent.changeText(view.getByLabelText('API key'), 'fake-key');
    await fireEvent.press(view.getByRole('button', { name: 'Connect' }));

    expect(view.getByRole('alert')).toHaveTextContent(/try again/i);
    expect(view.queryByText(/fake-secret/)).toBeNull();
    expect(view.getByLabelText('Endpoint name').props.value).toBe('Renamed endpoint');
    expect(view.getByLabelText('Endpoint base URL').props.value).toBe('https://changed.example/v1');
    expect(view.getByLabelText('API key').props.value).toBe('');
    expect(view.getByLabelText('Endpoint name').props.editable).toBe(true);
    expect(view.getByRole('button', { name: 'Connect' })).toBeEnabled();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await fireEvent.press(view.getByRole('button', { name: 'Connect' }));
    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenLastCalledWith(expect.objectContaining({
      name: 'Renamed endpoint', baseUrl: 'https://changed.example/v1', apiKey: '', apiKeyChanged: false,
    }), saved, expect.any(Object));
    expect(mockRouter.replace).toHaveBeenCalledWith('/chat');
  });

  it('keeps first-run setup focused and moves connection options into Advanced', async () => {
    activeEndpoint.mockReturnValue({ status: 'ready', profile: null });
    const view = await render(<SetupScreen />);

    expect(view.queryByText('CONNECTION DIAGNOSTICS')).toBeNull();
    expect(view.queryByText('READY')).toBeNull();
    expect(view.queryByRole('button', { name: 'Back' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Auth mode bearer' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Chat protocol responses' })).toBeNull();
    expect(view.getByText(/no billable test/i)).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Endpoint base URL'), 'https://new.example/v1');
    await fireEvent.changeText(view.getByLabelText('API key'), 'fake-key');
    await fireEvent.press(view.getByRole('button', { name: 'Show advanced settings' }));
    expect(view.getByLabelText('Models path')).toBeTruthy();
    expect(view.getByText('https://new.example/v1/models')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Auth mode bearer' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Chat protocol responses' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: /^Connect/ }));
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ name: 'new.example', apiKeyChanged: true }), null, expect.any(Object));
  });

  it.each([true, false])('shows Back when a profile exists with history %s', async (canGoBack) => {
    mockParams = { mode: 'new' };
    mockRouter.canGoBack.mockReturnValue(canGoBack);
    const view = await render(<SetupScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Back' }));
    if (canGoBack) {
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).not.toHaveBeenCalled();
    } else {
      expect(mockRouter.replace).toHaveBeenCalledWith('/settings');
      expect(mockRouter.back).not.toHaveBeenCalled();
    }
  });
});
