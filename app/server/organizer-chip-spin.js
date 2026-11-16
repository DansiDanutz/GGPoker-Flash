// SPDX-License-Identifier: AGPL-3.0-only
import { spinPayouts } from './spin.js';

const MAX_MULTIPLIER = 20_000;
function fail(message, status = 400, code = 'organizer_spin_invalid') { throw Object.assign(new Error(message), { status, code }); }
function id(value, name) { if (typeof value !== 'string' || !/^[\w:.\-]{1,160}$/.test(value)) fail(`Invalid ${name}.`); return value; }
function integer(value, name) { if (!Number.isSafeInteger(value) || value < 1) fail(`${name} must be a positive integer.`); return value; }
function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function createOrganizerChipSpin({ db, chips }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizer_chip_spin_rounds (
      id TEXT PRIMARY KEY, organizer_id INTEGER NOT NULL, table_id TEXT NOT NULL, stake INTEGER NOT NULL,
      max_reserve INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('waiting','committed','disputed','complete','aborted')),
      outcome TEXT, entry_total INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, committed_at TEXT, completed_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS organizer_chip_spin_active_table ON organizer_chip_spin_rounds(table_id) WHERE state IN ('waiting','committed','disputed');
    CREATE TABLE IF NOT EXISTS organizer_chip_spin_players (
      round_id TEXT NOT NULL, user_id INTEGER NOT NULL, session_id TEXT NOT NULL, place INTEGER, payout INTEGER,
      PRIMARY KEY(round_id,user_id), UNIQUE(round_id,session_id), UNIQUE(round_id,place)
    );
  `);
  const stamp = () => new Date().toISOString();
  const table = (tableId) => db.prepare('SELECT * FROM tables WHERE id=?').get(id(tableId, 'tableId'));
  const round = (roundId) => db.prepare('SELECT * FROM organizer_chip_spin_rounds WHERE id=?').get(id(roundId, 'roundId'));
  const poolKey = (roundId) => `event:spin:${roundId}`;
  const poolBalance = (row) => db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(row.organizer_id, poolKey(row.id))?.balance || 0;
  function currentRound(tableId) {
    return db.prepare("SELECT * FROM organizer_chip_spin_rounds WHERE table_id=? AND state IN ('waiting','committed','disputed') ORDER BY created_at DESC LIMIT 1").get(id(tableId, 'tableId')) || null;
  }
  function eligible(organizerId, tableId, stake) {
    integer(organizerId, 'organizerId'); stake = integer(stake, 'stake');
    const cfg = table(tableId);
    if (!cfg || cfg.owner_id !== organizerId || cfg.private !== 1 || cfg.chip_economy !== 1 || cfg.game !== 'spingold' || cfg.min_buyin !== stake || cfg.max_buyin !== stake) fail('Owned private organizer-chip Spin table required.', 409, 'spin_table_ineligible');
    const membership = db.prepare("SELECT expires_at FROM organizer_billing_memberships WHERE user_id=? AND role='organizer' AND active=1").get(organizerId);
    if (!membership || Date.parse(membership.expires_at) <= Date.now()) fail('Active organizer membership required.', 402, 'membership_required');
    spinPayouts(stake);
    return cfg;
  }
  const reserveRound = ({ organizerId, tableId, stake }) => transaction(db, () => {
    eligible(organizerId, tableId, stake);
    const existing = currentRound(tableId);
    if (existing) {
      if (existing.organizer_id !== organizerId || existing.stake !== stake) fail('Active round has different details.', 409, 'round_conflict');
      return existing;
    }
    const roundId = crypto.randomUUID(), maxReserve = stake * MAX_MULTIPLIER;
    if (!Number.isSafeInteger(maxReserve)) fail('Spin reserve is too large.');
    chips.moveInTransaction({ organizerId, from: `wallet:${organizerId}`, to: poolKey(roundId), amount: maxReserve, kind: 'spin_reserve', reference: `spin:${roundId}:reserve` });
    db.prepare("INSERT INTO organizer_chip_spin_rounds(id,organizer_id,table_id,stake,max_reserve,state,created_at) VALUES (?,?,?,?,?,'waiting',?)").run(roundId, organizerId, tableId, stake, maxReserve, stamp());
    return round(roundId);
  });
  function verifiedOutcome(stake, outcome) {
    if (!outcome || !Number.isSafeInteger(outcome.multiplier)) fail('Verified Spin outcome required.');
    const expected = spinPayouts(stake).find((row) => row.multiplier === outcome.multiplier);
    if (!expected || outcome.prizePool !== expected.prizePool || !Array.isArray(outcome.prizes) || outcome.prizes.length !== 3 || outcome.prizes.some((amount, index) => amount !== expected.prizes[index])) fail('Spin outcome does not match configured odds.', 409, 'outcome_mismatch');
    return { multiplier: expected.multiplier, prizePool: expected.prizePool, prizes: expected.prizes };
  }
  const commitRound = ({ roundId, players, outcome }) => transaction(db, () => {
    const row = round(roundId);
    if (!row) fail('Spin round not found.', 404, 'round_not_found');
    const normalizedOutcome = verifiedOutcome(row.stake, outcome), outcomeJson = JSON.stringify(normalizedOutcome);
    if (row.state === 'committed' || row.state === 'complete') {
      const stored = db.prepare('SELECT user_id,session_id FROM organizer_chip_spin_players WHERE round_id=? ORDER BY session_id').all(row.id);
      const supplied = [...players].map((p) => ({ user_id: p.userId, session_id: p.sessionId })).sort((a, b) => a.session_id.localeCompare(b.session_id));
      if (row.outcome !== outcomeJson || JSON.stringify(stored) !== JSON.stringify(supplied)) fail('Round already committed with different details.', 409, 'round_conflict');
      return { ...row, applied: false };
    }
    if (row.state !== 'waiting' || !Array.isArray(players) || players.length !== 3) fail('Waiting round with exactly three players required.', 409, 'round_not_waiting');
    const sessions = db.prepare("SELECT * FROM organizer_chip_sessions WHERE organizer_id=? AND table_id=? AND status='open' ORDER BY session_id").all(row.organizer_id, row.table_id);
    const supplied = players.map((p) => ({ userId: integer(p.userId, 'userId'), sessionId: id(p.sessionId, 'sessionId'), amount: integer(p.amount, 'amount') })).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    if (sessions.length !== 3 || sessions.some((s, i) => s.session_id !== supplied[i].sessionId || s.user_id !== supplied[i].userId || s.held !== row.stake || supplied[i].amount !== row.stake)) fail('Spin participants do not match three funded seats.', 409, 'participant_mismatch');
    const entryTotal = row.stake * 3;
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `table:${row.table_id}`, to: poolKey(row.id), amount: entryTotal, kind: 'spin_entries', reference: `spin:${row.id}:entries` });
    for (const player of supplied) {
      db.prepare('INSERT INTO organizer_chip_spin_players(round_id,user_id,session_id) VALUES (?,?,?)').run(row.id, player.userId, player.sessionId);
      db.prepare("UPDATE organizer_chip_sessions SET held=0,status='closed',closed_at=? WHERE organizer_id=? AND session_id=?").run(stamp(), row.organizer_id, player.sessionId);
    }
    db.prepare("UPDATE organizer_chip_spin_rounds SET state='committed',outcome=?,entry_total=?,committed_at=? WHERE id=?").run(outcomeJson, entryTotal, stamp(), row.id);
    return { ...round(row.id), applied: true };
  });
  function finish(row) {
    const outcome = JSON.parse(row.outcome), rake = Math.max(0, row.entry_total - outcome.prizePool);
    if (rake) chips.moveInTransaction({ organizerId: row.organizer_id, from: poolKey(row.id), to: 'burn', amount: rake, kind: 'spin_rake', reference: `spin:${row.id}:rake` });
    const remainder = poolBalance(row);
    if (remainder) chips.moveInTransaction({ organizerId: row.organizer_id, from: poolKey(row.id), to: `wallet:${row.organizer_id}`, amount: remainder, kind: 'spin_reserve_return', reference: `spin:${row.id}:return` });
    db.prepare("UPDATE organizer_chip_spin_rounds SET state='complete',completed_at=? WHERE id=?").run(stamp(), row.id);
  }
  const payPlace = ({ tableId, userId, sessionId, place, amount }) => transaction(db, () => {
    userId = integer(userId, 'userId'); sessionId = id(sessionId, 'sessionId'); place = integer(place, 'place');
    if (place > 3 || !Number.isSafeInteger(amount) || amount < 0) fail('Invalid Spin payout.');
    let active = currentRound(tableId);
    if (!active) active = db.prepare("SELECT r.* FROM organizer_chip_spin_rounds r JOIN organizer_chip_spin_players p ON p.round_id=r.id WHERE r.table_id=? AND r.state='complete' AND p.user_id=? AND p.session_id=? ORDER BY r.completed_at DESC LIMIT 1").get(id(tableId, 'tableId'), userId, sessionId);
    if (!active || !['committed', 'disputed', 'complete'].includes(active.state)) fail('Committed Spin round required.', 409, 'round_not_committed');
    const participant = db.prepare('SELECT * FROM organizer_chip_spin_players WHERE round_id=? AND user_id=? AND session_id=?').get(active.id, userId, sessionId);
    if (!participant) fail('Spin participant not found.', 404, 'participant_not_found');
    const expected = JSON.parse(active.outcome).prizes[place - 1];
    if (amount !== expected) fail('Payout does not match the committed outcome.', 409, 'payout_mismatch');
    if (participant.place !== null) {
      if (participant.place !== place || participant.payout !== amount) fail('Participant already paid with different details.', 409, 'payout_conflict');
      return { applied: false, complete: active.state === 'complete' };
    }
    if (db.prepare('SELECT 1 FROM organizer_chip_spin_players WHERE round_id=? AND place=?').get(active.id, place)) fail('Place already paid.', 409, 'place_paid');
    if (amount) chips.moveInTransaction({ organizerId: active.organizer_id, from: poolKey(active.id), to: `wallet:${userId}`, amount, kind: 'spin_payout', reference: `spin:${active.id}:place:${place}` });
    db.prepare('UPDATE organizer_chip_spin_players SET place=?,payout=? WHERE round_id=? AND user_id=?').run(place, amount, active.id, userId);
    const complete = db.prepare('SELECT COUNT(*) count FROM organizer_chip_spin_players WHERE round_id=? AND place IS NOT NULL').get(active.id).count === 3;
    if (complete) finish(active);
    return { applied: true, complete };
  });
  function abort(row) {
    if (row.state === 'waiting') {
      const amount = poolBalance(row);
      if (amount) chips.moveInTransaction({ organizerId: row.organizer_id, from: poolKey(row.id), to: `wallet:${row.organizer_id}`, amount, kind: 'spin_abort_return', reference: `spin:${row.id}:abort:return` });
    } else if (row.state === 'committed') {
      const paid = db.prepare('SELECT COUNT(*) count FROM organizer_chip_spin_players WHERE round_id=? AND place IS NOT NULL').get(row.id).count;
      if (paid) {
        db.prepare("UPDATE organizer_chip_spin_rounds SET state='disputed' WHERE id=?").run(row.id);
        return { ...round(row.id), applied: true };
      }
      for (const player of db.prepare('SELECT * FROM organizer_chip_spin_players WHERE round_id=?').all(row.id)) {
        const refund = Math.max(0, row.stake - (player.payout || 0));
        if (refund) chips.moveInTransaction({ organizerId: row.organizer_id, from: poolKey(row.id), to: `wallet:${player.user_id}`, amount: refund, kind: 'spin_abort_refund', reference: `spin:${row.id}:abort:${player.session_id}` });
      }
      const remainder = poolBalance(row);
      if (remainder) chips.moveInTransaction({ organizerId: row.organizer_id, from: poolKey(row.id), to: `wallet:${row.organizer_id}`, amount: remainder, kind: 'spin_abort_return', reference: `spin:${row.id}:abort:return` });
    }
    db.prepare("UPDATE organizer_chip_spin_rounds SET state='aborted',completed_at=? WHERE id=?").run(stamp(), row.id);
    return { ...round(row.id), applied: true };
  }
  const abortRound = (tableId) => transaction(db, () => {
    const active = currentRound(tableId);
    if (active?.state === 'disputed') fail('Partially paid Spin round requires completion of its committed payout plan.', 409, 'round_disputed');
    return active ? abort(active) : null;
  });
  const recoverRounds = () => transaction(db, () => db.prepare("SELECT * FROM organizer_chip_spin_rounds WHERE state IN ('waiting','committed') ORDER BY created_at").all().map(abort));
  return { reserveRound, currentRound, commitRound, payPlace, abortRound, recoverRounds };
}

export { MAX_MULTIPLIER };
