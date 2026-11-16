import test from 'node:test';
import assert from 'node:assert/strict';
import { blindStructure, lateRegistration, tournamentLobby } from './tournament-lobby.js';
import { MAX_TOURNAMENT_LEVEL } from './tournament-blinds.js';

const START = Date.parse('2026-11-14T18:00:00Z');
const base = {
  id: 't1', status: 'registering', start_at: new Date(START).toISOString(),
  starting_stack: 10000, blind_speed: 8, late_reg: 90, entrants: 3,
};

/** A minimal stand-in for TournamentRoom with two flights. */
function fakeRoom({ level = 3, levelStartedAt = START + 16 * 60000 } = {}) {
  const flights = [
    { id: 'tourney-t1', index: 1, players: [{ id: 1, nick: 'Ana', stack: 30000, isBot: false }, { id: -5, nick: 'Bot5', stack: 5000, isBot: true }] },
    { id: 'tourney-t1-1', index: 2, players: [{ id: 2, nick: 'Bo', stack: 12000, isBot: false }] },
  ];
  return {
    seats: 6,
    tournament: { level, levelStartedAt, blindEvery: 8, baseSb: 100, baseBb: 200 },
    flightState: () => flights,
    alivePlayers: () => flights.flatMap((f) => f.players.map((p) => ({ ...p, index: f.index }))),
  };
}

test('blind structure follows the server curve: 50 big blinds deep, x1.5 per level, no ante', () => {
  const levels = blindStructure(base);
  assert.equal(levels.length, MAX_TOURNAMENT_LEVEL);
  assert.deepEqual(levels[0], { level: 1, sb: 100, bb: 200, ante: 0, minutes: 8 });
  assert.deepEqual(levels[1], { level: 2, sb: 150, bb: 300, ante: 0, minutes: 8 });
  assert.equal(levels[2].bb, 450);
});

test('blind levels never run faster than the five-minute floor the tables use', () => {
  assert.equal(blindStructure({ ...base, blind_speed: 2 })[0].minutes, 5);
  assert.equal(blindStructure({ ...base, blind_speed: 0 })[0].minutes, 10);
});

test('late registration closes late_reg minutes after the start, during the matching level', () => {
  const late = lateRegistration(base, START + 60_000);
  assert.equal(late.endsAt, START + 90 * 60000);
  assert.equal(late.closesAtLevel, 12); // 90 min / 8 min per level = 11 full levels, closes in level 12
  assert.equal(late.open, true);
  assert.equal(lateRegistration(base, START + 91 * 60000).open, false);
});

test('a registering event lists its registrants at the starting stack', () => {
  const lobby = tournamentLobby({
    t: base, room: null, now: START - 60000,
    registrants: [{ id: 1, nick: 'Ana', country: 'ro' }, { id: 2, nick: 'Bo', country: null }],
  });
  assert.equal(lobby.clock, null);
  assert.deepEqual(lobby.players.map((p) => [p.rank, p.nick, p.country, p.stack]), [[1, 'Ana', 'RO', 10000], [2, 'Bo', '', 10000]]);
  assert.deepEqual(lobby.stacks, { starting: 10000, largest: 10000, average: 10000, smallest: 10000 });
  assert.deepEqual(lobby.tables, []);
  assert.equal(lobby.structure.length, MAX_TOURNAMENT_LEVEL);
});

test('a running event ranks live players by chips and reports the blind clock', () => {
  const room = fakeRoom();
  const lobby = tournamentLobby({
    t: { ...base, status: 'running' }, room, now: START + 20 * 60000,
    registrants: [], countryOf: (id) => (id === 1 ? 'DE' : ''),
  });
  assert.deepEqual(lobby.players.map((p) => [p.rank, p.nick, p.stack, p.table, p.isBot]), [
    [1, 'Ana', 30000, 1, false], [2, 'Bo', 12000, 2, false], [3, 'Bot5', 5000, 1, true],
  ]);
  assert.equal(lobby.players[0].country, 'DE');
  assert.deepEqual(lobby.stacks, { starting: 10000, largest: 30000, average: 15667, smallest: 5000 });
  assert.deepEqual(lobby.clock, {
    level: 3, sb: 225, bb: 450, ante: 0,
    next: { level: 4, sb: 338, bb: 675, ante: 0 },
    levelEndsAt: START + 24 * 60000, minutes: 8,
  });
  assert.deepEqual(lobby.tables, [
    { index: 1, id: 'tourney-t1', players: 2, seats: 6, largest: 30000, smallest: 5000 },
    { index: 2, id: 'tourney-t1-1', players: 1, seats: 6, largest: 12000, smallest: 12000 },
  ]);
});

test('the last level has no next level', () => {
  const lobby = tournamentLobby({ t: { ...base, status: 'running' }, room: fakeRoom({ level: MAX_TOURNAMENT_LEVEL }), now: START, registrants: [] });
  assert.equal(lobby.clock.next, null);
});

test('a completed event with no room shows no clock and no players', () => {
  const lobby = tournamentLobby({ t: { ...base, status: 'completed' }, room: null, now: START, registrants: [] });
  assert.equal(lobby.clock, null);
  assert.deepEqual(lobby.players, []);
  assert.equal(lobby.stacks, null);
});

test('GET /api/tournaments/:id returns the lobby view with registrants', async () => {
  const { startServer } = await import('./test-helpers.js');
  const srv = await startServer();
  try {
    const admin = await srv.login('admin', 'admin123');
    const created = await srv.post('/api/admin/tournaments', {
      token: admin,
      body: { id: 'lobby-view', name: 'Lobby view', buyin: 0, fee: 0, gtd: 0, start_at: new Date(Date.now() + 3600_000).toISOString(),
        status: 'registering', max_players: 100, starting_stack: 10000, blind_speed: 8, late_reg: 90 },
    });
    assert.equal(created.status, 200);
    const reg = await srv.post('/api/auth/register', { body: { login: 'lobby_viewer', nick: 'Lobby Viewer', password: 'secret12' } });
    assert.equal((await srv.post('/api/tournaments/lobby-view/register', { token: reg.data.token })).status, 200);
    const r = await srv.get('/api/tournaments/lobby-view');
    assert.equal(r.status, 200);
    assert.equal(r.data.structure[0].bb, 200);
    assert.equal(r.data.lateReg.closesAtLevel, 12);
    assert.deepEqual(r.data.players.map((p) => [p.rank, p.nick, p.stack]), [[1, 'Lobby Viewer', 10000]]);
    assert.equal(r.data.clock, null);
  } finally { await srv.stop(); }
});

test('tournament tables deal the advertised format, not always Hold\'em', async () => {
  const { tournamentGame } = await import('./tournament-lobby.js');
  assert.equal(tournamentGame({ format: 'PLO', game: 'holdem' }), 'omaha');
  assert.equal(tournamentGame({ format: 'Short Deck', game: 'holdem' }), 'shortdeck');
  assert.equal(tournamentGame({ format: 'NLH', game: 'holdem' }), 'holdem');
  assert.equal(tournamentGame({ format: '', game: 'omaha' }), 'omaha');
  assert.equal(tournamentGame({}), 'holdem');
});
