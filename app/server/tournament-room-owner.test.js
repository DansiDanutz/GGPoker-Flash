import test from 'node:test';
import assert from 'node:assert/strict';
import { TournamentRoomOwner } from './tournament-room-owner.js';

function room(id) {
  return {
    id,
    winner: null,
    flights: [],
    restored: null,
    synced: false,
    disposed: false,
    restore(snapshot) { this.restored = snapshot; return true; },
    syncLevel() { this.synced = true; },
    dispose() { this.disposed = true; },
    sweep() { return { moves: [], broken: [] }; },
  };
}

function harness({ snapshot = { version: 1 }, sweep = { moves: [], broken: [] } } = {}) {
  const created = [];
  const saved = [];
  const deleted = [];
  const owner = new TournamentRoomOwner({
    makeRoom: (t) => {
      const r = room(t.id);
      r.sweep = () => sweep;
      created.push(t.id);
      return r;
    },
    loadSnapshot: () => snapshot,
    saveSnapshot: (r) => { saved.push(r.id); return { ok: true, bytes: 12, players: 2 }; },
    deleteSnapshot: (id) => deleted.push(id),
    now: () => 999,
    scheduleMs: 5,
  });
  return { owner, created, saved, deleted };
}

test('ensure creates once and restores a running room', () => {
  const { owner, created } = harness();
  const t = { id: 't1', status: 'running' };
  const first = owner.ensure(t);
  const again = owner.ensure(t);
  assert.equal(first, again);
  assert.deepEqual(created, ['t1']);
  assert.deepEqual(first.restored, { version: 1 });
  assert.equal(first.synced, true);
  assert.equal(first.restoredAt, 999);
});

test('ensure does not restore a completed event', () => {
  const { owner } = harness();
  const r = owner.ensure({ id: 't2', status: 'completed' });
  assert.equal(r.restored, null);
  assert.equal(r.restoredAt, undefined);
});

test('dispose disposes and removes the snapshot', () => {
  const { owner, deleted } = harness();
  const r = owner.ensure({ id: 't3', status: 'completed' });
  owner.dispose('t3');
  assert.equal(r.disposed, true);
  assert.equal(owner.get('t3'), null);
  assert.deepEqual(deleted, ['t3']);
});

test('snapshot, snapshotAll and missing rooms', () => {
  const { owner, saved } = harness();
  owner.ensure({ id: 'a', status: 'completed' });
  owner.ensure({ id: 'b', status: 'completed' });
  assert.deepEqual(owner.snapshot('missing'), { ok: false, reason: 'room not running' });
  assert.equal(owner.snapshot('a').ok, true);
  const all = owner.snapshotAll();
  assert.equal(all.saved, 2);
  assert.equal(all.skipped, 0);
  assert.deepEqual(saved, ['a', 'a', 'b']);
});

test('sweeps schedule a save only when players moved or a table broke', async () => {
  const moved = harness({ sweep: { moves: [{ id: 1 }], broken: [] } });
  moved.owner.ensure({ id: 'm', status: 'completed' });
  moved.owner.sweepAll();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(moved.saved, ['m']);
  const idle = harness();
  idle.owner.ensure({ id: 'i', status: 'completed' });
  idle.owner.sweepAll();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(idle.saved, []);
});
