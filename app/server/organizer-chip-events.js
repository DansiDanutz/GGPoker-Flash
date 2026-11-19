// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { mysteryBountyAmounts } from './tournament.js';

function fail(message, status = 400, code = 'organizer_chip_event_invalid') { throw Object.assign(new Error(message), { status, code }); }
const integer = (value, name) => { if (!Number.isSafeInteger(value) || value < 1 || value > 9_000_000_000) fail(`${name} must be a bounded positive integer.`); return value; };
const nonnegative = (value, name) => { if (!Number.isSafeInteger(value) || value < 0 || value > 9_000_000_000) fail(`${name} must be a bounded non-negative integer.`); return value; };
const short = (value, name, max = 160) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`${name} is required (maximum ${max} characters).`); return value.trim(); };
const validatePaymentAmount = (value) => { value = short(value, 'paymentAmount', 80); if (!/^\d{1,18}(?:\.\d{1,8})?$/.test(value) || Number(value) <= 0) fail('paymentAmount must be a positive decimal string.'); return value; };
const validateCurrency = (value) => { value = short(value, 'paymentCurrency', 24).toUpperCase(); if (!/^[A-Z0-9]{2,12}$/.test(value)) fail('Invalid paymentCurrency.'); return value; };
const validatePaymentText = (value, name, max) => { value = short(value, name, max); if (/[\u0000-\u001f\u007f]/.test(value)) fail(`Invalid ${name}.`); return value; };
function transaction(db, fn) { if (db.isTransaction) return fn(); db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } }

