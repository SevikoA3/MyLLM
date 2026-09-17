// Kompilasi modul domain dan transport ke ESM agar contract test Node dapat
// memuat kode produksi yang sama dengan aplikasi.
import { execFileSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';

const OUT = '.tests-build';
// Modul yang dipakai contract test Node: transport discovery dan orkestrasi onboarding.
const ENTRIES = [
  'src/services/transport/models.ts',
  'src/services/transport/responses.ts',
  'src/services/persistence/conversation-store.ts',
  'src/features/setup/onboarding.ts',
  // Fixture model memakai normalizer produksi supaya test tidak menyalin mapping field.
  'src/domain/model-list.ts',
  // Seed katalog dipakai jalur onboarding, jadi ikut dikompilasi.
  'src/services/persistence/catalog-seed.ts',
];

// expo-file-system adalah native module. Contract test Node menimpa modul hasil
// kompilasi dengan stub supaya orkestrasi onboarding tetap dapat diuji.
const STUBS = {
  'expo-fetch.js': 'export const fetch = globalThis.fetch;\n',
  'services/persistence/catalog-files.js': [
    'export const fileCatalogStorage = {',
    '  readText: async () => null,',
    '  writeText: async () => {},',
    '  copy: async () => {},',
    '  exists: async () => false,',
    '};',
    'export async function readBundledDefaults() {',
    '  return { schemaVersion: 1, models: [] };',
    '}',
  ].join('\n'),
};

// Modul domain memakai penanda __DEV__ milik React Native.
const GLOBALS = '.tests-build/globals.d.ts';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(GLOBALS, 'declare const __DEV__: boolean;\n');

execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'tsc',
    '--ignoreConfig',
    ...ENTRIES,
    GLOBALS,
    '--outDir',
    OUT,
    '--module',
    'esnext',
    '--moduleResolution',
    'bundler',
    '--target',
    'es2022',
    '--skipLibCheck',
    '--rootDir',
    'src',
  ],
  { stdio: 'inherit' },
);

// Node ESM membutuhkan ekstensi eksplisit, sedangkan TypeScript mengeluarkan
// import tanpa ekstensi.
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

for (const file of walk(OUT).filter((path) => path.endsWith('.js'))) {
  const patched = readFileSync(file, 'utf8')
    // expo/fetch memakai native module pada aplikasi. Contract test Node memakai
    // fetch bawaan dengan kontrak ReadableStream yang sama.
    .replace("from 'expo/fetch'", "from '../../expo-fetch.js'")
    .replace(
      /(from ')(\.\.?\/[^']*?)(')/g,
      (match, start, specifier, end) =>
        specifier.endsWith('.js') ? match : start + specifier + '.js' + end,
    )
    // Penanda development React Native diganti agar modul dapat dimuat Node.
    .replace(/__DEV__/g, 'true');
  writeFileSync(join(dirname(file), basename(file)), patched);
}

writeFileSync(join(OUT, 'package.json'), JSON.stringify({ type: 'module' }, null, 2));
for (const [relative, content] of Object.entries(STUBS)) {
  writeFileSync(join(OUT, relative), content);
}
unlinkSync(GLOBALS);
if (!existsSync(join(OUT, 'services', 'transport', 'models.js'))) {
  throw new Error('kompilasi transport gagal');
}
if (!existsSync(join(OUT, 'services', 'transport', 'responses.js'))) {
  throw new Error('kompilasi Responses client gagal');
}
if (!existsSync(join(OUT, 'services', 'persistence', 'conversation-store.js'))) {
  throw new Error('kompilasi conversation repository gagal');
}
console.log('tests-build siap');
