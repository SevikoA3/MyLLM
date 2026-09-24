// Contract test normalizer terhadap bentuk record yang benar-benar dikirim
// AmanAI. Jalankan dengan: npm run test:fields
// Fixture diambil dari GET /v1/models pada 17 September 2026. Field yang hanya
// ada pada sebagian model ikut disertakan supaya fallback per field teruji.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { parseModelList } = await import('../../.tests-build/domain/model-list.js');

const GLM = {
  id: 'amanai/glm-5.3',
  object: 'model',
  owned_by: 'amanai',
  thinking: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
  context_length: 1_000_000,
  max_output: 128_000,
  vendor: 'zai',
  input_modalities: ['text'],
  description: 'Z.AI GLM-5.3',
  pricing_version: 'v3',
  pricing: {
    currency: 'amanai_credit',
    unit: 'token',
    billing: 'per_token_floor',
    prompt: '5.6',
    completion: '28',
    input_cache_read: '1.4',
    minimum_request: '1000',
  },
};

// Model dengan multimodal dan field penjualan yang tidak dimiliki model lain.
const FLASH = {
  id: 'amanai/glm-5.3-flash',
  object: 'model',
  owned_by: 'amanai',
  thinking: ['auto', 'none', 'low', 'medium', 'high'],
  context_length: 1_000_000,
  max_output: 128_000,
  vendor: 'zai',
  input_modalities: ['text', 'image', 'video'],
  pricing_version: 'v3',
  pricing: { currency: 'amanai_credit', prompt: '1.4', completion: '5.6' },
  list_pricing: { currency: 'amanai_credit', prompt: '2.8' },
  sale: { active: true, percent: 50 },
};

// Model termurah dengan campaign yang hanya muncul pada satu record.
const CAMPAIGN = {
  id: 'amanai/promo',
  object: 'model',
  owned_by: 'amanai',
  thinking: ['auto'],
  context_length: 32_000,
  max_output: 4_096,
  vendor: 'internal',
  input_modalities: ['text', 'file'],
  campaign: { name: 'launch', ends_at: '2026-10-01' },
};

function parse(records) {
  const result = parseModelList(JSON.stringify({ object: 'list', data: records }));
  assert.equal(result.ok, true);
  return result.models;
}

test('membaca context_length, max_output, thinking, dan modalities dari AmanAI', () => {
  const [model] = parse([GLM]);

  assert.equal(model.id, 'amanai/glm-5.3');
  assert.equal(model.contextWindow, 1_000_000);
  assert.equal(model.maxOutputTokens, 128_000);
  assert.deepEqual(model.reasoningEfforts, ['auto', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(model.inputModalities, ['text']);
  assert.equal(model.vendor, 'zai');
  assert.equal(model.ownedBy, 'amanai');
  assert.equal(model.description, 'Z.AI GLM-5.3');
});

test('mempertahankan urutan thinking dan multimodal dari provider', () => {
  const [, flash] = parse([GLM, FLASH]);

  assert.deepEqual(flash.reasoningEfforts, ['auto', 'none', 'low', 'medium', 'high']);
  assert.deepEqual(flash.inputModalities, ['text', 'image', 'video']);
});

test('field penjualan yang tidak dikenal tetap ada di raw tanpa mengubah metadata', () => {
  const [, flash] = parse([GLM, FLASH]);

  assert.deepEqual(flash.raw.list_pricing, { currency: 'amanai_credit', prompt: '2.8' });
  assert.deepEqual(flash.raw.sale, { active: true, percent: 50 });
  assert.equal(flash.contextWindow, 1_000_000);
});

test('field yang hanya ada pada satu record tidak menggagalkan record lain', () => {
  const models = parse([GLM, FLASH, CAMPAIGN]);

  assert.deepEqual(models[2].raw.campaign, { name: 'launch', ends_at: '2026-10-01' });
  assert.equal(models[0].raw.campaign, undefined);
  assert.deepEqual(models[2].inputModalities, ['text', 'file']);
});

test('modalitas di luar daftar yang didukung dibuang, bukan dipaksa masuk', () => {
  const [model] = parse([{ ...GLM, input_modalities: ['text', 'hologram', 'image'] }]);

  assert.deepEqual(model.inputModalities, ['text', 'image']);
});

test('record tanpa context_length tetap null, bukan angka tebakan', () => {
  const [model] = parse([{ id: 'tanpa-metadata', object: 'model', owned_by: 'system' }]);

  assert.equal(model.contextWindow, null);
  assert.equal(model.maxOutputTokens, null);
  assert.deepEqual(model.reasoningEfforts, []);
  assert.deepEqual(model.inputModalities, []);
});
