// SPDX-License-Identifier: AGPL-3.0-only
// A payout can commit before the next between-hands room snapshot. Never replay an older field over it.
export function chipEventRevision(db, tournamentId) {
  return db.prepare("SELECT COALESCE(MAX(id),0) revision FROM organizer_chip_journals WHERE from_account IN (?,?) OR to_account IN (?,?)")
    .get(`event:${tournamentId}`, `event:${tournamentId}-bounty`, `event:${tournamentId}`, `event:${tournamentId}-bounty`).revision;
}
export function canRestoreChipEvent(db, tournamentId, snapshot) {
  return !!snapshot && snapshot.version === 1 && Array.isArray(snapshot.flights) && snapshot.flights.length > 0
    && snapshot.chipRevision === chipEventRevision(db, tournamentId);
}

export function pauseChipEvent(db, tournamentId, liveTables) {
  const changed = db.prepare("UPDATE tournaments SET status='paused' WHERE id=? AND chip_economy=1 AND status='running'").run(tournamentId);
  for (const entry of liveTables.values()) {
    if (entry.table.cfg.tournamentId === tournamentId) entry.table.financialError = 'Tournament reconciliation required';
  }
  if (changed.changes) db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run('system', 'organizer_event_recovery_required', tournamentId);
}
