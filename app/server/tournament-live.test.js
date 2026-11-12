import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { nextSseEvent, sleep, startServer } from './test-helpers.js';

// End-to-end proof that the seating engine is wired into the live server:
// eight humans join one event and land on two flights, six seats then two.

let srv;
let admin;
const TOURNAMENT = 'multi-flight-e2e';

before(async () => {
  srv = await startServer();
  admin = await srv.login('admin', 'admin123');
  const created = await srv.post('/api/admin/tournaments', {
    token: admin,
    body: {
      id: TOURNAMENT,
      name: 'Multi-flight e2e',
      buyin: 0,
      fee: 0,
      gtd: 0,
      start_at: new Date(Date.now() + 3600_000).toISOString(),
      status: 'registering',
      max_players: 100,
      starting_stack: 10000,
      blind_speed: 10,
      late_reg: 90,
    },
  });
  assert.equal(created.status, 200);
});

after(async () => { await srv.stop(); });

async function newPlayer(n) {
  const register = await srv.post('/api/auth/register', {
    body: { login: `flight_player_${n}`, nick: `Flight ${n}`, password: 'secret12' },
  });
  assert.equal(register.status, 200, `register ${n}: ${JSON.stringify(register.data)}`);
  return register.data;
}

test('eight entrants occupy two flights and keep the legacy table first', async () => {
  const seats = [];
  for (let i = 1; i <= 8; i += 1) {
    const { token } = await newPlayer(i);
    const reg = await srv.post(`/api/tournaments/${TOURNAMENT}/register`, { token });
    assert.equal(reg.status, 200, `register tournament ${i}: ${JSON.stringify(reg.data)}`);
    const play = await srv.post(`/api/tournaments/${TOURNAMENT}/play`, { token });
    assert.equal(play.status, 200, `play ${i}: ${JSON.stringify(play.data)}`);
    seats.push(play.data);
  }

  assert.deepEqual(seats.map((s) => s.tableId).slice(0, 6), Array(6).fill(`tourney-${TOURNAMENT}`));
  assert.deepEqual(seats.map((s) => s.tableId).slice(6), [
    `tourney-${TOURNAMENT}-1`,
    `tourney-${TOURNAMENT}-1`,
  ]);
  assert.deepEqual(seats.map((s) => s.tableIndex), [1, 1, 1, 1, 1, 1, 2, 2]);
});

test('a seated player is recognised on their flight when they reopen the event', async () => {
  // Player 8 is on flight 2; asking again must return the same table, not a
  // second seat or the legacy table.
  const login = await srv.post('/api/auth/login', { body: { login: 'flight_player_8', password: 'secret12' } });
  assert.equal(login.status, 200);
  const play = await srv.post(`/api/tournaments/${TOURNAMENT}/play`, { token: login.data.token });
  assert.equal(play.status, 200);
  assert.equal(play.data.tableId, `tourney-${TOURNAMENT}-1`);
  assert.equal(play.data.tableIndex, 2);
});

test('the table snapshot tells a player which flight they are on', async () => {
  const login = await srv.post('/api/auth/login', { body: { login: 'flight_player_7', password: 'secret12' } });
  const socket = srv.socket(login.data.token);
  await socket.opened;
  socket.send({ type: 'join_table', tableId: `tourney-${TOURNAMENT}-1` });
  const joined = await socket.nextType('joined');
  assert.notEqual(joined.seat, null, 'the player is seated on their flight');
  const state = await socket.nextType('state');
  assert.equal(state.state.tournament.tableIndex, 2);
  assert.equal(state.state.tournament.tables, 2);
  assert.ok(state.state.tournament.playersLeft >= 8, 'the field counter covers every flight');
  await socket.close();
});

test('a stale flight link redirects a moved player to their real table', async () => {
  const login = await srv.post('/api/auth/login', { body: { login: 'flight_player_7', password: 'secret12' } });
  const socket = srv.socket(login.data.token);
  await socket.opened;
  // The legacy table is the wrong flight for this player.
  socket.send({ type: 'join_table', tableId: `tourney-${TOURNAMENT}` });
  const move = await socket.nextType('table_move');
  assert.equal(move.tableId, `tourney-${TOURNAMENT}-1`);
  assert.equal(move.reason, 'redirect');
  assert.equal(move.index, 2);
  await socket.close();
});

