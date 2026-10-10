import { attachmentDataUrls } from '../../../src/services/attachments/attachment-input';

const mockSizes = new Map<string, number>();
const mockBase64 = jest.fn(async () => 'AA==');

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    get exists() { return mockSizes.has(this.uri); }
    get size() { return mockSizes.get(this.uri) ?? null; }
    base64() { return mockBase64(); }
  },
}));

const image = { id: 'image_1', name: 'photo.png', mimeType: 'image/png', byteSize: 100, uri: 'file:///photo.png' } as const;
const document = { id: 'file_1', name: 'notes.pdf', mimeType: 'application/pdf', byteSize: 100, uri: 'file:///notes.pdf' } as const;

function prepare(history: Parameters<typeof attachmentDataUrls>[0]) {
  return attachmentDataUrls(history, async () => jest.requireMock('expo-file-system'));
}

describe('attachmentDataUrls', () => {
  beforeEach(() => {
    mockSizes.clear();
    mockBase64.mockClear();
  });

  it('prepares images and documents once when history repeats a staged file', async () => {
    mockSizes.set(image.uri, 100);
    mockSizes.set(document.uri, 100);
    const urls = await prepare([
      { role: 'user', content: '', attachments: [image, document] },
      { role: 'user', content: '', attachments: [document] },
    ]);
    expect([...urls]).toEqual([['image_1', 'data:image/png;base64,AA=='], ['file_1', 'data:application/pdf;base64,AA==']]);
    expect(mockBase64).toHaveBeenCalledTimes(2);
  });

  it('rechecks actual file sizes before reading any file into JavaScript', async () => {
    mockSizes.set(image.uri, 100);
    mockSizes.set(document.uri, 10 * 1024 * 1024 + 1);
    await expect(prepare([{ role: 'user', content: '', attachments: [image, document] }])).rejects.toThrow(/no longer valid/);
    expect(mockBase64).not.toHaveBeenCalled();
  });

  it('rejects a combined total above 80 MB before preparing data URLs', async () => {
    const attachments = Array.from({ length: 9 }, (_, index) => ({ ...document, id: `file_${index}`, uri: `file:///file_${index}.pdf` }));
    attachments.forEach((attachment) => mockSizes.set(attachment.uri, 10 * 1024 * 1024));
    await expect(prepare([{ role: 'user', content: '', attachments }])).rejects.toThrow(/message limit/);
    expect(mockBase64).not.toHaveBeenCalled();
  });

  it('fails clearly when a persisted file is missing', async () => {
    await expect(prepare([{ role: 'user', content: '', attachments: [document] }])).rejects.toThrow(/unavailable/);
    expect(mockBase64).not.toHaveBeenCalled();
  });
});
