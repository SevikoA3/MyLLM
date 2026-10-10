import { stageAttachment } from '../../../src/services/attachments/files';
import { Platform } from 'react-native';

const mockFiles = new Map<string, number | undefined>();
const mockUnavailableProperties = new Set<string>();
const mockStatFailures = new Set<string>();
const mockCopyFailures = new Set<string>();
let mockPrivateStatFailure = false;
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
    get exists() { return !mockUnavailableProperties.has(this.uri) && mockFiles.has(this.uri); }
    get size() { return mockUnavailableProperties.has(this.uri) ? null : mockFiles.get(this.uri) ?? null; }
    info() {
      if (mockStatFailures.has(this.uri) || (mockPrivateStatFailure && this.uri.startsWith('file:///documents/attachments/'))) throw new Error('stat failure');
      return { exists: mockFiles.has(this.uri), size: mockFiles.get(this.uri) };
    }
    copy(target: { uri: string }) {
      mockFiles.set(target.uri, mockFiles.get(this.uri));
      if (mockCopyFailures.has(this.uri)) throw new Error('copy failure');
    }
    delete() { mockFiles.delete(this.uri); }
  },
  Paths: { document: 'file:///documents/', cache: { uri: 'file:///cache/' } },
}));

describe('stageAttachment', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockFiles.clear();
    mockUnavailableProperties.clear();
    mockStatFailures.clear();
    mockCopyFailures.clear();
    mockPrivateStatFailure = false;
    mockPick.mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['application/pdf', 'notes.pdf'], ['image/png', 'photo.png'],
  ] as const)('copies an Android %s picker grant before inspecting app-owned metadata', async (mimeType, name) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const uri = 'content://downloads/' + name;
    mockFiles.set(uri, 100);
    mockStatFailures.add(uri);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri, name, mimeType }] });
    const result = await stageAttachment([], [mimeType], async () => ({ getDocumentAsync: mockPick }));
    expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({ copyToCacheDirectory: false }));
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('The picker grant must be copied into private storage.');
    expect(result.attachment.byteSize).toBe(100);
    expect(result.attachment.uri).toMatch(/^file:\/\/\/documents\/attachments\//);
    expect(mockFiles.has(uri)).toBe(true);
  });

  it('removes a partial private copy after failure without deleting the selected document', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const uri = 'content://downloads/notes.pdf';
    mockFiles.set(uri, 100);
    mockCopyFailures.add(uri);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri, name: 'notes.pdf', mimeType: 'application/pdf' }] });
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({
      kind: 'rejected', reason: 'selection_failed', operation: 'save', detail: 'copy failure',
    });
    expect([...mockFiles.keys()]).toEqual([uri]);
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

  it('rejects an oversized document and removes its private copy', async () => {
    mockFiles.set('file:///cache/large.pdf', 10 * 1024 * 1024 + 1);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/large.pdf', name: 'large.pdf', mimeType: 'application/pdf' }] });
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'rejected', reason: 'size_too_large' });
    expect(mockFiles.size).toBe(0);
  });

  it('stages a file with readable stat metadata when native properties are unavailable', async () => {
    const uri = 'file:///cache/notes.pdf';
    mockFiles.set(uri, 100);
    mockUnavailableProperties.add(uri);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri, name: 'notes.pdf', mimeType: 'application/pdf' }] });
    const result = await stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }));
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('The PDF must be staged.');
    expect(result.attachment.byteSize).toBe(100);
    expect(mockFiles.get(result.attachment.uri)).toBe(100);
    expect(mockFiles.has(uri)).toBe(false);
  });

  it.each([
    { byteSize: undefined, reason: 'size_unknown' },
    { byteSize: 0, reason: 'size_too_large' },
    { byteSize: 10 * 1024 * 1024 + 1, reason: 'size_too_large' },
  ])('rejects actual size $byteSize even when picker metadata claims 100 bytes', async ({ byteSize, reason }) => {
    const uri = 'file:///cache/notes.pdf';
    mockFiles.set(uri, byteSize);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri, name: 'notes.pdf', mimeType: 'application/pdf', size: 100 }] });
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'rejected', reason });
    expect(mockFiles.size).toBe(0);
  });

  it('cleans the private copy and picker cache when staged metadata cannot be read', async () => {
    const uri = 'file:///cache/notes.pdf';
    mockFiles.set(uri, 100);
    mockPrivateStatFailure = true;
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri, name: 'notes.pdf', mimeType: 'application/pdf', size: 100 }] });
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'rejected', reason: 'selection_failed', operation: 'read', detail: 'stat failure' });
    expect(mockFiles.size).toBe(0);
  });

  it.each([
    { count: 10, byteSize: 100, reason: 'too_many' },
    { count: 8, byteSize: 10 * 1024 * 1024, reason: 'message_too_large' },
  ])('rejects a selection beyond the $reason limit', async ({ count, byteSize, reason }) => {
    const existing = Array.from({ length: count }, (_, index) => ({
      id: 'attachment_' + index, name: 'notes.pdf', mimeType: 'application/pdf' as const,
      byteSize, uri: 'file:///documents/attachments/' + index,
    }));
    mockFiles.set('file:///cache/notes.pdf', 100);
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/notes.pdf', name: 'notes.pdf', mimeType: 'application/pdf' }] });
    await expect(stageAttachment(existing, ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'rejected', reason });
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
    mockPick.mockRejectedValueOnce(new Error('native failure sk-secret1234'));
    await expect(stageAttachment([], ['application/pdf'], async () => ({ getDocumentAsync: mockPick }))).resolves.toEqual({ kind: 'rejected', reason: 'selection_failed', operation: 'select', detail: 'native failure [redacted]' });
  });
});
