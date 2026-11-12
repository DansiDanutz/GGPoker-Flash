import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceRoomLevel, tournamentBlinds } from './tournament-controls.js';
import { MAX_TOURNAMENT_LEVEL } from './tournament-blinds.js';

function harness({ hand = false, winner = null, level = 2 } = {}) {
  const applied = [];
  const broadcasts = [];
  const tables = new Map([
    ['trn-1-1', { table: { handInProgress: () => hand, applyTournamentLevel: () => applied.push('trn-1-1') } }],
    ['trn-1-2', { table: { handInProgress: () => hand, applyTournamentLevel: () => applied.push('trn-1-2') } }],
  ]);
  const room = {
    id: 'trn-1',
    winner,
    tournament: { baseSb: 100, baseBb: 200, level, levelStartedAt: 1 },
    flights: [{ id: 'trn-1-1' }, { id: 'trn-1-2' }],
    ops: { broadcast: (id) => broadcasts.push(id) },
  };
  return { room, tables, applied, broadcasts };
}

test('advancing a level updates the clock, blinds and every flight', () => {
  const { room, tables, applied, broadcasts } = harness({ level: 2 });
  const result = advanceRoomLevel(room, { delta: 2, liveTables: tables, now: 5000 });
  assert.deepEqual(result, { ok: true, level: 4, blinds: { sb: 338, bb: 675 } });
  assert.equal(room.tournament.level, 4);
  assert.equal(room.tournament.levelStartedAt, 5000);
  assert.deepEqual(applied, ['trn-1-1', 'trn-1-2']);
  assert.deepEqual(broadcasts, ['trn-1-1', 'trn-1-2']);
});

test('a hand in progress or a finished room refuses the advance', () => {
  const mid = harness({ hand: true, level: 2 });
  assert.deepEqual(advanceRoomLevel(mid.room, { liveTables: mid.tables }), { ok: false, reason: 'hand in progress' });
  assert.equal(mid.room.tournament.level, 2);
  const done = harness({ winner: { nick: 'W' }, level: 2 });
  assert.deepEqual(advanceRoomLevel(done.room, { liveTables: done.tables }), { ok: false, reason: 'finished' });
  assert.deepEqual(advanceRoomLevel(null, {}), { ok: false, reason: 'room not running' });
});

test('the level is clamped and the blinds follow the 1.5x curve', () => {
  const { room, tables } = harness({ level: MAX_TOURNAMENT_LEVEL - 1 });
  const result = advanceRoomLevel(room, { delta: 20, liveTables: tables });
  assert.equal(result.level, MAX_TOURNAMENT_LEVEL);
  assert.deepEqual(tournamentBlinds({ baseSb: 100, baseBb: 200 }, 1), { sb: 100, bb: 200 });
  assert.deepEqual(tournamentBlinds({ baseSb: 100, baseBb: 200 }, 3), { sb: 225, bb: 450 });
});
