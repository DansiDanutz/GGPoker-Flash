import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';
import { createRateLimiter } from './security.js';

// The server sits behind a proxy that sets X-Forwarded-For, so each header value is a distinct client.
let srv;
before(async () => {
  srv = await startServer({
    env: {
      GGPOKER_TRUST_PROXY: '1',
      GGPOKER_REGISTER_LIMIT_PER_HOUR: '3',
      GGPOKER_LOGIN_IP_LIMIT: '4',
    },
  });
});
after(async () => { await srv.stop(); });

const fromIp = (ip) => ({ 'x-forwarded-for': ip });
const register = (login, ip) => srv.post('/api/auth/register', {
  body: { login, nick: `Nick ${login}`, password: 'secret12' },
  headers: fromIp(ip),
});
const badLogin = (login, ip) => srv.post('/api/auth/login', {
  body: { login, password: 'wrong-password' },
  headers: fromIp(ip),
});

test('one IP can create only the configured number of accounts per hour', async () => {
  for (let i = 0; i < 3; i++) {
    assert.equal((await register(`flood_${i}`, '203.0.113.10')).status, 200);
  }
  const blocked = await register('flood_3', '203.0.113.10');
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /Too many new accounts/);
});

test('the sign-up limit is per IP, so a second IP can still register', async () => {
  assert.equal((await register('second_ip_user', '203.0.113.20')).status, 200);
});

test('rejected sign-ups do not use up the allowance', async () => {
  for (let i = 0; i < 5; i++) {
    const res = await srv.post('/api/auth/register', {
      body: { login: 'x', nick: 'x', password: '1' },
      headers: fromIp('203.0.113.30'),
    });
    assert.equal(res.status, 400);
  }
  assert.equal((await register('after_typos', '203.0.113.30')).status, 200);
});

test('failed logins from one IP are limited across different accounts', async () => {
  for (let i = 0; i < 4; i++) {
    assert.equal((await badLogin(`spray_target_${i}`, '198.51.100.7')).status, 400);
  }
  const blocked = await badLogin('spray_target_9', '198.51.100.7');
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /Too many failed sign-in attempts from your network/);
});

test('a successful login does not clear the per-IP failure count', async () => {
  const ip = '198.51.100.8';
  assert.equal((await register('spray_owner', '203.0.113.40')).status, 200);
  for (let i = 0; i < 3; i++) await badLogin(`victim_${i}`, ip);
  const ok = await srv.post('/api/auth/login', { body: { login: 'spray_owner', password: 'secret12' }, headers: fromIp(ip) });
  assert.equal(ok.status, 200);
  await badLogin('victim_3', ip);
  assert.equal((await badLogin('victim_4', ip)).status, 429);
});

test('another IP can still sign in while one IP is blocked', async () => {
  assert.equal((await badLogin('someone', '198.51.100.99')).status, 400);
});

test('the limiter forgets idle keys so its memory stays bounded', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3 });
  for (let i = 0; i < 3; i++) limiter.record(`old_${i}`, 0);
  limiter.record('fresh', 5000);
  assert.equal(limiter.size(), 1, 'expired keys are swept once the key cap is reached');
  assert.equal(limiter.isBlocked('fresh', 5001), true);
});

test('a concurrent burst from one IP cannot exceed the sign-up limit', async () => {
  const ip = '203.0.113.50';
  const burst = await Promise.all(Array.from({ length: 8 }, (_, i) => register(`burst_${i}`, ip)));
  const created = burst.filter((res) => res.status === 200).length;
  assert.equal(created, 3, `created ${created} accounts`);
  assert.ok(burst.every((res) => res.status === 200 || res.status === 429));
});

test('the limiter never holds more than maxKeys keys, even when all are active', () => {
  const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 3 });
  for (let i = 0; i < 10; i++) limiter.record(`live_${i}`, 1000 + i);
  assert.equal(limiter.size(), 3);
  assert.equal(limiter.isBlocked('live_9', 1010), false, 'the newest key is kept');
});
