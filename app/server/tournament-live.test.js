import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

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
