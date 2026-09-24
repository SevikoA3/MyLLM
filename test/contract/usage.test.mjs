#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

const { createEndpointProfile } = await import('../../.tests-build/domain/endpoint.js');
const { fetchAccountUsage, usageUrl } = await import('../../.tests-build/services/transport/usage.js');

const port = 4300 + Math.floor(Math.random() * 200);
const child = spawn(process.execPath, ['tools/fake-oai-server.mjs'], {
  env: { ...process.env, FAKE_PORT: String(port), FAKE_API_KEY: 'fake-key' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  child.stdout.on('data', (chunk) => {
    if (String(chunk).includes('fake-oai-server listening')) resolve();
  });
  child.once('error', reject);
  child.once('exit', (code) => reject(new Error(`fake server exited ${String(code)}`)));
});
process.on('exit', () => child.kill());

const base = createEndpointProfile({
  id: 'ep_usage',
  name: 'AmanAI',
  baseUrl: `http://127.0.0.1:${String(port)}/v1`,
  credentialRef: 'cred_usage',
});

test('usage request requires a documented path and maps provider data', async () => {
  assert.equal(usageUrl(base), null);
  const unsupported = await fetchAccountUsage(base, 'fake-key');
  assert.equal(unsupported.ok, false);

  const profile = { ...base, compat: { ...base.compat, usagePath: '/usage' } };
  const result = await fetchAccountUsage(profile, 'fake-key');
  assert.equal(result.ok, true);
  assert.equal(result.usage.balance, 42.5);
  assert.equal(result.usage.currency, 'amanai_credit');
});

test.after(() => child.kill());
