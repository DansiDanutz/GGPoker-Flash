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

test('in production an unset admin allowlist refuses loopback without operator TLS', async () => {
  const srv = await startServer({ env: { ...PROD, GGPOKER_ADMIN_ALLOW: '' } });
  try {
    const res = await srv.get('/api/admin/stats');
    assert.ok(isRefusedByNetwork(res));
  } finally { await srv.stop(); }
});

test('an IP allowlist alone cannot open production admin ingress', async () => {
  const srv = await startServer({ env: { ...PROD, GGPOKER_TRUSTED_PROXY_IPS: '127.0.0.1', GGPOKER_ADMIN_ALLOW: '203.0.113.0/24' } });
  try {
    const res = await srv.get('/api/admin/stats', { headers: PUBLIC_CLIENT });
    assert.ok(isRefusedByNetwork(res));
  } finally { await srv.stop(); }
});

test('a development IP allowlist needs a valid client beyond its trusted hops', async () => {
  const srv = await startServer({ env: { ...PROD, NODE_ENV:'development', GGPOKER_TRUSTED_PROXY_IPS: '127.0.0.1,192.0.2.8', GGPOKER_ADMIN_ALLOW: '203.0.113.5' } });
  try {
    for (const [chain, status] of [[null, 403], ['invalid, 192.0.2.8', 403], ['192.0.2.8', 403],
      ['203.0.113.5, 198.51.100.1, 192.0.2.8', 403], ['203.0.113.5, 192.0.2.8', 401]]) {
      const res = await srv.get('/api/admin/stats', { headers: chain ? { 'x-forwarded-for': chain } : {} });
      assert.equal(res.status, status);
    }
  } finally { await srv.stop(); }
});
