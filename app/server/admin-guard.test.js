import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

// Production refuses to boot without a strong admin password; this one exists only in tests.
const PROD = { NODE_ENV: 'production', GGPOKER_TRUST_PROXY: '1', GGPOKER_ADMIN_PASSWORD: 'test-only-admin-password-0001' };
const PUBLIC_CLIENT = { 'x-forwarded-for': '203.0.113.5' };

// The admin router answers 401 for a request it lets through without a token, and 403 with
// "restricted" when the network guard refuses it.
const isRefusedByNetwork = (res) => res.status === 403 && /restricted/i.test(String(res.data?.error));

test('in production an unset admin allowlist refuses public clients', async () => {
  const srv = await startServer({ env: { ...PROD, GGPOKER_ADMIN_ALLOW: '' } });
  try {
    const res = await srv.get('/api/admin/stats', { headers: PUBLIC_CLIENT });
    assert.ok(isRefusedByNetwork(res), `expected a network refusal, got ${res.status}`);
  } finally { await srv.stop(); }
});

test('in production an unset admin allowlist still admits the operator on loopback', async () => {
  const srv = await startServer({ env: { ...PROD, GGPOKER_ADMIN_ALLOW: '' } });
  try {
    const res = await srv.get('/api/admin/stats');
    assert.equal(isRefusedByNetwork(res), false);
    assert.equal(res.status, 401);
  } finally { await srv.stop(); }
});

test('an explicit admin allowlist is still honoured in production', async () => {
  const srv = await startServer({ env: { ...PROD, GGPOKER_ADMIN_ALLOW: '203.0.113.0/24' } });
  try {
    const res = await srv.get('/api/admin/stats', { headers: PUBLIC_CLIENT });
    assert.equal(isRefusedByNetwork(res), false);
  } finally { await srv.stop(); }
});