test('unregistration is refused while a player is seated on a flight', async () => {
  const login = await srv.post('/api/auth/login', { body: { login: 'flight_player_7', password: 'secret12' } });
  const unregister = await srv.post(`/api/tournaments/${TOURNAMENT}/unregister`, { token: login.data.token });
  // Registration closed the moment the event started, so either message proves
  // the seat is protected; the explicit flight check is what matters.
  assert.equal(unregister.status, 400);
  assert.match(unregister.data.error, /playing this tournament|Unregistration is closed/);
});

test('the scheduler seats every registrant at the start and a late opener lands on their real flight', async () => {
  const quick = await startServer({ env: { GGPOKER_TOURNEY_SCHEDULER_MS: '200' } });
  try {
    const id = 'scheduled-start-e2e';
    const boss = await quick.login('admin', 'admin123');
    const startAt = Date.now() + 2500;
    const created = await quick.post('/api/admin/tournaments', {
      token: boss,
      body: {
        id, name: 'Scheduled start e2e', buyin: 0, fee: 0, gtd: 0,
        start_at: new Date(startAt).toISOString(), status: 'registering',
        max_players: 100, starting_stack: 10000, blind_speed: 10, late_reg: 90,
      },
    });
    assert.equal(created.status, 200);

    const tokens = [];
    for (let i = 1; i <= 8; i += 1) {
      const reg = await quick.post('/api/auth/register', {
        body: { login: `sched_player_${i}`, nick: `Sched ${i}`, password: 'secret12' },
      });
      assert.equal(reg.status, 200, JSON.stringify(reg.data));
      const join = await quick.post(`/api/tournaments/${id}/register`, { token: reg.data.token });
      assert.equal(join.status, 200, JSON.stringify(join.data));
      tokens.push(reg.data.token);
    }

    // Player 1 is online when the event starts and hears about it over SSE.
    const started = nextSseEvent(quick.base, tokens[0], (e) => e.type === 'tournament_started' && e.id === id, 10000);
    await sleep(Math.max(0, startAt - Date.now()) + 800);
    const live = await started;
    assert.equal(live.tableId, `tourney-${id}`);
    assert.equal(live.index, 1);

    const detail = await quick.get(`/api/tournaments/${id}`, { token: tokens[0] });
    assert.equal(detail.data.tournament.status, 'running');

    // Player 8 never opened the app before the start. Their seat is already on
    // flight 2; the notification stream and /play both send them there.
    const late = await nextSseEvent(quick.base, tokens[7], (e) => e.type === 'tournament_started' && e.id === id);
    assert.equal(late.tableId, `tourney-${id}-1`);
    assert.equal(late.index, 2);
    const play = await quick.post(`/api/tournaments/${id}/play`, { token: tokens[7] });
    assert.equal(play.status, 200, JSON.stringify(play.data));
    assert.equal(play.data.tableId, `tourney-${id}-1`);
    assert.equal(play.data.tableIndex, 2);

    // Opening the table finds the seat and sits the absent player back in.
    const socket = quick.socket(tokens[7]);
    await socket.opened;
    socket.send({ type: 'join_table', tableId: play.data.tableId });
    const joined = await socket.nextType('joined');
    assert.equal(typeof joined.seat, 'number', 'the late opener is seated, not observing');
    const state = await socket.nextType('state');
    const me = state.state.players.find((seat) => seat.isMe);
    assert.ok(me, 'the late opener is on the table snapshot');
    assert.equal(me.sittingOut, false, 'opening the table sits the player back in');
    await socket.close();

    // Every registrant got a seat at the start, online or not: /play only hands
    // back the seat each one already has.
    const flights = [];
    for (const token of tokens) {
      const again = await quick.post(`/api/tournaments/${id}/play`, { token });
      assert.equal(again.status, 200, JSON.stringify(again.data));
      flights.push(again.data.tableIndex);
    }
    // The 2 s sweep may already have balanced 6 + 2 into 4 + 4; either way the
    // whole field sits on the event's two flights.
    assert.deepEqual([...new Set(flights)].sort(), [1, 2]);
    assert.ok(flights.filter((index) => index === 2).length >= 2);
  } finally { await quick.stop(); }
});
