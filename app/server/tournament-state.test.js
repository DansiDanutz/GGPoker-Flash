import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteRoomSnapshot, loadRoomSnapshot, roomHasHandInProgress, saveRoomSnapshot } from './tournament-state.js';

function fakeDb() {
  const calls = { run: [], get: null };
  return {
    calls,
    prepare(sql) {
      return {
        run(...args) { calls.run.push({ sql, args }); },
        get() { return calls.get; },
      };
    },
  };
}

function fakeRoom({ hand = false, winner = null, players = 2 } = {}) {
  return {
    id: 'trn-1',
    winner,
    flights: [{ id: 'trn-1-1' }],
    snapshot: () => ({
      version: 1,
      flights: [{ id: 'trn-1-1', players: Array.from({ length: players }, (_, i) => ({ id: i + 1, stack: 1000 })) }],
    }),
  };
}

test('a settled room writes a snapshot and reports its size', () => {
  const db = fakeDb();
  const room = fakeRoom();
  const liveTables = new Map([['trn-1-1', { table: { handInProgress: () => false } }]]);
  const result = saveRoomSnapshot(room, { liveTables, db, now: 1234 });
  assert.equal(result.ok, true);
  assert.equal(result.at, 1234);
  assert.equal(result.players, 2);
  assert.ok(result.bytes > 0);
  assert.equal(db.calls.run.length, 1);
  const [id, json] = db.calls.run[0].args;
  assert.equal(id, 'trn-1');
  assert.match(db.calls.run[0].sql, /INSERT INTO tourney_state/);
  assert.equal(JSON.parse(json).savedAt, 1234);
});

test('a hand in progress or a finished room is skipped', () => {
  const db = fakeDb();
  const liveTables = new Map([['trn-1-1', { table: { handInProgress: () => true } }]]);
  assert.deepEqual(saveRoomSnapshot(fakeRoom(), { liveTables, db }), { ok: false, reason: 'hand in progress' });
  assert.equal(roomHasHandInProgress(fakeRoom(), liveTables), true);
  assert.deepEqual(saveRoomSnapshot(fakeRoom({ winner: { nick: 'W' } }), { liveTables, db }), { ok: false, reason: 'finished' });
  assert.equal(db.calls.run.length, 0);
});

test('load and delete tolerate missing rows and malformed JSON', () => {
  const db = fakeDb();
  db.calls.get = null;
  assert.equal(loadRoomSnapshot(db, 'none'), null);
  db.calls.get = { state: '{not json' };
  assert.equal(loadRoomSnapshot(db, 'bad'), null);
  db.calls.get = { state: '{"version":1}' };
  assert.deepEqual(loadRoomSnapshot(db, 'ok'), { version: 1 });
  deleteRoomSnapshot(db, 'ok');
  assert.match(db.calls.run[0].sql, /DELETE FROM tourney_state/);
});
