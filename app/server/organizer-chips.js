// SPDX-License-Identifier: AGPL-3.0-only
const MEMBERSHIP_CHIPS = 100_000;
const PACK_CHIPS = 10_000;
const PACK_CENTS = 100;
const MAX = 9_000_000_000;

function fail(message, status = 400, code = 'organizer_chips_invalid') {
  throw Object.assign(new Error(message), { status, code });
}
function integer(value, name, { positive = true } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > MAX) fail(`${name} must be a bounded integer.`);
  return value;
}
function text(value, name, max = 160) {
  if (typeof value !== 'string' || !value || value.length > max || !/^[\w:.\-]+$/.test(value)) fail(`Invalid ${name}.`);
  return value;
}
function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function createOrganizerChips({ db, now = Date.now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizer_chip_accounts (
      organizer_id INTEGER NOT NULL, account_key TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
      PRIMARY KEY(organizer_id,account_key)
    );
    CREATE TABLE IF NOT EXISTS organizer_chip_journals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, organizer_id INTEGER NOT NULL, kind TEXT NOT NULL, reference TEXT NOT NULL,
      payload TEXT NOT NULL, from_account TEXT, to_account TEXT, amount INTEGER NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(organizer_id,reference)
    );
    CREATE TABLE IF NOT EXISTS organizer_chip_operations (
      organizer_id INTEGER NOT NULL, operation_key TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL,
      result TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(organizer_id,operation_key)
    );
    CREATE TABLE IF NOT EXISTS organizer_chip_sessions (
      organizer_id INTEGER NOT NULL, session_id TEXT NOT NULL, user_id INTEGER NOT NULL, table_id TEXT NOT NULL,
      held INTEGER NOT NULL CHECK(held >= 0), status TEXT NOT NULL CHECK(status IN ('open','closed')), opened_at TEXT NOT NULL, closed_at TEXT,
      PRIMARY KEY(organizer_id,session_id)
    );
    CREATE TABLE IF NOT EXISTS organizer_chip_grants (
      organizer_id INTEGER NOT NULL, reference TEXT NOT NULL, available_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','released')), created_at TEXT NOT NULL,
      PRIMARY KEY(organizer_id,reference)
    );
    CREATE TRIGGER IF NOT EXISTS organizer_chip_journals_no_update BEFORE UPDATE ON organizer_chip_journals BEGIN SELECT RAISE(ABORT,'immutable chip journal'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_chip_journals_no_delete BEFORE DELETE ON organizer_chip_journals BEGIN SELECT RAISE(ABORT,'immutable chip journal'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_chip_burn_no_decrease BEFORE UPDATE OF balance ON organizer_chip_accounts WHEN OLD.account_key='burn' AND NEW.balance<OLD.balance BEGIN SELECT RAISE(ABORT,'burn balance cannot decrease'); END;
    CREATE TRIGGER IF NOT EXISTS organizer_chip_burn_no_delete BEFORE DELETE ON organizer_chip_accounts WHEN OLD.account_key='burn' BEGIN SELECT RAISE(ABORT,'burn account cannot be deleted'); END;
  `);
  const stamp = () => new Date(now()).toISOString();
  const orgId = (value) => integer(value, 'organizerId');
  const userId = (value) => integer(value, 'userId');
  const accountKey = (value) => {
    text(value, 'account key');
    if (value !== 'burn' && !/^(wallet:\d+|(?:table|ticket|event|payout):[\w:.\-]+)$/.test(value)) fail('Invalid account key.');
    return value;
  };
  const ensureUser = (id) => {
    if (!db.prepare('SELECT id FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL').get(userId(id))) fail('Active user required.', 403, 'user_inactive');
  };
  const existingUser = (id) => {
    id = userId(id);
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(id)) fail('User not found.', 404, 'user_not_found');
    return id;
  };
  const ensureOrganizer = (id) => { ensureUser(id); return orgId(id); };
  const organizerExists = (id) => {
    id = orgId(id);
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(id)) fail('Organizer not found.', 404, 'organizer_not_found');
    return id;
  };
  const chipTable = (organizerId, tableId) => {
    tableId = text(tableId, 'tableId');
    const row = db.prepare('SELECT id FROM tables WHERE id=? AND owner_id=? AND private=1 AND chip_economy=1').get(tableId, organizerId);
    if (!row) fail('Owned private organizer-chip table required.', 409, 'chip_table_ineligible');
    return tableId;
  };
  const ensureAccount = (organizerId, key) => db.prepare('INSERT OR IGNORE INTO organizer_chip_accounts VALUES (?,?,0)').run(organizerId, key);
  const rawBalance = (organizerId, key) => db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(organizerId, key)?.balance || 0;
  function operation(organizerId, operationKey, kind, payload) {
    text(operationKey, 'idempotency key');
    const old = db.prepare('SELECT * FROM organizer_chip_operations WHERE organizer_id=? AND operation_key=?').get(organizerId, operationKey);
    if (!old) return null;
    if (old.kind !== kind || old.payload !== payload) fail('Idempotency key already used with different details.', 409, 'idempotency_conflict');
    return JSON.parse(old.result);
  }
  function record(organizerId, operationKey, kind, payload, result) {
    db.prepare('INSERT INTO organizer_chip_operations VALUES (?,?,?,?,?,?)').run(organizerId, operationKey, kind, payload, JSON.stringify(result), stamp());
    return result;
  }
  function movement({ organizerId, from, to, amount, kind, reference }, allowMint = false) {
    if (!db.isTransaction) fail('moveInTransaction requires an existing transaction.', 500, 'transaction_required');
    organizerId = organizerExists(organizerId); from = from === null ? null : accountKey(from); to = to === null ? null : accountKey(to);
    amount = integer(amount, 'amount'); kind = text(kind, 'journal kind', 80); reference = text(reference, 'reference', 512);
    if (from === 'burn') fail('Burned chips cannot be spent.', 409, 'burn_immutable');
    if (from === to || !to || (!from && !allowMint)) fail('Movement requires distinct funded accounts.');
    const payload = JSON.stringify({ from, to, amount, kind });
    const old = db.prepare('SELECT * FROM organizer_chip_journals WHERE organizer_id=? AND reference=?').get(organizerId, reference);
    if (old) {
      if (old.payload !== payload) fail('Reference already used with different details.', 409, 'reference_conflict');
      return { applied: false, balance: to ? rawBalance(organizerId, to) : null };
    }
    if (from) {
      ensureAccount(organizerId, from);
      const debit = db.prepare('UPDATE organizer_chip_accounts SET balance=balance-? WHERE organizer_id=? AND account_key=? AND balance>=?').run(amount, organizerId, from, amount);
      if (debit.changes !== 1) fail('Insufficient chips.', 402, 'insufficient_chips');
    }
    if (to) {
      ensureAccount(organizerId, to);
      if (rawBalance(organizerId, to) > MAX - amount) fail('Chip balance limit exceeded.');
      db.prepare('UPDATE organizer_chip_accounts SET balance=balance+? WHERE organizer_id=? AND account_key=?').run(amount, organizerId, to);
    }
    db.prepare('INSERT INTO organizer_chip_journals(organizer_id,kind,reference,payload,from_account,to_account,amount,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(organizerId, kind, reference, payload, from, to, amount, stamp());
    return { applied: true, balance: to ? rawBalance(organizerId, to) : null };
  }
  const moveInTransaction = (details) => movement(details);
  const move = (details) => transaction(db, () => movement(details));
  function requireMembership(organizerId) {
    const membership = db.prepare("SELECT expires_at FROM organizer_billing_memberships WHERE user_id=? AND role='organizer' AND active=1").get(organizerId);
    if (!membership || Date.parse(membership.expires_at) <= now()) fail('Active organizer membership required.', 402, 'membership_required');
  }
  // Called by billing.subscribe while its transaction is open, so the chips and paid membership commit together.
  function grantMembership({ organizerId, reference, availableAt = stamp() }) {
    if (!db.isTransaction) fail('grantMembership requires the billing transaction.', 500, 'transaction_required');
    organizerId = ensureOrganizer(organizerId); reference = text(reference, 'reference');
    const availableMs = Date.parse(availableAt);
    if (!Number.isFinite(availableMs)) fail('Invalid grant availability date.');
    const available = new Date(availableMs).toISOString();
    const old = db.prepare('SELECT * FROM organizer_chip_grants WHERE organizer_id=? AND reference=?').get(organizerId, reference);
    if (old) {
      if (old.available_at !== available) fail('Grant reference already used with different details.', 409, 'reference_conflict');
      return { applied: false, pending: old.status === 'pending', available_at: available };
    }
    const due = Date.parse(available) <= now();
    db.prepare('INSERT INTO organizer_chip_grants VALUES (?,?,?,?,?)').run(organizerId, reference, available, due ? 'released' : 'pending', stamp());
    if (due) movement({ organizerId, from: null, to: `wallet:${organizerId}`, amount: MEMBERSHIP_CHIPS, kind: 'membership_grant', reference: `membership:${reference}` }, true);
    return { applied: due, pending: !due, available_at: available };
  }
  function grantClubEntryBonus({ organizerId, reference, amount, nonredeemable }) {
    if (!db.isTransaction || nonredeemable !== true) fail('Club entry bonus requires a settlement transaction.', 500, 'transaction_required');
    organizerId = ensureOrganizer(organizerId);
    requireMembership(organizerId);
    return movement({ organizerId, from: null, to: `wallet:${organizerId}`, amount, kind: 'club_entry_bonus', reference: text(reference, 'reference') }, true);
  }
  function releaseDueGrants() {
    return transaction(db, () => {
      const due = db.prepare("SELECT * FROM organizer_chip_grants WHERE status='pending' AND available_at<=? ORDER BY available_at,organizer_id,reference").all(stamp());
      for (const grant of due) {
        movement({ organizerId: grant.organizer_id, from: null, to: `wallet:${grant.organizer_id}`, amount: MEMBERSHIP_CHIPS, kind: 'membership_grant', reference: `membership:${grant.reference}` }, true);
        db.prepare("UPDATE organizer_chip_grants SET status='released' WHERE organizer_id=? AND reference=? AND status='pending'").run(grant.organizer_id, grant.reference);
      }
      return due.length;
    });
  }
  const purchase = ({ organizerId, packs, idempotencyKey }) => transaction(db, () => {
    organizerId = ensureOrganizer(organizerId); packs = integer(packs, 'packs');
    if (packs > Math.floor(MAX / PACK_CHIPS)) fail('Too many packs.');
    const payload = String(packs), old = operation(organizerId, idempotencyKey, 'purchase', payload);
    if (old) return { ...old, applied: false };
    requireMembership(organizerId);
    const cents = packs * PACK_CENTS, chips = packs * PACK_CHIPS;
    const debit = db.prepare('UPDATE organizer_billing_accounts SET balance_cents=balance_cents-? WHERE user_id=? AND balance_cents>=?').run(cents, organizerId, cents);
    if (debit.changes !== 1) fail('Insufficient service credits.', 402, 'insufficient_credit');
    db.prepare("INSERT INTO organizer_billing_ledger(user_id,kind,amount_cents,reference,resource_id,metadata,created_at) VALUES (?,?,?,?,NULL,?,?)")
      .run(organizerId, 'chip_pack', -cents, `chips:${organizerId}:${idempotencyKey}`, JSON.stringify({ packs, chips }), stamp());
    movement({ organizerId, from: null, to: `wallet:${organizerId}`, amount: chips, kind: 'pack_purchase', reference: `purchase:${idempotencyKey}` }, true);
    return record(organizerId, idempotencyKey, 'purchase', payload, { packs, chips, service_cents: cents, balance: rawBalance(organizerId, `wallet:${organizerId}`) });
  });
  const transfer = ({ organizerId, fromUserId, toUserId, amount, idempotencyKey }) => transaction(db, () => {
    organizerId = ensureOrganizer(organizerId); ensureUser(fromUserId); ensureUser(toUserId); amount = integer(amount, 'amount');
    if (fromUserId === toUserId) fail('Cannot transfer chips to the same user.');
    const payload = JSON.stringify({ fromUserId, toUserId, amount }), old = operation(organizerId, idempotencyKey, 'transfer', payload);
    if (old) return { ...old, applied: false };
    moveInTransaction({ organizerId, from: `wallet:${fromUserId}`, to: `wallet:${toUserId}`, amount, kind: 'transfer', reference: `transfer:${idempotencyKey}` });
    return record(organizerId, idempotencyKey, 'transfer', payload, { balance: rawBalance(organizerId, `wallet:${fromUserId}`) });
  });
  function balance(organizerId, id) { return rawBalance(orgId(organizerId), `wallet:${userId(id)}`); }
  function account(id) {
    userId(id);
    return db.prepare("SELECT organizer_id,balance FROM organizer_chip_accounts WHERE account_key=? ORDER BY organizer_id").all(`wallet:${id}`);
  }
  const openSeat = ({ organizerId, userId: id, tableId, sessionId, amount }) => transaction(db, () => {
    organizerId = ensureOrganizer(organizerId); ensureUser(id); tableId = chipTable(organizerId, tableId); sessionId = text(sessionId, 'sessionId'); amount = integer(amount, 'amount');
    const existing = db.prepare('SELECT * FROM organizer_chip_sessions WHERE organizer_id=? AND session_id=?').get(organizerId, sessionId);
    if (existing) {
      if (existing.user_id !== id || existing.table_id !== tableId || existing.held !== amount) fail('Session already used with different details.', 409, 'session_conflict');
      return { applied: false, balance: existing.held };
    }
    moveInTransaction({ organizerId, from: `wallet:${id}`, to: `table:${tableId}`, amount, kind: 'seat_open', reference: `seat:${sessionId}:open` });
    db.prepare("INSERT INTO organizer_chip_sessions VALUES (?,?,?,?,?,'open',?,NULL)").run(organizerId, sessionId, id, tableId, amount, stamp());
    return { applied: true, balance: amount };
  });
  const seatMove = ({ organizerId, userId: id, tableId, sessionId, kind, amount, reference }) => transaction(db, () => {
    organizerId = ensureOrganizer(organizerId); ensureUser(id); tableId = chipTable(organizerId, tableId); sessionId = text(sessionId, 'sessionId'); kind = text(kind, 'kind', 80);
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX) fail('amount must be a bounded non-zero signed integer.');
    const session = db.prepare("SELECT * FROM organizer_chip_sessions WHERE organizer_id=? AND session_id=? AND user_id=? AND table_id=? AND status='open'").get(organizerId, sessionId, id, tableId);
    if (!session) fail('Open seat session required.', 409, 'session_not_open');
    const moved = moveInTransaction({ organizerId, from: amount < 0 ? `wallet:${id}` : `table:${tableId}`, to: amount < 0 ? `table:${tableId}` : `wallet:${id}`, amount: Math.abs(amount), kind, reference: `seat:${sessionId}:${text(reference, 'reference')}` });
    if (moved.applied) {
      const held = session.held - amount;
      if (held < 0) fail('Cannot remove more than the held stack.', 402, 'insufficient_chips');
      db.prepare('UPDATE organizer_chip_sessions SET held=? WHERE organizer_id=? AND session_id=?').run(held, organizerId, sessionId);
      return { applied: true, balance: held };
    }
    return { applied: false, balance: db.prepare('SELECT held FROM organizer_chip_sessions WHERE organizer_id=? AND session_id=?').get(organizerId, sessionId).held };
  });
  const settleHand = ({ organizerId, tableId, handId, players, rake = 0 }) => transaction(db, () => {
    organizerId = organizerExists(organizerId); tableId = chipTable(organizerId, tableId); handId = text(handId, 'handId'); integer(rake, 'rake', { positive: false });
    if (!Array.isArray(players) || !players.length) fail('All open seats are required.');
    const normalized = players.map((p) => ({ sessionId: text(p.sessionId, 'sessionId'), userId: userId(p.userId), amount: integer(p.amount, 'amount', { positive: false }) })).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    const payload = JSON.stringify({ tableId, players: normalized, rake }), old = operation(organizerId, `hand:${handId}`, 'settle_hand', payload);
    if (old) return { ...old, applied: false };
    const sessions = db.prepare("SELECT * FROM organizer_chip_sessions WHERE organizer_id=? AND table_id=? AND status='open' ORDER BY session_id").all(organizerId, tableId);
    if (sessions.length !== normalized.length || sessions.some((s, i) => s.session_id !== normalized[i].sessionId || s.user_id !== normalized[i].userId)) fail('Settlement must cover every open seat.', 409, 'seat_set_mismatch');
    const escrow = rawBalance(organizerId, `table:${tableId}`), next = normalized.reduce((sum, p) => sum + p.amount, 0);
    if (!Number.isSafeInteger(next) || escrow !== next + rake) fail('Table settlement does not reconcile.', 409, 'table_not_reconciled');
    if (rake) moveInTransaction({ organizerId, from: `table:${tableId}`, to: 'burn', amount: rake, kind: 'rake', reference: `hand:${handId}:rake` });
    for (const player of normalized) db.prepare('UPDATE organizer_chip_sessions SET held=? WHERE organizer_id=? AND session_id=?').run(player.amount, organizerId, player.sessionId);
    return record(organizerId, `hand:${handId}`, 'settle_hand', payload, { applied: true, escrow: next, rake });
  });
  const close = ({ organizerId, userId: id, tableId, sessionId }, validateUser) => transaction(db, () => {
    organizerId = organizerExists(organizerId); existingUser(id); tableId = validateUser ? chipTable(organizerId, tableId) : text(tableId, 'tableId'); sessionId = text(sessionId, 'sessionId');
    const session = db.prepare('SELECT * FROM organizer_chip_sessions WHERE organizer_id=? AND session_id=? AND user_id=? AND table_id=?').get(organizerId, sessionId, id, tableId);
    if (!session) fail('Seat session not found.', 404, 'session_not_found');
    if (session.status === 'closed') return { applied: false, balance: balance(organizerId, id) };
    if (session.held) moveInTransaction({ organizerId, from: `table:${tableId}`, to: `wallet:${id}`, amount: session.held, kind: 'seat_close', reference: `seat:${sessionId}:close` });
    db.prepare("UPDATE organizer_chip_sessions SET held=0,status='closed',closed_at=? WHERE organizer_id=? AND session_id=?").run(stamp(), organizerId, sessionId);
    return { applied: true, balance: balance(organizerId, id) };
  });
  const closeSeat = (details) => close(details, true);
  function recoverSessions() {
    return transaction(db, () => db.prepare("SELECT * FROM organizer_chip_sessions WHERE status='open'").all().map((s) => close({ organizerId: s.organizer_id, userId: s.user_id, tableId: s.table_id, sessionId: s.session_id }, false)));
  }
  function reconcileTable(organizerId, tableId) {
    organizerId = organizerExists(organizerId); tableId = chipTable(organizerId, tableId);
    const escrow = rawBalance(organizerId, `table:${tableId}`);
    const held = db.prepare("SELECT COALESCE(SUM(held),0) total FROM organizer_chip_sessions WHERE organizer_id=? AND table_id=? AND status='open'").get(organizerId, tableId).total;
    return { escrow, held, reconciled: escrow === held };
  }
  function supply(organizerId) {
    organizerId = organizerExists(organizerId);
    const minted = db.prepare('SELECT COALESCE(SUM(amount),0) total FROM organizer_chip_journals WHERE organizer_id=? AND from_account IS NULL').get(organizerId).total;
    const burned = rawBalance(organizerId, 'burn');
    return { minted, burned, circulating: minted - burned };
  }
  const history = (organizerId) => db.prepare('SELECT * FROM organizer_chip_journals WHERE organizer_id=? ORDER BY id DESC').all(organizerExists(organizerId));
  return { grantMembership, grantClubEntryBonus, releaseDueGrants, purchase, balance, account, history, supply, transfer, openSeat, seatMove, settleHand, closeSeat, recoverSessions, reconcileTable, move, moveInTransaction };
}

export { MEMBERSHIP_CHIPS, PACK_CHIPS, PACK_CENTS };
