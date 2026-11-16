import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

let srv;
before(async () => {
  srv = await startServer({ env: { GGPOKER_TRUST_PROXY: '1', GGPOKER_REGISTER_LIMIT_PER_HOUR: '2' } });
});
after(async () => { await srv.stop(); });

const guest = (ip) => srv.post('/api/auth/guest', { body: {}, headers: { 'x-forwarded-for': ip } });

test('guest sign-in creates a play-money account with a session', async () => {
  const res = await guest('10.9.0.1');
  assert.equal(res.status, 200);
  assert.ok(res.data.token, 'returns a session token');
  assert.match(res.data.user.nick, /^Guest\d{4,}$/);
  assert.ok(res.data.user.balance > 0, 'starts with play chips');
  const me = await srv.get('/api/me', { token: res.data.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.nick, res.data.user.nick);
});

test('two guests get distinct accounts', async () => {
  const a = await guest('10.9.0.2');
  const b = await guest('10.9.0.3');
  assert.notEqual(a.data.user.id, b.data.user.id);
  assert.notEqual(a.data.user.nick, b.data.user.nick);
});

test('guest accounts share the per-network account limit', async () => {
  assert.equal((await guest('10.9.0.4')).status, 200);
  assert.equal((await guest('10.9.0.4')).status, 200);
  assert.equal((await guest('10.9.0.4')).status, 429);
});
