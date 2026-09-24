import { stageImageAttachment } from '../../../src/services/attachments/images';

const mockPermission = jest.fn();
const mockLaunch = jest.fn();

jest.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: { document: 'file:///documents' },
}));

describe('stageImageAttachment', () => {
  it('reports a denied photo-library permission without opening the picker', async () => {
    mockPermission.mockResolvedValue({ status: 'denied', canAskAgain: false });

    await expect(stageImageAttachment([], async () => ({
      getMediaLibraryPermissionsAsync: () => mockPermission(),
      launchImageLibraryAsync: () => mockLaunch(),
    }))).resolves.toEqual({ kind: 'rejected', reason: 'permission_denied' });
    expect(mockLaunch).not.toHaveBeenCalled();
  });
});
