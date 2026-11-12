import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, sleep } from './test-helpers.js';

// A spectator may look, never touch: watching must not seat anyone, seed bots,
// start a hand or change table options, and live hole cards stay hidden.

const PUBLIC_TABLE = 'nlh-bronze-01';
let srv;
let host;
let watcher;
let admin;

before(async () => {
  srv = await startServer();
  host = (await srv.post('/api/auth/register', { body: { login: 'spect_host', nick: 'Spect Host', password: 'secret12' } })).data.token;
  watcher = (await srv.post('/api/auth/register', { body: { login: 'spect_watcher', nick: 'Spect Watcher', password: 'secret12' } })).data.token;
  admin = await srv.login('admin', 'admin123');
});
after(async () => { await srv.stop(); });

async function hostTable(body = {}) {
  const res = await srv.post('/api/tables/host', {
    token: host,
    body: { name: 'Quiet Table', sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, seats: 6, ...body },
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.id;
}

async function watch(tableId) {
  const ws = srv.socket(watcher);
  await ws.opened;
  ws.send({ type: 'join_table', tableId, observe: true });
  const joined = await ws.nextType('joined');
  return { ws, joined };
}

test('watching an empty table neither seats the watcher nor seeds bots', async () => {
  const tableId = await hostTable();
  const { ws, joined } = await watch(tableId);
  assert.equal(joined.observe, true);
  assert.equal(joined.seat, null);
  const state = await ws.nextType('state');
  assert.equal(state.state.players.filter((p) => !p.empty).length, 0, 'watching must not fill the table');
  assert.equal(state.state.street, 'idle', 'watching must not start a hand');
  await ws.close();
});

test('a live hand hides hole cards from a watcher and refuses their action', async () => {
  const played = srv.socket(host);
  await played.opened;
  played.send({ type: 'join_table', tableId: PUBLIC_TABLE, buyin: 4000 });
  await played.nextType('joined');
  // Let the table deal the first hand.
  const dealt = await played.next((m) => m.type === 'state' && m.state.street === 'preflop', 6000);

  const { ws } = await watch(PUBLIC_TABLE);
  const state = await ws.nextType('state');
  const hidden = state.state.players.filter((p) => p.inHand && !p.folded && !p.reveal);
  assert.ok(hidden.length > 0, 'the watched hand has live players');
  for (const p of hidden) {
    assert.ok(p.cards.length > 0, `${p.nick} cards are represented`);
    assert.ok(p.cards.every((c) => c === '??'), `${p.nick} hole cards stay hidden`);
  }
  assert.equal(state.state.players.some((p) => p.isMe), false, 'the watcher holds no seat');

  ws.send({ type: 'action', tableId: PUBLIC_TABLE, action: 'fold', amount: 0 });
  const error = await ws.nextType('error', 3000);
  assert.match(error.error, /seat|turn|not/i);
  await ws.close();
  await played.close();
  assert.ok(dealt.state.handNo >= 1);
});

test('a watcher cannot change table-wide options', async () => {
  const tableId = await hostTable({ name: 'No Touch Table' });
  const { ws, joined } = await watch(tableId);
  assert.equal(joined.observe, true);

  ws.send({ type: 'option', tableId, straddle: true, runItTwice: true });
  await sleep(700);

  // Ask a fresh socket so the answer cannot be a snapshot queued before the send.
  const probe = await watch(tableId);
  const state = await probe.ws.nextType('state');
  assert.equal(state.state.straddle, false, 'a watcher cannot turn the straddle on');
  assert.equal(state.state.runItTwice, false, 'a watcher cannot turn run-it-twice on');
  await probe.ws.close();
  await ws.close();
});

test('the tournament watch endpoint is unknown until the event is running', async () => {
  const id = 'spectate-tourney';
  const created = await srv.post('/api/admin/tournaments', {
    token: admin,
    body: {
      id, name: 'Spectate Cup', buyin: 0, fee: 0, gtd: 0,
      start_at: new Date(Date.now() + 3600_000).toISOString(),
      status: 'registering', max_players: 100, starting_stack: 10000, blind_speed: 10, late_reg: 90,
    },
  });
  assert.equal(created.status, 200);
  const before = await srv.get(`/api/tournaments/${id}/watch`, { token: watcher });
  assert.equal(before.status, 404);

  // Eight entrants → two flights, exactly as the live seating test builds them.
  for (let i = 1; i <= 8; i += 1) {
    const reg = await srv.post('/api/auth/register', { body: { login: `spect_player_${i}`, nick: `Spect ${i}`, password: 'secret12' } });
    await srv.post(`/api/tournaments/${id}/register`, { token: reg.data.token });
    await srv.post(`/api/tournaments/${id}/play`, { token: reg.data.token });
  }
  const watchInfo = await srv.get(`/api/tournaments/${id}/watch`, { token: watcher });
  assert.equal(watchInfo.status, 200, JSON.stringify(watchInfo.data));
  assert.ok(watchInfo.data.tableId.startsWith(`tourney-${id}`));
  assert.ok(watchInfo.data.playersLeft >= 8);
  assert.ok(watchInfo.data.tables >= 2);

  // Watching the busiest flight changes nothing in the field.
  const { ws, joined } = await watch(watchInfo.data.tableId);
  assert.equal(joined.observe, true);
  const state = await ws.nextType('state');
  assert.equal(state.state.tournament.id, id, 'a watcher can follow the field after a table break');
  // Bots may bust between the two calls; the watcher must never add a player.
  assert.ok(
    state.state.tournament.playersLeft <= watchInfo.data.playersLeft,
    `field grew from ${watchInfo.data.playersLeft} to ${state.state.tournament.playersLeft} when a watcher joined`,
  );
  assert.equal(state.state.players.some((p) => p.isMe), false, 'the watcher holds no seat');
  await ws.close();
});
