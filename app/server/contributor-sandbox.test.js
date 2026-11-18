// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
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
    const version = await fetch(sandbox.url + '/api/version?t=mobile-review');
    assert.equal(version.status, 200);
    assert.equal(version.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await version.json(), { version: 'dev', build: 'dev' });
    const billing = await (await fetch(sandbox.url + '/api/marketplace/billing')).json();
    assert.equal(billing.mode, 'off'); assert.equal(billing.manual_funding.enabled, false);
    const login = await fetch(sandbox.url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: sandbox.url }, body: JSON.stringify({ login: 'admin', password: sandbox.password }) });
    assert.equal(login.status, 200); assert.ok((await login.json()).token);
    const otherOrigin = await fetch(sandbox.url + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://untrusted.invalid' }, body: '{}' });
    assert.equal(otherOrigin.status, 403);
  } finally { await sandbox.close(); }
  await assert.rejects(access(sandbox.directory));
});

for (const signal of ['SIGINT', 'SIGTERM']) test(`sandbox command cleans up on terminal ${signal}`, { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../tools/contributor-sandbox.mjs', import.meta.url))], { cwd: fileURLToPath(new URL('../', import.meta.url)), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  let url;
  try {
    url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Sandbox timed out: ${output}`)), 25000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Sandbox exited ${code}: ${output}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/OpenPoker Play Money sandbox: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    assert.equal((await fetch(url)).status, 200);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    const [code] = await closed;
    clearTimeout(timer);
    assert.equal(code, 0, output);
  }
  const api = output.match(/Local API: (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
  const directory = output.match(/Temporary data: ([^\n]+)/)?.[1];
  assert.ok(api); assert.ok(directory);
  await assert.rejects(fetch(url));
  await assert.rejects(fetch(api));
  await assert.rejects(access(directory));
});