export function createOrganizerChipEvents({ db, chips, now = Date.now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizer_chip_tickets (
      id TEXT PRIMARY KEY, organizer_id INTEGER NOT NULL, tournament_id TEXT NOT NULL, holder_id INTEGER NOT NULL,
      buyin INTEGER NOT NULL, fee INTEGER NOT NULL, price INTEGER NOT NULL, starting_stack INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('issued','redeemed','refunded','consumed')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, redemptions INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS organizer_chip_ticket_operations (
      actor_id INTEGER NOT NULL, operation_key TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, result TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY(actor_id,operation_key)
    );
    CREATE TABLE IF NOT EXISTS organizer_chip_event_states (
      tournament_id TEXT PRIMARY KEY, organizer_id INTEGER NOT NULL, mode TEXT NOT NULL, entrants INTEGER NOT NULL,
      prize_pool INTEGER NOT NULL, bounty_pool INTEGER NOT NULL DEFAULT 0, contract TEXT NOT NULL,
      started_at TEXT NOT NULL, payout_count INTEGER NOT NULL DEFAULT 0, closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS organizer_chip_buybacks (
      id TEXT PRIMARY KEY, organizer_id INTEGER NOT NULL, requester_id INTEGER NOT NULL, chips INTEGER NOT NULL,
      payment_amount TEXT NOT NULL, payment_currency TEXT NOT NULL, payment_details TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('requested','reported','paid','cancelled','rejected','disputed')),
      receipt TEXT UNIQUE, report_amount TEXT, report_currency TEXT, report_network TEXT, report_details TEXT,
      processing_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
  if (!db.prepare("PRAGMA table_info('organizer_chip_buybacks')").all().some((column) => column.name === 'processing_at')) db.exec('ALTER TABLE organizer_chip_buybacks ADD COLUMN processing_at TEXT');
  const stamp = () => new Date(now()).toISOString();
  const active = (id) => { integer(id, 'userId'); if (!db.prepare('SELECT id FROM users WHERE id=? AND banned=0 AND deleted_at IS NULL').get(id)) fail('Active user required.', 403, 'user_inactive'); return id; };
  const tournament = (id) => db.prepare('SELECT * FROM tournaments WHERE id=?').get(short(id, 'tournamentId'));
  const eligible = (row) => row && row.private === 1 && row.chip_economy === 1 && row.enabled === 1 && Number.isSafeInteger(row.owner_id) && row.status === 'registering' && Date.parse(row.start_at) > now();
  const knownUser = (id) => { integer(id, 'userId'); if (!db.prepare('SELECT id FROM users WHERE id=?').get(id)) fail('User not found.', 404); };
  const op = (actor, key, kind, payload) => {
    short(key, 'idempotency key'); const old = db.prepare('SELECT * FROM organizer_chip_ticket_operations WHERE actor_id=? AND operation_key=?').get(actor, key);
    if (!old) return null; if (old.kind !== kind || old.payload !== payload) fail('Idempotency key already used with different details.', 409, 'idempotency_conflict'); return JSON.parse(old.result);
  };
  const record = (actor, key, kind, payload, result) => { db.prepare('INSERT INTO organizer_chip_ticket_operations VALUES (?,?,?,?,?,?)').run(actor, key, kind, payload, JSON.stringify(result), stamp()); return result; };
  const ticket = (id) => db.prepare('SELECT * FROM organizer_chip_tickets WHERE id=?').get(short(id, 'ticketId'));

  const issueTicket = ({ userId, tournamentId, idempotencyKey }) => transaction(db, () => {
    active(userId); const payload = String(tournamentId), old = op(userId, idempotencyKey, 'ticket_issue', payload); if (old) return old;
    const event = tournament(tournamentId); if (!eligible(event)) fail('Eligible private organizer tournament required.', 409, 'event_not_eligible');
    chips.assertSessionCreditUnlocked(event.owner_id, userId);
    if (String(event.mode || 'STANDARD') === 'SATELLITE') fail('Cash Chip satellites require a bound target ticket and are not configured.', 409, 'event_mode_unsupported');
    const buyin = integer(event.buyin, 'buyin'), fee = nonnegative(event.fee, 'fee'), price = buyin + fee, id = randomUUID();
    chips.moveInTransaction({ organizerId: event.owner_id, from: `wallet:${userId}`, to: `ticket:${id}`, amount: price, kind: 'ticket_issue', reference: `ticket:${id}:issue` });
    db.prepare('INSERT INTO organizer_chip_tickets(id,organizer_id,tournament_id,holder_id,buyin,fee,price,starting_stack,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, event.owner_id, event.id, userId, buyin, fee, price, integer(event.starting_stack, 'starting_stack'), 'issued', stamp(), stamp());
    return record(userId, idempotencyKey, 'ticket_issue', payload, { id });
  });
  const transferTicket = ({ userId, ticketId, toUserId, idempotencyKey }) => transaction(db, () => {
    active(userId); active(toUserId); const payload = JSON.stringify({ ticketId, toUserId }), old = op(userId, idempotencyKey, 'ticket_transfer', payload); if (old) return old;
    const row = ticket(ticketId); if (!row || row.holder_id !== userId) fail('Ticket not found.', 404, 'ticket_not_found');
    if (row.state !== 'issued') fail('Only an issued ticket can be transferred.', 409, 'ticket_not_transferable'); if (userId === toUserId) fail('Choose another holder.');
    chips.assertSessionCreditUnlocked(row.organizer_id, userId, toUserId);
    db.prepare('UPDATE organizer_chip_tickets SET holder_id=?,updated_at=? WHERE id=?').run(toUserId, stamp(), row.id);
    return record(userId, idempotencyKey, 'ticket_transfer', payload, { id: row.id, holder_id: toUserId });
  });
  const redeemTicket = ({ userId, ticketId }) => transaction(db, () => {
    active(userId); const row = ticket(ticketId); if (!row || row.holder_id !== userId) fail('Ticket not found.', 404, 'ticket_not_found');
    if (row.state === 'redeemed') return { id: row.id, tournament_id: row.tournament_id, replayed: true };
    if (row.state !== 'issued') fail('Ticket is not redeemable.', 409, 'ticket_not_redeemable');
    chips.assertSessionCreditUnlocked(row.organizer_id, userId);
    const event = tournament(row.tournament_id);
    if (!eligible(event) || db.prepare('SELECT 1 FROM organizer_chip_event_states WHERE tournament_id=?').get(event?.id) || event.owner_id !== row.organizer_id || event.buyin !== row.buyin || event.fee !== row.fee || event.starting_stack !== row.starting_stack) fail('Tournament terms no longer match this ticket.', 409, 'ticket_terms_changed');
    if (db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id=? AND user_id=?').get(event.id, userId)) fail('User is already registered.', 409, 'already_registered');
    if (db.prepare('SELECT COUNT(*) n FROM tourney_regs WHERE tournament_id=?').get(event.id).n >= event.max_players) fail('Tournament is full.', 409, 'event_full');
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `ticket:${row.id}`, to: `event:${event.id}`, amount: row.price, kind: 'ticket_redeem', reference: `ticket:${row.id}:redeem:${row.redemptions + 1}` });
    db.prepare('INSERT INTO tourney_regs(tournament_id,user_id) VALUES (?,?)').run(event.id, userId);
    db.prepare('UPDATE tournaments SET entrants=entrants+1 WHERE id=?').run(event.id);
    db.prepare("UPDATE organizer_chip_tickets SET state='redeemed',redemptions=redemptions+1,updated_at=? WHERE id=?").run(stamp(), row.id);
    return { id: row.id, tournament_id: event.id, replayed: false };
  });
  const unregisterTicket = ({ userId, ticketId }) => transaction(db, () => {
    active(userId); const row = ticket(ticketId); if (!row || row.holder_id !== userId) fail('Ticket not found.', 404, 'ticket_not_found');
    chips.assertSessionCreditUnlocked(row.organizer_id, userId);
    const event = tournament(row.tournament_id); if (row.state !== 'redeemed' || event?.status !== 'registering' || db.prepare('SELECT 1 FROM organizer_chip_event_states WHERE tournament_id=?').get(event?.id)) fail('Ticket cannot be restored after the event starts.', 409, 'ticket_not_restorable');
    if (!db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id=? AND user_id=?').get(event.id, userId)) fail('Registration not found.', 409, 'registration_not_found');
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `event:${event.id}`, to: `ticket:${row.id}`, amount: row.price, kind: 'ticket_unregister', reference: `ticket:${row.id}:unregister:${row.redemptions}` });
    db.prepare('DELETE FROM tourney_regs WHERE tournament_id=? AND user_id=?').run(event.id, userId); db.prepare('UPDATE tournaments SET entrants=MAX(0,entrants-1) WHERE id=?').run(event.id);
    db.prepare("UPDATE organizer_chip_tickets SET state='issued',updated_at=? WHERE id=?").run(stamp(), row.id); return { id: row.id, state: 'issued' };
  });
  const startEvent = ({ organizerId, tournamentId }) => transaction(db, () => {
    active(organizerId); const event = tournament(tournamentId); if (!event || event.owner_id !== organizerId || event.private !== 1 || event.chip_economy !== 1 || event.enabled !== 1) fail('Organizer event not found.', 404, 'event_not_found');
    const existing = db.prepare('SELECT * FROM organizer_chip_event_states WHERE tournament_id=?').get(event.id); if (existing) return { tournament_id: event.id, entrants: existing.entrants, prize_pool: existing.prize_pool, bounty_pool: existing.bounty_pool, fee_burned: 0, replayed: true };
    if (event.status !== 'registering') fail('Organizer event not found.', 404, 'event_not_found');
    const mode = String(event.mode || 'STANDARD');
    if (!['STANDARD', 'FLIP', 'BOUNTY', 'MYSTERY'].includes(mode)) fail(mode === 'SATELLITE' ? 'Cash Chip satellites require a bound target ticket and are not configured.' : 'Unsupported Cash Chip tournament mode.', 409, 'event_mode_unsupported');
    const totals = db.prepare("SELECT COUNT(*) entrants,COALESCE(SUM(buyin),0) prize_pool,COALESCE(SUM(fee),0) fee FROM organizer_chip_tickets WHERE organizer_id=? AND tournament_id=? AND state='redeemed'").get(organizerId, event.id);
    const registrations = db.prepare('SELECT COUNT(*) n FROM tourney_regs WHERE tournament_id=?').get(event.id).n;
    const holderMismatch = db.prepare(`SELECT 1 FROM (
      SELECT holder_id user_id FROM organizer_chip_tickets WHERE organizer_id=? AND tournament_id=? AND state='redeemed'
      EXCEPT SELECT user_id FROM tourney_regs WHERE tournament_id=?
      UNION ALL
      SELECT user_id FROM tourney_regs WHERE tournament_id=?
      EXCEPT SELECT holder_id FROM organizer_chip_tickets WHERE organizer_id=? AND tournament_id=? AND state='redeemed'
    ) LIMIT 1`).get(organizerId, event.id, event.id, event.id, organizerId, event.id);
    if (registrations !== totals.entrants || event.entrants !== totals.entrants || holderMismatch || db.prepare("SELECT 1 FROM organizer_chip_tickets WHERE tournament_id=? AND state='redeemed' AND (buyin<>? OR fee<>? OR starting_stack<>?) LIMIT 1").get(event.id, event.buyin, event.fee, event.starting_stack)) fail('Ticket registrations or terms do not reconcile.', 409, 'event_not_reconciled');
    if (totals.entrants < 2) fail('At least two redeemed tickets are required.', 409, 'event_needs_players');
    const fee = totals.fee;
    if (fee) chips.moveInTransaction({ organizerId, from: `event:${event.id}`, to: 'burn', amount: fee, kind: 'event_fee', reference: `event:${event.id}:fees` });
    const bounty = mode === 'BOUNTY' || mode === 'MYSTERY' ? integer(event.bounty, 'bounty') : 0;
    const bountyPool = bounty ? totals.entrants * bounty * (mode === 'MYSTERY' ? 10 : 1) : 0;
    if (!Number.isSafeInteger(bountyPool) || bountyPool > 9_000_000_000) fail('Bounty reserve is too large.');
    if (bountyPool) chips.moveInTransaction({ organizerId, from: `wallet:${organizerId}`, to: `event:${event.id}-bounty`, amount: bountyPool, kind: 'bounty_reserve', reference: `event:${event.id}:bounty-reserve` });
    for (const unused of db.prepare("SELECT * FROM organizer_chip_tickets WHERE organizer_id=? AND tournament_id=? AND state='issued'").all(organizerId, event.id)) {
      chips.moveInTransaction({ organizerId, from: `ticket:${unused.id}`, to: `wallet:${unused.holder_id}`, amount: unused.price, kind: 'ticket_start_refund', reference: `ticket:${unused.id}:start-refund` });
      db.prepare("UPDATE organizer_chip_tickets SET state='refunded',updated_at=? WHERE id=?").run(stamp(), unused.id);
    }
    const contract = JSON.stringify({ buyin: event.buyin, fee: event.fee, starting_stack: event.starting_stack, mode, bounty, entrants: totals.entrants, prize_pool: totals.prize_pool, bounty_pool: bountyPool });
    db.prepare('INSERT INTO organizer_chip_event_states VALUES (?,?,?,?,?,?,?,?,0,NULL)').run(event.id, organizerId, mode, totals.entrants, totals.prize_pool, bountyPool, contract, stamp());
    return { tournament_id: event.id, entrants: totals.entrants, prize_pool: totals.prize_pool, bounty_pool: bountyPool, fee_burned: fee, replayed: false };
  });
  const award = ({ organizerId, tournamentId, userId, amount, payoutId }) => transaction(db, () => {
    knownUser(organizerId); knownUser(userId); integer(amount, 'amount'); short(payoutId, 'payoutId');
    if (!db.prepare("SELECT 1 FROM organizer_chip_tickets WHERE organizer_id=? AND tournament_id=? AND holder_id=? AND state IN ('redeemed','consumed')").get(organizerId, tournamentId, userId)) fail('Payout recipient did not enter this event.', 409, 'event_participant_required');
    const state = db.prepare('SELECT * FROM organizer_chip_event_states WHERE tournament_id=? AND organizer_id=?').get(short(tournamentId, 'tournamentId'), organizerId); if (!state) fail('Started open event required.', 409, 'event_not_started');
    const reference = `event:${state.tournament_id}:award:${payoutId}`;
    if (state.closed_at) {
      const old = db.prepare('SELECT payload FROM organizer_chip_journals WHERE organizer_id=? AND reference=?').get(organizerId, reference);
      const payload = JSON.stringify({ from: `event:${state.tournament_id}`, to: `wallet:${userId}`, amount, kind: 'event_award' });
      if (!old || old.payload !== payload) fail('Closed event payouts cannot be changed.', 409, 'event_closed');
      return { applied: false, balance: chips.balance(organizerId, userId) };
    }
    const moved = chips.moveInTransaction({ organizerId, from: `event:${state.tournament_id}`, to: `wallet:${userId}`, amount, kind: 'event_award', reference });
    if (moved.applied) db.prepare('UPDATE organizer_chip_event_states SET payout_count=payout_count+1 WHERE tournament_id=?').run(state.tournament_id);
    return moved;
  });
  const awardBounty = ({ organizerId, tournamentId, userId, bustedUserId, amount, shares = [{ userId, amount }] }) => transaction(db, () => {
    knownUser(organizerId); knownUser(bustedUserId); integer(amount, 'amount');
    if (!Array.isArray(shares) || !shares.length || shares.length > 10) fail('A bounded bounty split is required.');
    const ids = new Set();
    const plan = shares.map((share, index) => {
      knownUser(share?.userId); nonnegative(share.amount, 'share amount');
      if (share.userId === bustedUserId) fail('A player cannot collect their own bounty.', 409, 'bounty_self_award');
      if (ids.has(share.userId)) fail('Duplicate bounty recipient.');
      ids.add(share.userId);
      if (share.amount !== Math.floor(amount / shares.length) + (index < amount % shares.length ? 1 : 0)) fail('Bounty shares must split the draw equally, with whole-chip remainders.');
      return { userId: share.userId, amount: share.amount };
    });
    for (const id of [...ids, bustedUserId]) if (!db.prepare("SELECT 1 FROM organizer_chip_tickets WHERE organizer_id=? AND tournament_id=? AND holder_id=? AND state IN ('redeemed','consumed')").get(organizerId, tournamentId, id)) fail('Bounty participants did not enter this event.', 409, 'event_participant_required');
    const state = db.prepare('SELECT * FROM organizer_chip_event_states WHERE tournament_id=? AND organizer_id=?').get(short(tournamentId, 'tournamentId'), organizerId);
    if (!state || !['BOUNTY', 'MYSTERY'].includes(state.mode)) fail('Started bounty event required.', 409, 'bounty_not_available');
    const base = JSON.parse(state.contract).bounty;
    if (!(state.mode === 'MYSTERY' ? mysteryBountyAmounts(base).includes(amount) : amount === base)) fail('Bounty amount does not match the event contract.', 409, 'bounty_amount_mismatch');
    const reference = `event:${state.tournament_id}:bounty:${bustedUserId}`;
    const payload = JSON.stringify({ amount, shares: plan });
    const old = db.prepare('SELECT payload,kind FROM organizer_chip_ticket_operations WHERE actor_id=? AND operation_key=?').get(organizerId, reference);
    if (old) {
      if (old.kind !== 'bounty_award' || old.payload !== payload) fail('Bounty payout cannot be changed.', 409, 'reference_conflict');
      return { applied: false };
    }
    // Keep old single-winner journal references authoritative across upgrades.
    const legacy = db.prepare('SELECT payload FROM organizer_chip_journals WHERE organizer_id=? AND reference=?').get(organizerId, reference);
    if (legacy) {
      if (plan.length !== 1 || legacy.payload !== JSON.stringify({ from: `event:${state.tournament_id}-bounty`, to: `wallet:${plan[0].userId}`, amount, kind: 'bounty_award' })) fail('Bounty payout cannot be changed.', 409, 'reference_conflict');
      return { applied: false };
    }
    if (state.closed_at) fail('Started bounty event required.', 409, 'bounty_not_available');
    for (const share of plan) if (share.amount > 0) chips.moveInTransaction({ organizerId, from: `event:${state.tournament_id}-bounty`,
      to: `wallet:${share.userId}`, amount: share.amount, kind: 'bounty_award',
      reference: plan.length === 1 ? reference : `${reference}:share:${share.userId}` });
    return record(organizerId, reference, 'bounty_award', payload, { applied: true });
  });
  const burnRemainder = ({ organizerId, tournamentId }) => transaction(db, () => {
    knownUser(organizerId); const state = db.prepare('SELECT * FROM organizer_chip_event_states WHERE tournament_id=? AND organizer_id=?').get(short(tournamentId, 'tournamentId'), organizerId);
    if (!state) fail('Organizer event not found.', 404, 'event_not_found'); if (state.closed_at) return { burned: 0, bounty_returned: 0, replayed: true };
    const amount = db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(organizerId, `event:${state.tournament_id}`)?.balance || 0;
    const bounty = db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(organizerId, `event:${state.tournament_id}-bounty`)?.balance || 0;
    if (amount) chips.moveInTransaction({ organizerId, from: `event:${state.tournament_id}`, to: 'burn', amount, kind: 'event_remainder', reference: `event:${state.tournament_id}:remainder` });
    if (bounty) chips.moveInTransaction({ organizerId, from: `event:${state.tournament_id}-bounty`, to: `wallet:${organizerId}`, amount: bounty, kind: 'bounty_return', reference: `event:${state.tournament_id}:bounty-return` });
    db.prepare('UPDATE organizer_chip_event_states SET closed_at=? WHERE tournament_id=?').run(stamp(), state.tournament_id);
    db.prepare("UPDATE organizer_chip_tickets SET state='consumed',updated_at=? WHERE tournament_id=? AND state='redeemed'").run(stamp(), state.tournament_id);
    return { burned: amount, bounty_returned: bounty, replayed: false };
  });
  const cancelEvent = ({ organizerId, tournamentId }) => transaction(db, () => {
    knownUser(organizerId); const event = tournament(tournamentId); const state = db.prepare('SELECT * FROM organizer_chip_event_states WHERE tournament_id=?').get(String(tournamentId));
    if (event?.owner_id === organizerId && event.status === 'cancelled') return { refunded: 0 };
    if (!event || event.chip_economy !== 1 || event.status !== 'registering' || event.owner_id !== organizerId || state) fail('Only an unstarted organizer event without payouts can be cancelled.', 409, 'event_not_cancellable');
    const rows = db.prepare("SELECT * FROM organizer_chip_tickets WHERE organizer_id=? AND tournament_id=? AND state IN ('issued','redeemed')").all(organizerId, event.id);
    for (const row of rows) {
      chips.moveInTransaction({ organizerId, from: row.state === 'issued' ? `ticket:${row.id}` : `event:${event.id}`, to: `wallet:${row.holder_id}`, amount: row.price, kind: 'event_cancel_refund', reference: `ticket:${row.id}:cancel` });
      if (row.state === 'redeemed') db.prepare('DELETE FROM tourney_regs WHERE tournament_id=? AND user_id=?').run(event.id, row.holder_id);
      db.prepare("UPDATE organizer_chip_tickets SET state='refunded',updated_at=? WHERE id=?").run(stamp(), row.id);
    }
    db.prepare("UPDATE tournaments SET status='cancelled',entrants=0 WHERE id=?").run(event.id); return { refunded: rows.length };
  });

  const requestBuyback = ({ userId, organizerId, amount, paymentAmount, paymentCurrency, paymentDetails, idempotencyKey }) => transaction(db, () => {
    active(userId); active(organizerId); if (userId === organizerId) fail('Choose a different organizer for buyback.'); integer(amount, 'amount'); paymentAmount = validatePaymentAmount(paymentAmount); paymentCurrency = validateCurrency(paymentCurrency); paymentDetails = validatePaymentText(paymentDetails, 'paymentDetails', 1000);
    const payload = JSON.stringify({ organizerId, amount, paymentAmount, paymentCurrency, paymentDetails }), old = op(userId, idempotencyKey, 'buyback_request', payload); if (old) return old;
    const id = randomUUID(); chips.moveInTransaction({ organizerId, from: `wallet:${userId}`, to: `payout:${id}`, amount, kind: 'buyback_request', reference: `buyback:${id}:request` });
    db.prepare("INSERT INTO organizer_chip_buybacks(id,organizer_id,requester_id,chips,payment_amount,payment_currency,payment_details,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'requested',?,?)").run(id, organizerId, userId, amount, paymentAmount, paymentCurrency, paymentDetails, stamp(), stamp());
    return record(userId, idempotencyKey, 'buyback_request', payload, { id });
  });
  const acceptBuyback = ({ userId, buybackId }) => transaction(db, () => {
    active(userId); const row = db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(short(buybackId, 'buybackId')); if (!row || row.organizer_id !== userId) fail('Buyback not found.', 404, 'buyback_not_found');
    if (row.processing_at) return row;
    if (row.state !== 'requested') fail('Only a requested buyback can be accepted.', 409, 'buyback_state');
    db.prepare('UPDATE organizer_chip_buybacks SET processing_at=?,updated_at=? WHERE id=?').run(stamp(), stamp(), row.id);
    return db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(row.id);
  });
  const reportBuyback = ({ userId, buybackId, receipt, paymentAmount, paymentCurrency, paymentNetwork, paymentDetails }) => transaction(db, () => {
    active(userId); const row = db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(short(buybackId, 'buybackId')); if (!row || row.organizer_id !== userId) fail('Buyback not found.', 404, 'buyback_not_found');
    receipt = short(receipt, 'receipt'); paymentAmount = validatePaymentAmount(paymentAmount); paymentCurrency = validateCurrency(paymentCurrency); paymentNetwork = validatePaymentText(paymentNetwork, 'paymentNetwork', 80); paymentDetails = validatePaymentText(paymentDetails, 'paymentDetails', 1000);
    if (paymentAmount !== row.payment_amount || paymentCurrency !== row.payment_currency) fail('Payment must match the agreed buyback quote.', 409, 'buyback_quote_mismatch');
    if (row.state === 'reported') {
      if (row.receipt !== receipt || row.report_amount !== paymentAmount || row.report_currency !== paymentCurrency || row.report_network !== paymentNetwork || row.report_details !== paymentDetails) fail('Reported payment details cannot be changed.', 409, 'buyback_state');
      return row;
    }
    if (row.state !== 'requested') fail('Only a requested buyback can be reported.', 409, 'buyback_state');
    if (!row.processing_at) fail('Accept the buyback before sending or reporting payment.', 409, 'buyback_not_accepted');
    try { db.prepare("UPDATE organizer_chip_buybacks SET state='reported',receipt=?,report_amount=?,report_currency=?,report_network=?,report_details=?,updated_at=? WHERE id=?").run(receipt, paymentAmount, paymentCurrency, paymentNetwork, paymentDetails, stamp(), row.id); }
    catch (error) { if (/UNIQUE/.test(String(error))) fail('Payment receipt is already used.', 409, 'receipt_conflict'); throw error; }
    return db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(row.id);
  });
  const confirmBuyback = ({ userId, buybackId }) => transaction(db, () => {
    active(userId); const row = db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(short(buybackId, 'buybackId')); if (!row || row.requester_id !== userId) fail('Buyback not found.', 404, 'buyback_not_found');
    if (row.state === 'paid') return row; if (row.state !== 'reported') fail('Only a reported payment can be confirmed.', 409, 'buyback_state');
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `payout:${row.id}`, to: `wallet:${row.organizer_id}`, amount: row.chips, kind: 'buyback_paid', reference: `buyback:${row.id}:paid` });
    db.prepare("UPDATE organizer_chip_buybacks SET state='paid',updated_at=? WHERE id=?").run(stamp(), row.id); return db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(row.id);
  });
  const refundBuyback = ({ userId, buybackId, action }) => transaction(db, () => {
    active(userId); const row = db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(short(buybackId, 'buybackId')); if (!row || (action === 'cancel' ? row.requester_id : row.organizer_id) !== userId) fail('Buyback not found.', 404, 'buyback_not_found');
    if (row.state === (action === 'cancel' ? 'cancelled' : 'rejected')) return row;
    if (row.state !== 'requested') fail('Reported buybacks remain locked for dispute resolution.', 409, 'buyback_state');
    if (action === 'cancel' && row.processing_at) fail('The organizer is processing this payment; cancellation is locked.', 409, 'buyback_processing');
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `payout:${row.id}`, to: `wallet:${row.requester_id}`, amount: row.chips, kind: `buyback_${action}`, reference: `buyback:${row.id}:${action}` });
    db.prepare('UPDATE organizer_chip_buybacks SET state=?,updated_at=? WHERE id=?').run(action === 'cancel' ? 'cancelled' : 'rejected', stamp(), row.id); return db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(row.id);
  });
  const resolveBuyback = ({ adminId, buybackId, resolution, reason }) => transaction(db, () => {
    active(adminId);
    if (!db.prepare('SELECT id FROM users WHERE id=? AND is_admin=1').get(adminId)) fail('Private operator required.', 403);
    if (!['paid', 'refund'].includes(resolution)) fail('Invalid resolution.');
    reason = validatePaymentText(reason, 'reason', 2000);
    const row = db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(short(buybackId, 'buybackId'));
    if (!row) fail('Buyback not found.', 404);
    const finalState = resolution === 'paid' ? 'paid' : 'rejected';
    if (row.state === finalState) return row;
    if (!['reported', 'disputed'].includes(row.state)) fail('Only a reported or disputed payment can be resolved.', 409);
    chips.moveInTransaction({ organizerId: row.organizer_id, from: `payout:${row.id}`, to: `wallet:${resolution === 'paid' ? row.organizer_id : row.requester_id}`,
      amount: row.chips, kind: 'buyback_resolution', reference: `buyback:${row.id}:resolution` });
    db.prepare('UPDATE organizer_chip_buybacks SET state=?,updated_at=? WHERE id=?').run(finalState, stamp(), row.id);
    db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(String(adminId), 'organizer_buyback_resolved', JSON.stringify({ buybackId, resolution, reason }));
    return db.prepare('SELECT * FROM organizer_chip_buybacks WHERE id=?').get(row.id);
  });
  const resolveEvent = ({ adminId, tournamentId, awards, reason }) => transaction(db, () => {
    active(adminId);
    if (!db.prepare('SELECT id FROM users WHERE id=? AND is_admin=1').get(adminId)) fail('Private operator required.', 403);
    reason = validatePaymentText(reason, 'reason', 2000);
    if (reason.length < 8) fail('Document the reconciliation evidence.');
    if (!Array.isArray(awards) || awards.length > 1000) fail('A bounded award plan is required.');
    const recipients = new Set();
    const plan = awards.map((entry) => {
      if (!entry || Object.keys(entry).some((key) => !['userId', 'amount'].includes(key))) fail('Invalid award details.');
      integer(entry.userId, 'userId'); integer(entry.amount, 'amount');
      if (recipients.has(entry.userId)) fail('Duplicate payout recipient.');
      recipients.add(entry.userId); return { userId: entry.userId, amount: entry.amount };
    });
    const key = `event-recovery:${short(tournamentId, 'tournamentId')}`;
    const payload = JSON.stringify({ tournamentId, awards: plan, reason });
    const old = op(adminId, key, 'event_recovery', payload); if (old) return old;
    const event = tournament(tournamentId);
    if (!event || event.chip_economy !== 1 || event.status !== 'paused') fail('Paused Cash Chip event required.', 409);
    const remaining = db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(event.owner_id, `event:${event.id}`)?.balance || 0;
    const total = plan.reduce((sum, entry) => sum + entry.amount, 0);
    if (!Number.isSafeInteger(total) || total !== remaining) fail('The plan must distribute exactly the remaining prize escrow.', 409);
    for (const entry of plan) award({ organizerId: event.owner_id, tournamentId: event.id, ...entry, payoutId: `recovery:${entry.userId}` });
    burnRemainder({ organizerId: event.owner_id, tournamentId: event.id });
    db.prepare("UPDATE tournaments SET status='completed' WHERE id=?").run(event.id);
    db.prepare('DELETE FROM tourney_regs WHERE tournament_id=?').run(event.id);
    db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(String(adminId), 'organizer_event_resolved', payload);
    return record(adminId, key, 'event_recovery', payload, { tournament_id: event.id, distributed: total, state: 'completed' });
  });
  const list = (userId) => { active(userId); return { tickets: db.prepare('SELECT * FROM organizer_chip_tickets WHERE holder_id=? ORDER BY created_at DESC').all(userId), buybacks: db.prepare('SELECT * FROM organizer_chip_buybacks WHERE requester_id=? OR organizer_id=? ORDER BY created_at DESC').all(userId, userId) }; };
  const eligibleTournaments = (userId = null) => {
    if (userId == null) return [];
    integer(userId, 'userId');
    return db.prepare(`SELECT DISTINCT t.* FROM tournaments t
      LEFT JOIN organizer_chip_tickets k ON k.tournament_id=t.id AND k.holder_id=?
      WHERE t.private=1 AND t.chip_economy=1 AND t.enabled=1 AND t.owner_id IS NOT NULL AND t.status='registering'
      AND (t.owner_id=? OR k.id IS NOT NULL OR EXISTS (SELECT 1 FROM organizer_chip_accounts a WHERE a.organizer_id=t.owner_id AND a.account_key=printf('wallet:%d',?) AND a.balance>0))
      AND (t.start_at>? OR k.id IS NOT NULL) ORDER BY t.start_at`).all(userId, userId, userId, stamp());
  };
  return { resolveEvent, resolveBuyback, issueTicket, transferTicket, redeemTicket, unregisterTicket, startEvent, award, awardBounty, burnRemainder, cancelEvent, requestBuyback, acceptBuyback, reportBuyback, confirmBuyback, cancelBuyback: (args) => refundBuyback({ ...args, action: 'cancel' }), rejectBuyback: (args) => refundBuyback({ ...args, action: 'reject' }), list, eligibleTournaments };
}
