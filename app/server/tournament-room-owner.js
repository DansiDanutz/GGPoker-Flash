/**
 * Owns the live TournamentRoom map and its lifecycle: construction, restart
 * restore, snapshot scheduling, sweeps and disposal. The table/DB/socket work
 * is injected through `makeRoom` and the snapshot callbacks, so this boundary
 * can move into a dedicated room-owner process later without changing callers.
 */
export class TournamentRoomOwner {
  constructor({
    rooms = new Map(),
    makeRoom,
    loadSnapshot = null,
    saveSnapshot,
    deleteSnapshot = null,
    now = () => Date.now(),
    scheduleMs = 250,
  } = {}) {
    if (typeof makeRoom !== 'function') throw new Error('makeRoom is required');
    if (typeof saveSnapshot !== 'function') throw new Error('saveSnapshot is required');
    this.rooms = rooms;
    this.makeRoom = makeRoom;
    this.loadSnapshot = loadSnapshot;
    this.saveSnapshot = saveSnapshot;
    this.deleteSnapshot = deleteSnapshot;
    this.now = now;
    this.scheduleMs = scheduleMs;
    this.saveTimers = new Map();
  }

  get(id) { return this.rooms.get(id) || null; }
  all() { return [...this.rooms.values()]; }

  /** Create a room once; a running event is restored from its last snapshot. */
  ensure(t) {
    const existing = this.rooms.get(t.id);
    if (existing) return existing;
    const room = this.makeRoom(t);
    let saved = null;
    if (t.status === 'running' && this.loadSnapshot) {
      saved = this.loadSnapshot(t.id);
      if (saved) {
        try {
          if (room.restore(saved)) {
            room.syncLevel?.();
            room.restoredAt = this.now();
          }
        } catch { /* keep the fresh room when a snapshot cannot be applied */ }
      }
    }
    this.rooms.set(t.id, room);
    return room;
  }

  dispose(id, { force = false } = {}) {
    const room = this.rooms.get(id);
    if (!room) return;
    room.dispose({ force });
    this.rooms.delete(id);
    this.deleteSnapshot?.(id);
  }

  save(room) {
    if (!room || room.winner) return { ok: false, reason: 'finished' };
    try {
      return this.saveSnapshot(room);
    } catch {
      return { ok: false, reason: 'snapshot failed' };
    }
  }

  schedule(room) {
    if (!room || room.winner || this.saveTimers.has(room.id)) return;
    const timer = setTimeout(() => {
      this.saveTimers.delete(room.id);
      this.save(room);
    }, this.scheduleMs);
    timer.unref?.();
    this.saveTimers.set(room.id, timer);
  }

  snapshot(id) {
    const room = this.get(id);
    if (!room) return { ok: false, reason: 'room not running' };
    return this.save(room);
  }

  snapshotAll() {
    const results = [];
    for (const room of this.rooms.values()) results.push({ id: room.id, ...this.save(room) });
    return { saved: results.filter((result) => result.ok).length, skipped: results.filter((result) => !result.ok).length, rooms: results };
  }

  flushAll() {
    for (const room of this.rooms.values()) this.save(room);
  }

  restoreRunning(rows) {
    let restored = 0;
    for (const t of rows) {
      try {
        const room = this.ensure(t);
        room.syncLevel?.();
        restored += 1;
      } catch { /* one bad event must not block the others */ }
    }
    return restored;
  }

  sweepAll() {
    for (const room of this.rooms.values()) {
      try {
        const result = room.sweep();
        if (result?.moves?.length || result?.broken?.length) this.schedule(room);
      } catch { /* keep the other rooms sweeping */ }
    }
  }

  scheduleAll() {
    for (const room of this.rooms.values()) this.schedule(room);
  }

  /** Drop finished, empty rooms (their snapshots were already removed on completion). */
  removeFinished() {
    for (const [id, room] of this.rooms) {
      if (room.winner && !room.flights.length) this.rooms.delete(id);
    }
  }
}
