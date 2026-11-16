// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { sandboxEnvironment, startSandbox } from '../tools/contributor-sandbox.mjs';

test('sandbox environment excludes inherited payment credentials and production data/config', () => {
  const env = sandboxEnvironment('/tmp/fresh-sandbox-data', 'temporary-password');
  assert.equal(env.GGPOKER_DATA, '/tmp/fresh-sandbox-data');
  assert.equal(env.GGPOKER_BIND, '127.0.0.1');
  for (const key of ['GGPOKER_USAGE_BILLING', 'GGPOKER_ORGANIZER_CHIPS', 'GGPOKER_MARKETPLACE_ENFORCEMENT', 'GGPOKER_NERVIXPAY_MANUAL_FUNDING']) assert.equal(env[key], 'off');
  assert.equal(env.GGPOKER_TRUST_PROXY, undefined); assert.equal(env.NERVIXPAY_API_KEY, undefined);
});

test('sandbox starts the real browser/server app on loopback and removes only its temporary data on close', async () => {
  const sandbox = await startSandbox();
  try {
    assert.equal(new URL(sandbox.url).hostname, '127.0.0.1');
    const page = await fetch(sandbox.url); assert.equal(page.status, 200);
    assert.match(await page.text(), /src\/main.tsx/);
    const billing = await (await fetch(sandbox.url + '/api/marketplace/billing')).json();
    assert.equal(billing.mode, 'off'); assert.equal(billing.manual_funding.enabled, false);
    const login = await fetch(sandbox.url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: sandbox.url }, body: JSON.stringify({ login: 'admin', password: sandbox.password }) });
    assert.equal(login.status, 200); assert.ok((await login.json()).token);
    const otherOrigin = await fetch(sandbox.url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://untrusted.invalid' }, body: '{}' });
    assert.equal(otherOrigin.status, 403);
  } finally { await sandbox.close(); }
  await assert.rejects(access(sandbox.directory));
});
