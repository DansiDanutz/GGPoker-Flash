import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer, sleep } from './test-helpers.js';
import { handForViewer } from './hand-history.js';
import { isLocalHost, isLocalOrigin, resolveInside, createRateLimiter } from './security.js';
import { toInt, cleanNick, parseTableConfig } from './validate.js';

const TABLE = 'nlh-bronze-01';
const MIN_BUYIN = 2000;
let srv;
let player;
let admin;

before(async () => {
  srv = await startServer();
  player = await srv.login('DansiDanutz', 'ggpoker');
  admin = await srv.login('admin', 'admin123');
});
after(async () => { await srv.stop(); });

const lastTransactions = async (token) => (await srv.get('/api/cashier', { token })).data.transactions;

test('requests with a foreign Host header are refused (DNS rebinding)', async () => {
  // fetch() refuses to override Host, so send the raw request.
  const status = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: srv.port, path: '/api/lobby', headers: { host: 'evil.example.com' } },
      (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
  assert.equal(status, 403);
  assert.equal(isLocalHost('127.0.0.1:5198'), true);
  assert.equal(isLocalHost('localhost'), true);
  assert.equal(isLocalHost('127.0.0.1.evil.com'), false);
  assert.equal(isLocalOrigin('http://localhost:5199'), true);
  assert.equal(isLocalOrigin('https://evil.example.com'), false);
  assert.equal(isLocalOrigin(undefined), true);
});

