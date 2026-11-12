import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlatformReport, diskUsage, levelBlinds, recoveryHealth, SNAPSHOT_STALE_MS, snapshotAgeMs, tournamentRoomSummary } from './admin-platform.js';

function fakeRoom(overrides = {}) {
  return {
    id: 'trn-1',
    tournament: {
      name: 'Sunday Major', mode: 'freezeout', buyin: 24000, prizePool: 25000000, entrants: 753,
      baseSb: 100, baseBb: 200, level: 4, blindEvery: 10, levelStartedAt: 1_000_000,
    },
    flights: [],
    finished: [{ id: 1 }, { id: 2 }],
    winner: null,
    restoredAt: 1_234_567,
    syncLevel: () => 4,
    flightState: () => [
      { id: 'trn-1-1', index: 1, players: [{ inHand: true }, { inHand: false }, { inHand: true }] },
      { id: 'trn-1-2', index: 2, players: [{ inHand: false }] },
    ],
    stats: () => ({ playersLeft: 4, humansLeft: 2, finished: 2, winner: null }),
    ...overrides,
  };
}

test('tournament room summary projects the shared blind clock', () => {
  const room = fakeRoom();
  const now = 1_000_000 + 4 * 60_000;
  const summary = tournamentRoomSummary(room, now);
  assert.equal(summary.id, 'trn-1');
  assert.equal(summary.name, 'Sunday Major');
  assert.equal(summary.level, 4);
  assert.deepEqual(summary.blinds, levelBlinds(room.tournament, 4));
  assert.equal(summary.blinds.bb, Math.round(200 * 1.5 ** 3));
  assert.equal(summary.tables, 2);
  assert.equal(summary.playersLeft, 4);
  assert.equal(summary.humansLeft, 2);
  assert.equal(summary.finished, 2);
  assert.equal(summary.flights[0].players, 3);
  assert.equal(summary.flights[0].inHand, 2);
  assert.equal(summary.nextLevelInMs, 6 * 60_000);
});

test('platform report combines sockets, live tables, rooms and db counts', () => {
  const liveTables = new Map([
    ['nlh-1', {
      table: { cfg: { id: 'nlh-1', name: 'NLH 01', game: 'holdem' }, occupiedSeats: () => [{}, {}], handNo: 12, street: 'flop' },
      clients: new Set([{ userId: 1 }, { userId: 2 }, { userId: 3 }]),
    }],
  ]);
  const tournamentRooms = new Map([['trn-1', fakeRoom()]]);
  const db = {
    prepare: (sql) => sql.includes('tourney_state')
      ? { all: () => [{ tournament_id: 'trn-1', updated_at: '2026-11-12 12:00:00', bytes: 120 }] }
      : { get: () => ({ c: 7 }) },
  };
  const proc = {
    version: 'v26.0.0', pid: 42, platform: 'linux', arch: 'x64',
    uptime: () => 3661, memoryUsage: () => ({ rss: 100, heapUsed: 40, heapTotal: 80, external: 5 }),
  };
  const report = buildPlatformReport({
    now: 2_000_000,
    versionInfo: { version: '1.1.0', build: '20261112120000' },
    wss: { clients: new Set([{ userId: 1 }, { userId: 2 }]) },
    liveTables,
    tournamentRooms,
    db,
    dbPath: null,
    env: { NODE_ENV: 'production' },
    proc,
  });
  assert.equal(report.server.version, '1.1.0');
  assert.equal(report.server.uptimeSec, 3661);
  assert.equal(report.server.env, 'production');
  assert.equal(report.sockets.total, 2);
  assert.equal(report.sockets.users, 2);
  assert.equal(report.tables.live, 1);
  assert.equal(report.tables.seats, 2);
  assert.equal(report.tables.connections, 3);
  assert.equal(report.tournaments.rooms, 1);
  assert.equal(report.tournaments.playersLeft, 4);
  assert.equal(report.tournaments.snapshots, 1);
  assert.deepEqual(report.tournaments.items[0].snapshot, { at: '2026-11-12 12:00:00', bytes: 120 });
  assert.equal(report.tournaments.items[0].restoredAt, 1_234_567);
  assert.equal(report.db.users, 7);
  assert.equal(report.db.sizeBytes, null);
  assert.deepEqual(report.memory, { rss: 100, heapUsed: 40, heapTotal: 80, external: 5 });
});

test('platform report tolerates an empty server', () => {
  const report = buildPlatformReport({ now: 0, wss: undefined, liveTables: new Map(), tournamentRooms: new Map(), db: null, dbPath: null, proc: {} });
  assert.equal(report.ok, true);
  assert.equal(report.sockets.total, 0);
  assert.equal(report.tables.live, 0);
  assert.equal(report.tournaments.rooms, 0);
  assert.equal(report.db.users, null);
});

test('disk usage reports total and free bytes', () => {
  const disk = diskUsage('/');
  assert.equal(typeof disk.totalBytes, 'number');
  assert.ok(disk.totalBytes > 0);
  assert.ok(disk.freeBytes >= 0);
  assert.ok(disk.usedPct >= 0 && disk.usedPct <= 100);
});

test('snapshots older than five minutes are stale for a room with players', () => {
  const now = Date.parse('2026-11-12T13:10:00Z');
  const fresh = { at: '2026-11-12 13:09:00' };
  const old = { at: '2026-11-12 13:00:00' };
  assert.equal(snapshotAgeMs(fresh, now), 60_000);
  assert.equal(recoveryHealth({ playersLeft: 2 }, fresh, now).stale, false);
  assert.equal(recoveryHealth({ playersLeft: 2 }, old, now).stale, true);
  assert.ok(snapshotAgeMs(old, now) > SNAPSHOT_STALE_MS);
  assert.equal(recoveryHealth({ playersLeft: 0 }, old, now).stale, false);
  assert.equal(recoveryHealth({ playersLeft: 2 }, null, now).stale, true);
});
