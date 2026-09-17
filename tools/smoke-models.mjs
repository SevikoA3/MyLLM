#!/usr/bin/env node
// Smoke test katalog: GET /models ke endpoint di .env, lalu jalankan merge produksi.
// Kredensial hanya dibaca dari environment dan tidak pernah dicetak.
//   npm run smoke:models
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env, ...readEnvFile(join(root, '.env')) };
const baseUrl = env.AMANAI_ENDPOINT;
const apiKey = env.AMANAI_KEY;

if (!baseUrl || !apiKey) {
  console.error('AMANAI_ENDPOINT dan AMANAI_KEY harus ada di .env atau environment.');
  process.exit(1);
}

const { discoverModels } = await import('../.tests-build/services/transport/models.js');
const { createEndpointProfile } = await import('../.tests-build/domain/endpoint.js');
const { createCatalogRepository } = await import(
  '../.tests-build/services/persistence/catalog-store.js'
);

const profile = createEndpointProfile({ id: 'ep_smoke', name: 'AmanAI', baseUrl });
const files = new Map();
const repository = createCatalogRepository({
  storage: {
    readText: async (name) => files.get(name) ?? null,
    writeText: async (name, text) => void files.set(name, text),
    copy: async (from, to) => {
      const value = files.get(from);
      if (value !== undefined) files.set(to, value);
    },
    exists: async (name) => files.has(name),
  },
  readDefaults: async () => ({ schemaVersion: 1, models: [] }),
  fetchModels: async ({ baseUrl: nextBaseUrl, modelListPath }) => {
    const discovered = await discoverModels(
      { ...profile, baseUrl: nextBaseUrl, compat: { ...profile.compat, modelListPath } },
      apiKey,
    );
    return discovered.ok
      ? { ok: true, models: discovered.models }
      : { ok: false, message: discovered.error.message };
  },
});
const result = await repository.refresh({
  endpointId: profile.id,
  baseUrl: profile.baseUrl,
  modelListPath: profile.compat.modelListPath,
});
if (!result.ok) {
  console.error('refresh gagal:', result.error.kind);
  process.exit(1);
}
const runtime = result.catalog;

console.log(`endpoint ${profile.baseUrl}`);
console.log(`model ditemukan: ${runtime.models.length}`);
for (const model of runtime.models.slice(0, 12)) {
  console.log(
    [
      model.id,
      'ctx=' + (model.contextWindow ?? 'unknown'),
      'out=' + (model.maxOutputTokens ?? 'unknown'),
      'efforts=' + (model.reasoningEfforts.length === 0 ? 'none' : model.reasoningEfforts.join('/')),
      'modalities=' + (model.inputModalities.join('+') || 'none'),
    ].join('  '),
  );
}

const withContext = runtime.models.filter((model) => model.contextWindow !== null).length;
console.log(`contextWindow terisi: ${withContext}/${runtime.models.length}`);

function readEnvFile(path) {
  const entries = {};
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return entries;
  }
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    entries[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return entries;
}
