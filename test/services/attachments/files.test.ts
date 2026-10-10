import { stageAttachment } from '../../../src/services/attachments/files';

const mockFiles = new Map<string, number>();
const mockPick = jest.fn();

jest.mock('expo-file-system', () => ({
  Directory: class {
    exists = true;
    uri = 'file:///documents/attachments/';
  },
  File: class {
    uri: string;
    constructor(parent: string | { uri: string }, name = '') {
      this.uri = (typeof parent === 'string' ? parent : parent.uri) + name;
    }
    get exists() { return mockFiles.has(this.uri); }
    get size() { return mockFiles.get(this.uri) ?? null; }
    copy(target: { uri: string }) { mockFiles.set(target.uri, this.size!); }
    delete() { mockFiles.delete(this.uri); }
  },
  Paths: { document: 'file:///documents/', cache: { uri: 'file:///cache/' } },
}));

describe('stageAttachment', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockPick.mockReset();
  });

  it('opens the document picker and keeps a private staged copy of a PDF', async () => {
    mockFiles.set('file:///cache/notes.pdf', 100);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/notes.pdf', name: 'notes.pdf', mimeType: 'application/pdf', size: 100 }] });
    const result = await stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }));
    expect(mockPick).toHaveBeenCalledWith({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false, base64: false });
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('The PDF must be staged.');
    expect(result.attachment).toMatchObject({ name: 'notes.pdf', mimeType: 'application/pdf', byteSize: 100 });
    expect(result.attachment.uri).toMatch(/^file:\/\/\/documents\/attachments\//);
    expect(mockFiles.get(result.attachment.uri)).toBe(100);
    expect(mockFiles.has('file:///cache/notes.pdf')).toBe(false);
  });

  it('rejects an oversized document before staging it', async () => {
    mockFiles.set('file:///cache/large.pdf', 10 * 1024 * 1024 + 1);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/large.pdf', name: 'large.pdf', mimeType: 'application/pdf' }] });
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'rejected', reason: 'size_too_large' });
    expect(mockFiles.size).toBe(0);
  });

  it('validates MIME even if a document provider ignores the requested filter', async () => {
    mockFiles.set('file:///cache/archive.zip', 100);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/archive.zip', name: 'archive.zip', mimeType: 'application/zip' }] });
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'rejected', reason: 'type_not_allowed' });
    expect([...mockFiles.keys()].some((uri) => uri.startsWith('file:///documents/'))).toBe(false);
    expect(mockFiles.size).toBe(0);
  });

  it('keeps cancellation quiet and exposes picker failures', async () => {
    mockPick.mockResolvedValueOnce({ canceled: true, assets: null });
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'cancelled' });
    mockPick.mockRejectedValueOnce(new Error('native failure'));
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'rejected', reason: 'selection_failed' });
  });
});
