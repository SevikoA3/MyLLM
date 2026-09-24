import { Directory, File, Paths } from 'expo-file-system';

import { fileCatalogStorage, deleteCatalogForEndpoint } from '../../../src/services/persistence/catalog-files';

// Map dipakai supaya FileSystem asli tidak disentuh, tetapi fileCatalogStorage
// tetap diuji dengan urutan panggilan nyata yang sama.
const mockFs = new Map<string, string>();
const mockCalls: string[] = [];
const mockPaths: string[] = [];

jest.mock('expo-file-system', () => {
  class MockDirectory {
    uri: string;

    constructor(...parts: unknown[]) {
      this.uri = joinPath(parts);
      mockPaths.push(this.uri);
      this.validatePath();
    }

    validatePath(): void {
      assertPath(this.uri);
    }

    get exists(): boolean {
      return true;
    }

    create(): void {
      mockCalls.push('createDirectory');
    }
  }

  class MockFile {
    uri: string;

    constructor(...parts: unknown[]) {
      this.uri = joinPath(parts);
      mockPaths.push(this.uri);
      this.validatePath();
    }

    validatePath(): void {
      assertPath(this.uri);
    }

    get exists(): boolean {
      return mockFs.has(this.uri);
    }

    textSync(): string {
      return mockFs.get(this.uri) ?? '';
    }

    async text(): Promise<string> {
      return this.textSync();
    }

    write(text: string): void {
      const previous = mockFs.get(this.uri);
      // File.create() hanya menyentuh berkas kosong, jadi nilai lama harus dipertahankan
      // agar urutan tulis temp lalu pindah tidak menghapus data yang sudah ada.
      mockFs.set(this.uri, text.length > 0 ? text : (previous ?? ''));
      mockCalls.push('write ' + this.uri);
    }

    create(): void {
      this.write('');
    }

    moveSync(target: MockFile): void {
      const value = mockFs.get(this.uri);
      if (value !== undefined) {
        mockFs.delete(this.uri);
        mockFs.set(target.uri, value);
      }
      mockCalls.push('move ' + this.uri + ' -> ' + target.uri);
    }

    copySync(target: MockFile): void {
      const value = mockFs.get(this.uri);
      if (value !== undefined) {
        mockFs.set(target.uri, value);
      }
      mockCalls.push('copy ' + this.uri + ' -> ' + target.uri);
    }

    delete(): void {
      mockFs.delete(this.uri);
      mockCalls.push('delete ' + this.uri);
    }
  }

  function uriOf(part: unknown): string {
    if (typeof part === 'string') {
      return part;
    }
    return String((part as { uri?: string }).uri ?? '');
  }

  // Meniru Paths.join: satu slash pemisah, trailing slash dibuang.
  function joinPath(parts: unknown[]): string {
    return parts
      .map(uriOf)
      .join('/')
      .replace(/([^:/])\/+/g, '$1/')
      .replace(/\/+$/, '');
  }

  // Meniru validatePath native: path harus absolut dan tidak boleh punya segmen kosong.
  function assertPath(uri: string): void {
    if (!uri.startsWith('file:///')) {
      throw new Error('invalid path: ' + uri);
    }
    // Segmen setelah file:/// diuji; tiga slash di awal bukan segmen kosong.
    const segments = uri.slice('file:///'.length).split('/');
    if (segments.some((segment) => segment.length === 0)) {
      throw new Error('invalid path: ' + uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      get document() {
        return new MockDirectory('file:///documents');
      },
    },
  };
});

describe('fileCatalogStorage', () => {
  beforeEach(() => {
    mockFs.clear();
    mockCalls.length = 0;
    mockPaths.length = 0;
  });

  it('mengembalikan null untuk berkas yang belum ada', async () => {
    expect(await fileCatalogStorage.readText('snapshot-ep_1.json')).toBeNull();
  });

  it('menulis berkas lewat temp lalu memindahkannya', async () => {
    await fileCatalogStorage.writeText('snapshot-ep_1.json', '{"a":1}');

    expect(await fileCatalogStorage.readText('snapshot-ep_1.json')).toBe('{"a":1}');
    expect(mockCalls.some((call) => call.startsWith('move '))).toBe(true);
    expect(mockFs.has('file:///documents/catalog/snapshot-ep_1.json')).toBe(true);
  });

  it('menyalin berkas yang ada dan mengabaikan sumber yang hilang', async () => {
    await fileCatalogStorage.writeText('snapshot-ep_1.json', 'lama');
    await fileCatalogStorage.copy('snapshot-ep_1.json', 'snapshot-ep_1.backup.json');

    expect(await fileCatalogStorage.readText('snapshot-ep_1.backup.json')).toBe('lama');
    await expect(
      fileCatalogStorage.copy('tidak-ada.json', 'target.json'),
    ).resolves.toBeUndefined();
  });

  it('menghapus semua catalog data milik satu endpoint', async () => {
    await fileCatalogStorage.writeText('snapshot-ep_1.json', '{}');
    await fileCatalogStorage.writeText('snapshot-ep_1.backup.json', '{}');
    await fileCatalogStorage.writeText('model-overrides.json', JSON.stringify({
      schemaVersion: 1,
      endpoints: {
        ep_1: { models: { one: { displayName: 'One' } } },
        ep_2: { models: { two: { displayName: 'Two' } } },
      },
    }));
    await fileCatalogStorage.writeText('history-models.json', JSON.stringify({
      schemaVersion: 1,
      endpoints: {
        ep_1: { one: { displayName: 'One' } },
        ep_2: { two: { displayName: 'Two' } },
      },
    }));

    await deleteCatalogForEndpoint('ep_1');

    expect(await fileCatalogStorage.readText('snapshot-ep_1.json')).toBeNull();
    expect(await fileCatalogStorage.readText('snapshot-ep_1.backup.json')).toBeNull();
    expect(await fileCatalogStorage.readText('model-overrides.json')).not.toContain('ep_1');
    expect(await fileCatalogStorage.readText('model-overrides.json')).toContain('ep_2');
    expect(await fileCatalogStorage.readText('history-models.json')).not.toContain('ep_1');
  });

  it('memakai constructor File dan Directory asli dari expo-file-system', async () => {
    expect(typeof File).toBe('function');
    expect(typeof Directory).toBe('function');
    expect(Paths.document.uri).toContain('documents');
  });
});
