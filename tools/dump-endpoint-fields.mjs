#!/usr/bin/env node
// Membaca GET /models dari endpoint di .env lalu melaporkan field, tipe, dan
// nilai yang benar-benar dikirim provider. Dipakai untuk menyamakan normalizer
// dengan kenyataan, bukan dengan asumsi.
//   node tools/dump-endpoint-fields.mjs
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

const res = await fetch(baseUrl.replace(/\/+$/, '') + '/models', {
  headers: { Accept: 'application/json', Authorization: 'Bearer ' + apiKey },
});
const body = await res.json();
const models = body.data ?? [];
console.log('status ' + String(res.status) + ' jumlah model ' + String(models.length));

const keys = new Set();
for (const model of models) {
  for (const key of Object.keys(model)) {
    keys.add(key);
  }
}

const types = {};
const missing = {};
for (const model of models) {
  for (const key of keys) {
    if (!(key in model)) {
      missing[key] = (missing[key] ?? 0) + 1;
      continue;
    }
    const value = model[key];
    const type =
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (types[key] !== type && !String(types[key] ?? '').split('|').includes(type)) {
      types[key] = types[key] ? types[key] + '|' + type : type;
    }
  }
}

console.log('field: ' + [...keys].sort().join(', '));
console.log('tipe: ' + JSON.stringify(types));
console.log('field yang kadang hilang: ' + JSON.stringify(missing));
console.log('input_modalities: ' + valuesOf(models, 'input_modalities'));
console.log('thinking: ' + valuesOf(models, 'thinking'));

function valuesOf(entries, key) {
  const found = new Set();
  for (const entry of entries) {
    for (const value of entry[key] ?? []) {
      found.add(String(value));
    }
  }
  return [...found].sort().join(', ');
}

function readEnvFile(path) {
  const entries = {};
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return entries;
  }
  for (const line of text.split(String.fromCharCode(10))) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match !== null) {
      entries[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return entries;
}