test('responses carry hardening headers and never echo internal errors', async () => {
  const res = await srv.get('/api/lobby');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('static paths cannot escape the served directories', async () => {
  assert.equal(resolveInside('/srv/dist', '../dist-secret/x'), null);
  assert.equal(resolveInside('/srv/dist', '%2e%2e/etc/passwd'), null);
  assert.equal(resolveInside('/srv/dist', '%E0%A4%A'), null, 'malformed escapes are rejected, not thrown');
  assert.equal(resolveInside('/srv/dist', 'assets/a.js'), '/srv/dist/assets/a.js');
  const res = await srv.get('/assets/..%2f..%2fpackage.json');
  assert.equal(res.status, 404);
});

test('registration credits the opening balance exactly once and rejects duplicates', async () => {
  const body = { login: 'fresh_player', nick: 'Fresh Player', password: 'secret12' };
  const res = await srv.post('/api/auth/register', { body });
  assert.equal(res.status, 200);
  const tx = await lastTransactions(res.data.token);
  assert.equal(tx.length, 1);
  assert.equal(res.data.user.balance, tx[0].amount, 'balance equals the single welcome ledger entry');
  assert.equal(tx[0].balance_after, tx[0].amount);
  assert.equal((await srv.post('/api/auth/register', { body: { ...body, login: 'other_login' } })).status, 400, 'nickname is unique');
  assert.equal((await srv.post('/api/auth/register', { body: { login: 'imposter', nick: 'admin', password: 'secret12' } })).status, 400, 'cannot take an account ID as a nickname');
  assert.equal((await srv.post('/api/auth/register', { body: { login: 'weakpw', nick: 'Weak', password: '123' } })).status, 400);
  assert.equal((await srv.post('/api/me/nick', { token: res.data.token, body: { nick: 'DansiDanutz' } })).status, 400);
});

test('repeated failed logins are throttled', async () => {
  let status = 0;
  for (let i = 0; i < 11; i++) {
    status = (await srv.post('/api/auth/login', { body: { login: 'guest', password: 'wrong' } })).status;
  }
  assert.equal(status, 429);
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
  limiter.record('k', 0); limiter.record('k', 10);
  assert.equal(limiter.isBlocked('k', 20), true);
  assert.equal(limiter.isBlocked('k', 2000), false);
});

test('the Fish Buffet wheel pays at most once per day', async () => {
  const first = await srv.post('/api/rewards/spin', { token: player });
  assert.equal(first.status, 200);
  const second = await srv.post('/api/rewards/spin', { token: player });
  assert.equal(second.status, 400);
});

test('blackjack never sends the dealer hole card before the hand is over', async () => {
  const res = await srv.post('/api/games/blackjack', { token: player, body: { action: 'deal', bet: 100 } });
  assert.equal(res.status, 200);
  assert.equal(res.data.dealerHidden, undefined);
  assert.equal(res.data.dealer[1], '??');
  assert.ok(!JSON.stringify(res.data).includes(JSON.stringify(res.data.dealer[0]).repeat(2)));
  assert.equal((await srv.post('/api/games/blackjack', { token: player, body: { action: 'deal', bet: 100 } })).status, 400, 'cannot abandon a live hand');
  const done = await srv.post('/api/games/blackjack', { token: player, body: { action: 'stand' } });
  assert.equal(done.data.done, true);
  assert.equal(done.data.dealer.includes('??'), false);
});

test('casino bets with unknown types are rejected instead of silently losing', async () => {
  const before = await srv.balance(player);
  assert.equal((await srv.post('/api/games/roulette', { token: player, body: { bet: 100, kind: 'nonsense' } })).status, 400);
  assert.equal((await srv.post('/api/games/roulette', { token: player, body: { bet: 100, kind: 'number', value: 99 } })).status, 400);
  assert.equal((await srv.post('/api/games/tablegame', { token: player, body: { game: 'baccarat', bet: 100, pick: 'nobody' } })).status, 400);
  assert.equal((await srv.post('/api/games/propbet', { token: player, body: { stake: 100, market: '__proto__' } })).status, 400);
  assert.equal(await srv.balance(player), before);
  assert.equal((await srv.post('/api/games/roulette', { token: player, body: { bet: 100, kind: 'column2' } })).status, 200);
});

test('admin money actions reject non-numeric and overdraft amounts', async () => {
  const users = (await srv.get('/api/admin/users?q=guest', { token: admin })).data.users;
  const guest = users.find((u) => u.login === 'guest');
  const route = `/api/admin/users/${guest.id}`;
  assert.equal((await srv.post(route, { token: admin, body: { action: 'credit', amount: 'lots' } })).status, 400);
  assert.equal((await srv.post(route, { token: admin, body: { action: 'credit', amount: -1e11 } })).status, 400);
  assert.equal((await srv.post(route, { token: admin, body: { action: 'set', balance: 'NaN' } })).status, 400);
  assert.equal((await srv.post(route, { token: admin, body: { action: 'credit', amount: 500 } })).status, 200);
  assert.equal((await srv.post('/api/admin/tables', { token: admin, body: { name: 'Bad', seats: 40 } })).status, 400);
  assert.equal((await srv.post('/api/admin/tables', { token: admin, body: { name: 'Bad', sb: 500, bb: 100 } })).status, 400);
  assert.equal((await srv.post('/api/admin/tables', { token: admin, body: { name: 'Good', game: 'omaha', sb: 50, bb: 100, min_buyin: 2000, max_buyin: 10000, seats: 6 } })).status, 200);
});

test('validation helpers', () => {
  assert.equal(toInt('12.4'), 12);
  assert.equal(toInt('abc'), null);
  assert.equal(toInt(5, { min: 10 }), null);
  assert.equal(toInt(Infinity), null);
  assert.equal(cleanNick('  River   Rat '), 'River Rat');
  assert.equal(cleanNick('<script>'), null);
  assert.equal(cleanNick('a'), null);
  assert.equal(parseTableConfig({ game: 'bingo' }).ok, false);
  assert.equal(parseTableConfig({ min_buyin: 50, bb: 100, sb: 50 }).ok, false);
});

test('hand history only shows a player their own hands and cards that were shown', () => {
  const row = {
    id: 1, hand_no: 7, table_id: 't', table_name: 'T', game: 'holdem', board: 'As Kd 2c', pot: 500,
    players: JSON.stringify([
      { id: 1, nick: 'Hero', cards: ['Ah', 'Ad'], folded: false, showed: true },
      { id: 2, nick: 'Folder', cards: ['7c', '2d'], folded: true, showed: false },
      { id: 'bot-1', nick: 'Shower', cards: ['Kh', 'Ks'], folded: false, showed: true },
    ]),
    result: JSON.stringify({ reason: 'showdown', hands: [{ nick: 'Hero' }, { nick: 'Shower' }] }),
    actions: '[]', created_at: 'now',
  };
  const mine = handForViewer(row, 1);
  assert.equal(mine.heroCards, 'Ah Ad');
  assert.deepEqual(mine.players[1].cards, [], 'a folded hand stays hidden');
  assert.deepEqual(mine.players[2].cards, ['Kh', 'Ks']);
  const theirs = handForViewer(row, 2);
  assert.equal(theirs.heroCards, '7c 2d');
  assert.deepEqual(theirs.players[0].cards, ['Ah', 'Ad'], 'shown at showdown');
  assert.equal(handForViewer(row, 99), null, 'spectators and strangers get nothing');
  const legacy = handForViewer({ ...row, players: row.players.replaceAll(/,"showed":(true|false)/g, '') }, 1);
  assert.deepEqual(legacy.players[1].cards, []);
  assert.deepEqual(legacy.players[2].cards, ['Kh', 'Ks']);
});

test('a dropped connection keeps the seat; leaving cashes out exactly once', async () => {
  const start = await srv.balance(player);
  const first = srv.socket(player);
  await first.opened;
  first.send({ type: 'join_table', tableId: TABLE, buyin: MIN_BUYIN });
  const joined = await first.nextType('joined');
  assert.equal(typeof joined.seat, 'number');
  assert.equal(await srv.balance(player), start - MIN_BUYIN);

  await first.close();
  await sleep(300);
  assert.equal(await srv.balance(player), start - MIN_BUYIN, 'no cash-out while the seat is held');

  const second = srv.socket(player);
  await second.opened;
  second.send({ type: 'join_table', tableId: TABLE, buyin: MIN_BUYIN });
  assert.equal((await second.nextType('joined')).seat, joined.seat, 'reconnects to the same seat');
  assert.equal(await srv.balance(player), start - MIN_BUYIN, 'no second buy-in');

  // A second window on the same table must not cash the player out when it closes.
  const popout = srv.socket(player);
  await popout.opened;
  popout.send({ type: 'join_table', tableId: TABLE, buyin: MIN_BUYIN });
  await popout.nextType('joined');
  popout.send({ type: 'leave_table', tableId: TABLE });
  await sleep(200);
  assert.equal((await lastTransactions(player)).filter((t) => String(t.reference).startsWith('out:')).length, 0);

  second.send({ type: 'leave_table', tableId: TABLE });
  await sleep(300);
  const outs = (await lastTransactions(player)).filter((t) => String(t.reference).startsWith('out:'));
  assert.equal(outs.length, 1);
  assert.equal(await srv.balance(player), start - MIN_BUYIN + outs[0].amount);
  await second.close();
  await popout.close();
});

test('a human takes a seat from a bot instead of queueing behind bots', async () => {
  const tokens = [];
  for (const n of [1, 2, 3, 4]) {
    const res = await srv.post('/api/auth/register', { body: { login: `seat_user${n}`, nick: `SeatUser${n}`, password: 'secret12' } });
    tokens.push(res.data.token);
  }
  const sockets = [];
  for (const token of tokens) {
    const s = srv.socket(token);
    await s.opened;
    s.send({ type: 'join_table', tableId: 'nlh-bronze-02', buyin: MIN_BUYIN });
    const joined = await s.nextType('joined');
    assert.equal(typeof joined.seat, 'number', 'every human is seated, none is wait-listed');
    sockets.push(s);
  }
  for (const s of sockets) { s.send({ type: 'leave_table', tableId: 'nlh-bronze-02' }); }
  await sleep(200);
  for (const s of sockets) await s.close();
});

test('a tournament entry buys one stack: leaving consumes it', async () => {
  const list = (await srv.get('/api/tournaments', { token: player })).data.tournaments;
  const freeroll = list.find((t) => t.buyin === 0);
  assert.equal((await srv.post(`/api/tournaments/${freeroll.id}/play`, { token: player })).status, 400, 'must register even for a freeroll');
  assert.equal((await srv.post(`/api/tournaments/${freeroll.id}/register`, { token: player })).status, 200);
  const play = await srv.post(`/api/tournaments/${freeroll.id}/play`, { token: player });
  assert.equal(play.status, 200);

  // A stranger cannot grab a free stack by joining the tournament table directly.
  const stranger = (await srv.post('/api/auth/register', { body: { login: 'gatecrasher', nick: 'Gatecrasher', password: 'secret12' } })).data.token;
  const crash = srv.socket(stranger);
  await crash.opened;
  crash.send({ type: 'join_table', tableId: play.data.tableId });
  assert.equal((await crash.nextType('joined')).seat, null);
  await crash.close();

  const s = srv.socket(player);
  await s.opened;
  s.send({ type: 'join_table', tableId: play.data.tableId });
  assert.equal(typeof (await s.nextType('joined')).seat, 'number');
  s.send({ type: 'leave_table', tableId: play.data.tableId });
  await sleep(200);
  await s.close();
  assert.equal((await srv.post(`/api/tournaments/${freeroll.id}/play`, { token: player })).status, 400, 'the entry was used up');
});

test('the seat is cashed out after the disconnect grace period', async () => {
  const quick = await startServer({ env: { GGPOKER_DISCONNECT_GRACE_MS: '200' } });
  try {
    const token = await quick.login('DansiDanutz', 'ggpoker');
    const start = await quick.balance(token);
    const s = quick.socket(token);
    await s.opened;
    s.send({ type: 'join_table', tableId: TABLE, buyin: MIN_BUYIN });
    await s.nextType('joined');
    await s.close();
    await sleep(1200);
    const tx = (await quick.get('/api/cashier', { token })).data.transactions;
    const out = tx.find((t) => String(t.reference).startsWith('out:'));
    assert.ok(out, 'cash-out was written');
    assert.equal(await quick.balance(token), start - MIN_BUYIN + out.amount);
  } finally { await quick.stop(); }
});

test('a clean shutdown settles seats at their real stack, not a buy-in refund', async () => {
  const first = await startServer();
  const token = await first.login('DansiDanutz', 'ggpoker');
  const s = first.socket(token);
  await s.opened;
  s.send({ type: 'join_table', tableId: TABLE, buyin: MIN_BUYIN });
  await s.nextType('joined');
  await first.stop('SIGTERM');

  const second = await startServer({ dataDir: first.dataDir });
  try {
    const token2 = await second.login('DansiDanutz', 'ggpoker');
    const tx = (await second.get('/api/cashier', { token: token2 })).data.transactions;
    assert.equal(tx.filter((t) => String(t.reference).startsWith('out:')).length, 1);
    assert.equal(tx.filter((t) => t.kind === 'buyin_refund').length, 0);
  } finally { await second.stop(); }
});
