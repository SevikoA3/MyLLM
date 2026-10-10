import { attachmentDataUrls } from '../../../src/services/attachments/attachment-input';

const mockSizes = new Map<string, number | undefined>();
const mockUnavailableProperties = new Set<string>();
const mockBase64 = jest.fn(async () => 'AA==');

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    get exists() { return !mockUnavailableProperties.has(this.uri) && mockSizes.has(this.uri); }
    get size() { return mockUnavailableProperties.has(this.uri) ? null : mockSizes.get(this.uri) ?? null; }
    info() { return { exists: mockSizes.has(this.uri), size: mockSizes.get(this.uri) }; }
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
    mockUnavailableProperties.clear();
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

  it('prepares a file with readable stat metadata when native properties are unavailable', async () => {
    mockSizes.set(document.uri, 100);
    mockUnavailableProperties.add(document.uri);
    const urls = await prepare([{ role: 'user', content: '', attachments: [document] }]);
    expect([...urls]).toEqual([['file_1', 'data:application/pdf;base64,AA==']]);
    expect(mockBase64).toHaveBeenCalledTimes(1);
  });

  it('rechecks actual file sizes before reading any file into JavaScript', async () => {
    mockSizes.set(image.uri, 100);
    mockSizes.set(document.uri, 10 * 1024 * 1024 + 1);
    await expect(prepare([{ role: 'user', content: '', attachments: [image, document] }])).rejects.toThrow(/no longer valid/);
    expect(mockBase64).not.toHaveBeenCalled();
  });

  it.each([false, true])('rejects a combined total above 80 MB before preparing data URLs (repeated: %s)', async (repeated) => {
    const attachments = Array.from({ length: 9 }, (_, index) => repeated ? document : ({ ...document, id: `file_${index}`, uri: `file:///file_${index}.pdf` }));
    attachments.forEach((attachment) => mockSizes.set(attachment.uri, 10 * 1024 * 1024));
    await expect(prepare([{ role: 'user', content: '', attachments }])).rejects.toThrow(/message limit/);
    expect(mockBase64).not.toHaveBeenCalled();
  });

  it('validates actual combined sizes in later messages before reading an earlier file', async () => {
    mockSizes.set(image.uri, 100);
    mockSizes.set(document.uri, 10 * 1024 * 1024);
    await expect(prepare([
      { role: 'user', content: '', attachments: [image] },
      { role: 'user', content: '', attachments: Array.from({ length: 9 }, () => document) },
    ])).rejects.toThrow(/message limit/);
    expect(mockBase64).not.toHaveBeenCalled();
  });

  it.each([undefined, 0])('rejects actual size %s even when the stored size is positive', async (byteSize) => {
    mockSizes.set(document.uri, byteSize);
    await expect(prepare([{ role: 'user', content: '', attachments: [document] }])).rejects.toThrow(/no longer valid/);
    expect(mockBase64).not.toHaveBeenCalled();
  });

  it('fails clearly when a persisted file is missing', async () => {
    await expect(prepare([{ role: 'user', content: '', attachments: [document] }])).rejects.toThrow(/unavailable/);
    expect(mockBase64).not.toHaveBeenCalled();
  });
});
