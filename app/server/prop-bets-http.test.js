import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

const DAY = 24 * 3600 * 1000;
let srv;
let ana;
let bo;

before(async () => {
  srv = await startServer();
  ana = (await srv.post('/api/auth/guest', { body: {} })).data.token;
  bo = (await srv.post('/api/auth/guest', { body: {} })).data.token;
});
after(async () => { await srv.stop(); });

const challenge = (token, extra = {}) => srv.post('/api/propbets', {
  token,
  body: { type: 'bankroll', amount: 1_000, maxBettors: 2, goal: 50_000, startAt: Date.now() + 3_600_000, endAt: Date.now() + 3_600_000 + DAY, ...extra },
});

test('creating a prop bet needs an account', async () => {
  const res = await srv.post('/api/propbets', { body: { type: 'bankroll' } });
  assert.equal(res.status, 401);
});

test('a Bankroll Challenge is escrowed, listed and joinable', async () => {
  const before = await srv.balance(ana);
  const created = await challenge(ana);
  assert.equal(created.status, 200);
  assert.equal(await srv.balance(ana), before - 2_000);

  const listed = await srv.get('/api/propbets', { token: bo });
  assert.ok(listed.data.bets.some((b) => b.id === created.data.bet.id));
  assert.ok(listed.data.rules.elo, 'rules are published for the wizard');

  const boBefore = await srv.balance(bo);
  const joined = await srv.post(`/api/propbets/${created.data.bet.id}/join`, { token: bo });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.bet.bettors, 1);
  assert.equal(await srv.balance(bo), boBefore - 1_000);

  const detail = await srv.get(`/api/propbets/${created.data.bet.id}`);
  assert.deepEqual(detail.data.bet.entries.map((e) => e.side).sort(), ['bettor', 'creator']);
});

test('bad input is a clear 400, not a crash', async () => {
  const short = await challenge(ana, { endAt: Date.now() + 2 * 3_600_000 });
  assert.equal(short.status, 400);
  assert.match(short.data.error, /1 day/);
  const unknown = await srv.post('/api/propbets', { token: ana, body: { type: 'coinflip' } });
  assert.equal(unknown.status, 400);
  const lastLonger = await srv.post('/api/propbets', { token: ana, body: { type: 'last_longer', tournamentId: 'nope', amount: 500, maxBettors: 2 } });
  assert.equal(lastLonger.status, 400);
  assert.match(lastLonger.data.error, /Register/);
});

test('an unknown prop bet is a 404', async () => {
  assert.equal((await srv.get('/api/propbets/999999')).status, 404);
});
