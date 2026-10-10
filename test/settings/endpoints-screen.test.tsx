import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { Alert, Animated } from 'react-native';

import EndpointProfilesScreen from '../../app/settings/endpoints';
import { createEndpointProfile } from '../../src/domain/endpoint';
import { pickEndpointProfiles, shareEndpointProfiles } from '../../src/services/persistence/catalog-transfer';
import { conversationRepository } from '../../src/services/persistence/conversation-store';
import { endpointStore } from '../../src/services/persistence/endpoint-store';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../../src/services/persistence/endpoint-store', () => ({
  endpointStore: { loadAll: jest.fn(), load: jest.fn(), select: jest.fn(), remove: jest.fn(), addMany: jest.fn() },
}));
jest.mock('../../src/services/persistence/catalog-transfer', () => ({
  pickEndpointProfiles: jest.fn(), shareEndpointProfiles: jest.fn(),
}));
jest.mock('../../src/services/persistence/conversation-store', () => ({
  conversationRepository: { countByEndpoint: jest.fn(), removeByEndpoint: jest.fn() },
}));
jest.mock('../../src/services/persistence/catalog-files', () => ({ deleteCatalogForEndpoint: jest.fn() }));
jest.mock('../../src/services/credentials/store', () => ({ credentialStore: { remove: jest.fn() } }));
jest.mock('../../src/services/attachments/files', () => ({ deleteStagedAttachments: jest.fn() }));

const primary = createEndpointProfile({ id: 'primary', name: 'Primary', baseUrl: 'https://primary.example/v1' });
const imported = createEndpointProfile({ id: 'imported', name: 'Imported', baseUrl: 'https://imported.example/v1', credentialRef: null });
const push = jest.fn();
const replace = jest.fn();
const back = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useRouter).mockReturnValue({ push, replace, back } as unknown as ReturnType<typeof useRouter>);
  jest.mocked(endpointStore.loadAll).mockResolvedValue([primary, imported]);
  jest.mocked(endpointStore.load).mockResolvedValue(primary);
  jest.mocked(endpointStore.select).mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => { jest.restoreAllMocks(); });

describe('EndpointProfilesScreen', () => {
  it('recovers from an initial load failure through retry', async () => {
    jest.mocked(endpointStore.loadAll).mockRejectedValueOnce(new Error('Storage unavailable'));

    const view = await render(<EndpointProfilesScreen />);

    expect(await view.findByRole('alert')).toHaveTextContent('Could not load endpoint profiles. Try again.');
    expect(view.queryByText('Loading endpoint profiles.')).toBeNull();
    expect(view.queryByText('No endpoint profiles yet.')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(view.getByText('Imported')).toBeTruthy());
    expect(view.queryByRole('alert')).toBeNull();
    expect(endpointStore.loadAll).toHaveBeenCalledTimes(2);
    expect(endpointStore.load).toHaveBeenCalledTimes(2);
  });

  it('selects the chosen imported endpoint before opening its setup form', async () => {
    let finishSelection!: () => void;
    jest.mocked(endpointStore.select).mockReturnValue(new Promise<void>((resolve) => { finishSelection = resolve; }));
    const view = await render(<EndpointProfilesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Edit Imported' }));

    await waitFor(() => expect(endpointStore.select).toHaveBeenCalledWith(imported.id));
    expect(push).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Edit Primary' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'Edit Primary' }));
    expect(endpointStore.select).toHaveBeenCalledTimes(1);

    await act(async () => { finishSelection(); });

    expect(push).toHaveBeenCalledWith('/setup');
    expect(replace).not.toHaveBeenCalled();
  });

  it('offers add and import for an empty collection without a duplicate Back control', async () => {
    jest.mocked(endpointStore.loadAll).mockResolvedValue([]);
    jest.mocked(endpointStore.load).mockResolvedValue(null);
    const view = await render(<EndpointProfilesScreen />);

    expect(view.getByText('No endpoint profiles yet.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'IMPORT' })).toBeEnabled();
    expect(view.getByRole('button', { name: 'EXPORT' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'ADD ENDPOINT' }));
    expect(push).toHaveBeenCalledWith('/setup?mode=new');
    expect(view.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('stays on the list and releases controls when edit selection fails', async () => {
    jest.mocked(endpointStore.select).mockRejectedValueOnce(new Error('Storage unavailable'));
    const view = await render(<EndpointProfilesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Edit Imported' }));

    expect(Alert.alert).toHaveBeenCalledWith('Could not edit endpoint', 'The profile could not be selected. Try again.');
    expect(push).not.toHaveBeenCalled();
    expect(view.getByRole('button', { name: 'Edit Imported' })).toBeEnabled();
  });

  it('blocks overlapping import, export, and edit while the picker is open', async () => {
    let cancelImport!: () => void;
    jest.mocked(pickEndpointProfiles).mockReturnValue(new Promise<null>((resolve) => { cancelImport = () => resolve(null); }));
    const view = await render(<EndpointProfilesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'IMPORT' }));

    expect(view.getByText('Importing endpoint profiles.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'EXPORT' })).toBeDisabled();
    expect(view.getByRole('button', { name: 'Edit Imported' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: 'IMPORT' }));
    await fireEvent.press(view.getByRole('button', { name: 'EXPORT' }));
    expect(pickEndpointProfiles).toHaveBeenCalledTimes(1);
    expect(shareEndpointProfiles).not.toHaveBeenCalled();

    await act(async () => { cancelImport(); });

    expect(view.getByRole('button', { name: 'EXPORT' })).toBeEnabled();
    expect(view.getByRole('button', { name: 'Edit Imported' })).toBeEnabled();
  });

  it('shows delete controls at normal height and closes on cancel', async () => {
    jest.spyOn(Animated, 'parallel').mockImplementation(() => ({
      start: (callback) => callback?.({ finished: true }), stop: jest.fn(), reset: jest.fn(),
    }));
    jest.mocked(conversationRepository.countByEndpoint).mockResolvedValue(3);
    const view = await render(<EndpointProfilesScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Delete Imported' }));

    expect(conversationRepository.countByEndpoint).toHaveBeenCalledWith(imported.id);
    expect(view.getByText(/3 conversations use this endpoint/)).toBeTruthy();
    for (const name of ['KEEP CONVERSATIONS', 'DELETE ENDPOINT AND CONVERSATIONS', 'CANCEL']) {
      const button = view.getByRole('button', { name });
      expect(button).toHaveStyle({ minHeight: 48 });
      expect(button).not.toHaveStyle({ flex: 1 });
    }
    await fireEvent.press(view.getByRole('button', { name: 'CANCEL' }));
    await waitFor(() => expect(view.queryByText('Delete endpoint?')).toBeNull());
    expect(endpointStore.remove).not.toHaveBeenCalled();
  });
});
