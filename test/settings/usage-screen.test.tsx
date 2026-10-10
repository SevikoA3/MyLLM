import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import UsageScreen from '../../app/settings/usage';
import { createEndpointProfile } from '../../src/domain/endpoint';
import { useActiveEndpoint } from '../../src/features/setup/use-active-endpoint';
import { credentialStore } from '../../src/services/credentials/store';
import { fetchAccountUsage, type UsageResult } from '../../src/services/transport/usage';

const mockRouter = { back: jest.fn(), canGoBack: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../../src/features/setup/use-active-endpoint', () => ({ useActiveEndpoint: jest.fn() }));
jest.mock('../../src/services/credentials/store', () => ({ credentialStore: { read: jest.fn() } }));
jest.mock('../../src/services/transport/usage', () => ({ fetchAccountUsage: jest.fn() }));

function profile(id: string) {
  const endpoint = createEndpointProfile({
    id, name: id, baseUrl: `https://${id}.example/v1`, credentialRef: `credential_${id}`,
  });
  endpoint.compat.usagePath = '/usage';
  return endpoint;
}

function result(balance: number | null): UsageResult {
  return { ok: true, usage: { balance, currency: null, periodStart: null, periodEnd: null } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

describe('UsageScreen', () => {
  const activeEndpoint = jest.mocked(useActiveEndpoint);
  const read = jest.mocked(credentialStore.read);
  const fetchUsage = jest.mocked(fetchAccountUsage);

  beforeEach(() => {
    jest.resetAllMocks();
    activeEndpoint.mockReturnValue({ status: 'ready', profile: profile('first') });
    read.mockResolvedValue('fake-key');
    fetchUsage.mockResolvedValue(result(101));
    mockRouter.canGoBack.mockReturnValue(true);
  });

  it('recovers from a rejected secure read on initial load and refresh', async () => {
    read.mockRejectedValueOnce(new Error('Secure storage unavailable: fake-secret'));
    const view = await render(<UsageScreen />);

    await waitFor(() => expect(view.getByRole('alert').props.children).toMatch(/try again/i));
    expect(view.queryByText(/fake-secret/)).toBeNull();
    expect(fetchUsage).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Refresh account usage', disabled: false })).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Refresh account usage' }));
    await waitFor(() => expect(view.getByText('101')).toBeTruthy());

    read.mockRejectedValueOnce(new Error('Secure storage unavailable'));
    await fireEvent.press(view.getByRole('button', { name: 'Refresh account usage' }));
    await waitFor(() => expect(view.getByRole('alert').props.children).toMatch(/try again/i));
    expect(view.queryByText('101')).toBeNull();
    expect(view.getByRole('button', { name: 'Refresh account usage', disabled: false })).toBeTruthy();
  });

  it.each(['resolve', 'reject'] as const)('clears usage on profile changes and ignores a stale refresh %s', async (completion) => {
    const secondLoad = deferred<UsageResult>();
    const staleRefresh = deferred<UsageResult>();
    const thirdLoad = deferred<UsageResult>();
    fetchUsage
      .mockResolvedValueOnce(result(101))
      .mockReturnValueOnce(secondLoad.promise)
      .mockReturnValueOnce(staleRefresh.promise)
      .mockReturnValueOnce(thirdLoad.promise);
    const view = await render(<UsageScreen />);
    await waitFor(() => expect(view.getByText('101')).toBeTruthy());

    const second = profile('second');
    activeEndpoint.mockReturnValue({ status: 'ready', profile: second });
    await view.rerender(<UsageScreen />);
    expect(view.queryByText('101')).toBeNull();
    expect(view.getByRole('button', { name: 'Refresh account usage', disabled: true })).toBeTruthy();

    await act(async () => { secondLoad.resolve(result(202)); });
    await waitFor(() => expect(view.getByText('202')).toBeTruthy());
    await fireEvent.press(view.getByRole('button', { name: 'Refresh account usage' }));
    await waitFor(() => expect(fetchUsage).toHaveBeenCalledTimes(3));

    const third = profile('third');
    activeEndpoint.mockReturnValue({ status: 'ready', profile: third });
    await view.rerender(<UsageScreen />);
    await waitFor(() => expect(fetchUsage).toHaveBeenCalledWith(third, 'fake-key'));
    expect(view.queryByText('202')).toBeNull();

    await act(async () => {
      if (completion === 'resolve') staleRefresh.resolve(result(999));
      else staleRefresh.reject(new Error('Old endpoint unavailable'));
    });
    expect(view.queryByText('999')).toBeNull();
    expect(view.queryByRole('alert')).toBeNull();
    expect(view.getByRole('button', { name: 'Refresh account usage', disabled: true })).toBeTruthy();

    await act(async () => { thirdLoad.resolve(result(303)); });
    expect(view.getByText('303')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Refresh account usage', disabled: false })).toBeTruthy();
  });

  it.each(['resolve', 'reject'] as const)('ignores a stale secure read %s after a profile change', async (completion) => {
    const staleRead = deferred<string | null>();
    const currentLoad = deferred<UsageResult>();
    read.mockReturnValueOnce(staleRead.promise);
    fetchUsage.mockReturnValueOnce(currentLoad.promise);
    const view = await render(<UsageScreen />);

    const second = profile('second');
    activeEndpoint.mockReturnValue({ status: 'ready', profile: second });
    await view.rerender(<UsageScreen />);
    await waitFor(() => expect(fetchUsage).toHaveBeenCalledWith(second, 'fake-key'));
    await act(async () => {
      if (completion === 'resolve') staleRead.resolve('fake-old-key');
      else staleRead.reject(new Error('Old secure storage unavailable'));
    });
    expect(fetchUsage).toHaveBeenCalledTimes(1);
    expect(view.queryByRole('alert')).toBeNull();
    expect(view.getByRole('button', { name: 'Refresh account usage', disabled: true })).toBeTruthy();

    await act(async () => { currentLoad.resolve(result(202)); });
    expect(view.getByText('202')).toBeTruthy();
  });

  it('labels account loading and prevents duplicate refreshes', async () => {
    const pending = deferred<string | null>();
    read.mockReturnValueOnce(pending.promise);
    const view = await render(<UsageScreen />);

    expect(view.getByText('Loading account usage…')).toBeTruthy();
    expect(view.getByRole('progressbar', { name: 'Loading account usage' }).props.accessibilityState).toEqual({ busy: true });
    expect(view.getByRole('button', { name: 'Refresh account usage' }).props.accessibilityState).toEqual({ disabled: true, busy: true });
    await fireEvent.press(view.getByRole('button', { name: 'Refresh account usage' }));
    expect(read).toHaveBeenCalledTimes(1);

    await act(async () => { pending.resolve('fake-key'); });
    await waitFor(() => expect(view.getByText('101')).toBeTruthy());
  });

  it('keeps a visible back control while the endpoint loads', async () => {
    activeEndpoint.mockReturnValue({ status: 'loading', profile: null });
    const view = await render(<UsageScreen />);

    expect(view.getByText('Loading endpoint…')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Refresh account usage', disabled: true })).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Back to settings' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('falls back to settings when there is no back history', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const view = await render(<UsageScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Back to settings' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/settings');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('shows unavailable values without inventing account data', async () => {
    fetchUsage.mockResolvedValueOnce(result(null));
    const view = await render(<UsageScreen />);

    await waitFor(() => expect(view.getAllByText('unavailable')).toHaveLength(4));
    expect(view.queryByText('0')).toBeNull();
    expect(view.queryByRole('alert')).toBeNull();
  });

  it('does not request usage for an undocumented endpoint', async () => {
    const endpoint = profile('undocumented');
    endpoint.compat.usagePath = null;
    activeEndpoint.mockReturnValue({ status: 'ready', profile: endpoint });
    const view = await render(<UsageScreen />);

    await waitFor(() => expect(view.getByRole('alert')).toBeTruthy());
    expect(read).not.toHaveBeenCalled();
    expect(fetchUsage).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Back to settings' })).toBeTruthy();
  });
});
