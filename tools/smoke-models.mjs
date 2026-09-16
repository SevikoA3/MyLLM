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
const { parseModelList } = await import('../.tests-build/domain/model-list.js');
const { snapshotFromModels, mergedFrom } = await import(
  '../.tests-build/services/persistence/catalog-store.js'
);

const profile = createEndpointProfile({ id: 'ep_smoke', name: 'AmanAI', baseUrl });
const result = await discoverModels(profile, apiKey);
if (!result.ok) {
  console.error('discovery gagal:', result.error.category, result.error.httpStatus ?? '-');
  process.exit(1);
}

const snapshot = snapshotFromModels(
  profile.id,
  profile.baseUrl,
  result.models,
  new Date().toISOString(),
);
const raw = await fetchRawModels(profile, apiKey);
const normalized = raw === null ? result.models : parseModelList(raw).models;
const runtime = mergedFrom(
  { schemaVersion: 1, models: [] },
  snapshotFromModels(profile.id, profile.baseUrl, normalized, new Date().toISOString()),
  { schemaVersion: 1, endpoints: {} },
  profile.id,
);

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

async function fetchRawModels(profile, apiKey) {
  const { joinEndpointPath, buildAuthHeaders } = await import('../.tests-build/domain/endpoint.js');
  try {
    const response = await fetch(joinEndpointPath(profile.baseUrl, profile.compat.modelListPath), {
      headers: { Accept: 'application/json', ...buildAuthHeaders(profile.authMode, apiKey) },
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}
