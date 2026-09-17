#!/usr/bin/env node
// Smoke test billable: dua turn Responses API non-stream terhadap endpoint di .env.
// Prompt dan response tidak dicetak.
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

const { createEndpointProfile } = await import('../.tests-build/domain/endpoint.js');
const { discoverModels } = await import('../.tests-build/services/transport/models.js');
const { responsesClient } = await import('../.tests-build/services/transport/responses.js');

const profile = createEndpointProfile({ id: 'ep_smoke', name: 'AmanAI', baseUrl });
const discovered = await discoverModels(profile, apiKey);
if (!discovered.ok || discovered.models.length === 0) {
  console.error('model discovery gagal');
  process.exit(1);
}
const modelId = env.AMANAI_MODEL?.trim() || discovered.models[0].id;

const first = await responsesClient.send(profile, apiKey, {
  modelId,
  prompt: 'Balas hanya dengan kata OK.',
  previousResponseId: null,
  maxOutputTokens: 256,
});
if (!first.ok) {
  fail('turn 1', first.error);
}

const second = await responsesClient.send(profile, apiKey, {
  modelId,
  prompt: 'Balas hanya dengan kata LANJUT.',
  previousResponseId: first.response.id,
  maxOutputTokens: 256,
});
if (!second.ok) {
  fail('turn 2', second.error);
}

console.log('Responses non-stream: 2/2 turn berhasil');
console.log('previous_response_id: berhasil');
console.log('output text: tersedia pada kedua turn');

function fail(turn, error) {
  console.error(
    `${turn} gagal: category=${error.category} status=${error.httpStatus ?? '-'} code=${error.providerCode ?? '-'}`,
  );
  process.exit(1);
}

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
    if (match !== null) {
      entries[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return entries;
}
