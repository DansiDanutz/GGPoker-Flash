/**
 * Durable tournament-room snapshots. Kept separate from index.js so the
 * room-owner boundary can be tested without a live server and moved behind a
 * dedicated service later.
 */

/** A flight with a hand in progress cannot produce a consistent snapshot. */
export function roomHasHandInProgress(room, liveTables) {
  return !!room?.flights?.some((flight) => liveTables?.get(flight.id)?.table?.handInProgress?.());
}

/**
 * Persist one room snapshot after a settled hand. Returns a compact result the
 * admin endpoint can show; a mid-hand or finished room is skipped rather than
 * writing an inconsistent state.
 */
export function saveRoomSnapshot(room, { liveTables, db, now = Date.now() } = {}) {
  if (!room || room.winner) return { ok: false, reason: 'finished' };
  if (roomHasHandInProgress(room, liveTables)) return { ok: false, reason: 'hand in progress' };
  const state = room.snapshot();
  state.savedAt = now;
  const json = JSON.stringify(state);
  db.prepare(`INSERT INTO tourney_state (tournament_id, state, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(tournament_id) DO UPDATE SET state = excluded.state, updated_at = datetime('now')`)
    .run(room.id, json);
  const players = (state.flights || []).reduce((sum, flight) => sum + (flight.players?.length || 0), 0);
  return { ok: true, at: now, bytes: Buffer.byteLength(json), players };
}

/** Read a room snapshot row; null when missing or malformed. */
export function loadRoomSnapshot(db, tournamentId) {
  try {
    const row = db.prepare('SELECT state FROM tourney_state WHERE tournament_id = ?').get(tournamentId);
    if (!row?.state) return null;
    return JSON.parse(row.state);
  } catch {
    return null;
  }
}

/** Remove a completed/disposed room's snapshot. */
export function deleteRoomSnapshot(db, tournamentId) {
  try { db.prepare('DELETE FROM tourney_state WHERE tournament_id = ?').run(tournamentId); } catch { /* best effort */ }
}
