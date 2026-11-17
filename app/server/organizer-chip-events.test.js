// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerChips } from './organizer-chips.js';
import { createOrganizerChipEvents } from './organizer-chip-events.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT,is_admin INTEGER DEFAULT 0); INSERT INTO users VALUES (1,0,NULL,1),(2,0,NULL,0),(3,0,NULL,0),(4,0,NULL,0);
    CREATE TABLE audit_log(actor TEXT,action TEXT,detail TEXT);
    CREATE TABLE tournaments(id TEXT PRIMARY KEY,name TEXT,buyin INTEGER,fee INTEGER,start_at TEXT,status TEXT, chip_economy INTEGER DEFAULT 1, enabled INTEGER DEFAULT 1, max_players INTEGER DEFAULT 1000,entrants INTEGER,starting_stack INTEGER,owner_id INTEGER,private INTEGER,mode TEXT,bounty INTEGER,ticket TEXT);
    CREATE TABLE tourney_regs(tournament_id TEXT,user_id INTEGER,PRIMARY KEY(tournament_id,user_id));
    INSERT INTO tournaments(id,name,buyin,fee,start_at,status,chip_economy,enabled,max_players,entrants,starting_stack,owner_id,private,mode,bounty,ticket)
      VALUES ('t1','Private Cup',1000,100,'2027-01-01T00:00:00.000Z','registering',1,1,1000,0,10000,1,1,'STANDARD',0,'');
  `);
  const chips = createOrganizerChips({ db, now: () => Date.parse('2026-01-01T00:00:00Z') });
  db.prepare('INSERT INTO organizer_chip_accounts VALUES (?,?,?)').run(1, 'wallet:2', 10000);
  db.prepare('INSERT INTO organizer_chip_accounts VALUES (?,?,?)').run(1, 'wallet:1', 0);
  return { db, chips, events: createOrganizerChipEvents({ db, chips, now: () => Date.parse('2026-01-01T00:00:00Z') }) };
}

test('ticket issue, transfer, redeem, unregister and current-term checks conserve scoped chips', () => {
  const f = fixture();
  const issued = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'issue-1' });
  assert.deepEqual(f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'issue-1' }), issued);
  assert.equal(f.chips.balance(1, 2), 8900);
  f.events.transferTicket({ userId: 2, ticketId: issued.id, toUserId: 3, idempotencyKey: 'transfer-1' });
  assert.throws(() => f.events.redeemTicket({ userId: 2, ticketId: issued.id }), (error) => error.code === 'ticket_not_found');
  assert.equal(f.events.redeemTicket({ userId: 3, ticketId: issued.id }).replayed, false);
  assert.equal(f.db.prepare('SELECT entrants FROM tournaments WHERE id=?').get('t1').entrants, 1);
  assert.ok(f.db.prepare('SELECT 1 FROM tourney_regs WHERE tournament_id=? AND user_id=?').get('t1', 3));
  assert.equal(f.events.unregisterTicket({ userId: 3, ticketId: issued.id }).state, 'issued');
  assert.equal(f.db.prepare('SELECT entrants FROM tournaments WHERE id=?').get('t1').entrants, 0);
  f.db.prepare('UPDATE tournaments SET fee=101 WHERE id=?').run('t1');
  assert.throws(() => f.events.redeemTicket({ userId: 3, ticketId: issued.id }), (error) => error.code === 'ticket_terms_changed');
});

test('ticket can redeem and unregister repeatedly with unique escrow references', () => {
  const f = fixture(), issued = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'repeat-issue' });
  for (let cycle = 0; cycle < 2; cycle += 1) {
    assert.equal(f.events.redeemTicket({ userId: 2, ticketId: issued.id }).replayed, false);
    assert.equal(f.events.unregisterTicket({ userId: 2, ticketId: issued.id }).state, 'issued');
  }
  assert.equal(f.db.prepare('SELECT redemptions FROM organizer_chip_tickets WHERE id=?').get(issued.id).redemptions, 2);
  assert.equal(f.db.prepare('SELECT entrants FROM tournaments WHERE id=?').get('t1').entrants, 0);
});

test('event fees burn separately, awards cannot exceed reserved pool, and cancellation refunds current holders once', () => {
  const f = fixture();
  const one = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'i1' });
  const two = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'i2' });
  const unused = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'unused' });
  f.events.transferTicket({ userId: 2, ticketId: two.id, toUserId: 3, idempotencyKey: 'x2' });
  f.events.redeemTicket({ userId: 2, ticketId: one.id }); f.events.redeemTicket({ userId: 3, ticketId: two.id });
  const started = f.events.startEvent({ organizerId: 1, tournamentId: 't1' }); assert.equal(started.fee_burned, 200); assert.equal(started.prize_pool, 2000); assert.equal(started.entrants, 2);
  assert.equal(f.db.prepare('SELECT state FROM organizer_chip_tickets WHERE id=?').get(unused.id).state, 'refunded');
  f.db.prepare("UPDATE tournaments SET status='running' WHERE id='t1'").run();
  assert.equal(f.events.startEvent({ organizerId: 1, tournamentId: 't1' }).replayed, true);
  assert.equal(f.events.award({ organizerId: 1, tournamentId: 't1', userId: 2, amount: 600, payoutId: 'place-1' }).applied, true);
  assert.throws(() => f.events.award({ organizerId: 1, tournamentId: 't1', userId: 2, amount: 1500, payoutId: 'too-much' }), (error) => error.code === 'insufficient_chips');
  assert.equal(f.events.burnRemainder({ organizerId: 1, tournamentId: 't1' }).burned, 1400);
  assert.equal(f.events.award({ organizerId: 1, tournamentId: 't1', userId: 2, amount: 600, payoutId: 'place-1' }).applied, false);
  assert.throws(() => f.events.award({ organizerId: 1, tournamentId: 't1', userId: 2, amount: 601, payoutId: 'place-1' }), (error) => error.code === 'event_closed');

  const f2 = fixture();
  const a = f2.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'a' });
  const b = f2.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'b' });
  f2.events.transferTicket({ userId: 2, ticketId: b.id, toUserId: 3, idempotencyKey: 'b-x' }); f2.events.redeemTicket({ userId: 2, ticketId: a.id });
  assert.equal(f2.events.cancelEvent({ organizerId: 1, tournamentId: 't1' }).refunded, 2);
  assert.equal(f2.chips.balance(1, 2), 8900); assert.equal(f2.chips.balance(1, 3), 1100);
  assert.equal(f2.events.cancelEvent({ organizerId: 1, tournamentId: 't1' }).refunded, 0);
});

test('manual buyback locks chips and only recipient confirmation transfers escrow to organizer', () => {
  const f = fixture();
  assert.throws(() => f.events.requestBuyback({ userId: 2, organizerId: 1, amount: 2500, paymentAmount: '-25', paymentCurrency: 'USD', paymentDetails: 'Bank transfer', idempotencyKey: 'bad-amount' }), /paymentAmount/);
  assert.throws(() => f.events.requestBuyback({ userId: 2, organizerId: 1, amount: 2500, paymentAmount: '25.00', paymentCurrency: '$$$', paymentDetails: 'Bank transfer', idempotencyKey: 'bad-currency' }), /paymentCurrency/);
  const requested = f.events.requestBuyback({ userId: 2, organizerId: 1, amount: 2500, paymentAmount: '25.00', paymentCurrency: 'USD', paymentDetails: 'Bank transfer negotiated directly', idempotencyKey: 'buyback-1' });
  assert.equal(f.chips.balance(1, 2), 7500); assert.equal(f.chips.balance(1, 1), 0);
  assert.throws(() => f.events.confirmBuyback({ userId: 2, buybackId: requested.id }), (error) => error.code === 'buyback_state');
  f.events.reportBuyback({ userId: 1, buybackId: requested.id, receipt: 'provider-receipt-global-1', paymentAmount: '25.00', paymentCurrency: 'USD', paymentNetwork: 'SEPA', paymentDetails: 'Paid manually outside the platform' });
  assert.throws(() => f.events.cancelBuyback({ userId: 2, buybackId: requested.id }), (error) => error.code === 'buyback_state');
  assert.equal(f.events.confirmBuyback({ userId: 2, buybackId: requested.id }).state, 'paid');
  assert.equal(f.chips.balance(1, 1), 2500);
});

test('bounty modes require organizer prefunding, pay by busted user once, and return unused reserve', () => {
  const f = fixture();
  f.db.prepare('UPDATE organizer_chip_accounts SET balance=1000 WHERE organizer_id=1 AND account_key=?').run('wallet:1');
  f.db.prepare("UPDATE tournaments SET mode='BOUNTY',bounty=50 WHERE id='t1'").run();
  const one = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'bo1' });
  const two = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'bo2' });
  f.events.transferTicket({ userId: 2, ticketId: two.id, toUserId: 3, idempotencyKey: 'bo-x' });
  f.events.redeemTicket({ userId: 2, ticketId: one.id }); f.events.redeemTicket({ userId: 3, ticketId: two.id });
  assert.equal(f.events.startEvent({ organizerId: 1, tournamentId: 't1' }).bounty_pool, 100);
  assert.throws(() => f.events.awardBounty({ organizerId: 1, tournamentId: 't1', userId: 2, bustedUserId: 2, amount: 50 }), (error) => error.code === 'bounty_self_award');
  assert.equal(f.events.awardBounty({ organizerId: 1, tournamentId: 't1', userId: 2, bustedUserId: 3, amount: 50 }).applied, true);
  assert.throws(() => f.events.awardBounty({ organizerId: 1, tournamentId: 't1', userId: 2, bustedUserId: 3, amount: 40 }), (error) => error.code === 'bounty_amount_mismatch');
  assert.equal(f.events.burnRemainder({ organizerId: 1, tournamentId: 't1' }).bounty_returned, 50);
  assert.equal(f.chips.balance(1, 1), 950);
});

test('satellite events are rejected instead of minting global tickets', () => {
  const f = fixture();
  f.db.prepare("UPDATE tournaments SET mode='SATELLITE',ticket='target' WHERE id='t1'").run();
  assert.throws(() => f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'sa1' }), (error) => error.code === 'event_mode_unsupported');
});

test('start requires exact redeemed-holder registration set and entrants count', () => {
  const f = fixture(), one = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'set-1' }), two = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'set-2' });
  f.events.transferTicket({ userId: 2, ticketId: two.id, toUserId: 3, idempotencyKey: 'set-x' });
  f.events.redeemTicket({ userId: 2, ticketId: one.id }); f.events.redeemTicket({ userId: 3, ticketId: two.id });
  f.db.prepare('DELETE FROM tourney_regs WHERE tournament_id=? AND user_id=?').run('t1', 3);
  f.db.prepare('INSERT INTO tourney_regs VALUES (?,?)').run('t1', 4);
  assert.throws(() => f.events.startEvent({ organizerId: 1, tournamentId: 't1' }), (error) => error.code === 'event_not_reconciled');
  f.db.prepare('DELETE FROM tourney_regs WHERE tournament_id=? AND user_id=?').run('t1', 4); f.db.prepare('INSERT INTO tourney_regs VALUES (?,?)').run('t1', 3);
  f.db.prepare("UPDATE tournaments SET entrants=1 WHERE id='t1'").run();
  assert.throws(() => f.events.startEvent({ organizerId: 1, tournamentId: 't1' }), (error) => error.code === 'event_not_reconciled');
});

test('eligible tournament discovery is private to owner, ticket holders, and scoped chip-wallet holders', () => {
  const f = fixture();
  assert.deepEqual(f.events.eligibleTournaments(), []); assert.equal(f.events.eligibleTournaments(4).length, 0);
  assert.equal(f.events.eligibleTournaments(1).length, 1); assert.equal(f.events.eligibleTournaments(2).length, 1);
  f.db.prepare("UPDATE organizer_chip_accounts SET balance=0 WHERE organizer_id=1 AND account_key='wallet:2'").run();
  assert.equal(f.events.eligibleTournaments(2).length, 0);
  f.db.prepare("INSERT INTO organizer_chip_accounts VALUES (1,'wallet:3',1100)").run();
  f.events.issueTicket({ userId: 3, tournamentId: 't1', idempotencyKey: 'discover-ticket' });
  assert.equal(f.events.eligibleTournaments(3).length, 1);
});

test('requested buybacks can only be cancelled by requester or rejected by organizer and receipt is global', () => {
  const f = fixture();
  const cancel = f.events.requestBuyback({ userId: 2, organizerId: 1, amount: 1000, paymentAmount: '10', paymentCurrency: 'EUR', paymentDetails: 'Cash', idempotencyKey: 'cancel' });
  assert.equal(f.events.cancelBuyback({ userId: 2, buybackId: cancel.id }).state, 'cancelled'); assert.equal(f.chips.balance(1, 2), 10000);
  const reject = f.events.requestBuyback({ userId: 2, organizerId: 1, amount: 1000, paymentAmount: '10', paymentCurrency: 'EUR', paymentDetails: 'Cash', idempotencyKey: 'reject' });
  assert.equal(f.events.rejectBuyback({ userId: 1, buybackId: reject.id }).state, 'rejected'); assert.equal(f.chips.balance(1, 2), 10000);
  const first = f.events.requestBuyback({ userId: 2, organizerId: 1, amount: 1000, paymentAmount: '10', paymentCurrency: 'EUR', paymentDetails: 'Cash', idempotencyKey: 'r1' });
  f.events.reportBuyback({ userId: 1, buybackId: first.id, receipt: 'same-receipt', paymentAmount: '10', paymentCurrency: 'EUR', paymentNetwork: 'cash', paymentDetails: 'desk' });
  const second = f.events.requestBuyback({ userId: 2, organizerId: 1, amount: 1000, paymentAmount: '10', paymentCurrency: 'EUR', paymentDetails: 'Cash', idempotencyKey: 'r2' });
  assert.throws(() => f.events.reportBuyback({ userId: 1, buybackId: second.id, receipt: 'same-receipt', paymentAmount: '10', paymentCurrency: 'EUR', paymentNetwork: 'cash', paymentDetails: 'desk' }), (error) => error.code === 'receipt_conflict');
});

test('reported buybacks must match the quote and admin resolution is audited', () => {
  const f = fixture(), requested = f.events.requestBuyback({ userId: 2, organizerId: 1, amount: 1000, paymentAmount: '10.00', paymentCurrency: 'USDT', paymentDetails: 'Agreed transfer', idempotencyKey: 'admin-resolve' });
  assert.throws(() => f.events.reportBuyback({ userId: 1, buybackId: requested.id, receipt: 'quote-wrong', paymentAmount: '11.00', paymentCurrency: 'USDT', paymentNetwork: 'TRC20', paymentDetails: 'sent' }), (error) => error.code === 'buyback_quote_mismatch');
  f.events.reportBuyback({ userId: 1, buybackId: requested.id, receipt: 'quote-right', paymentAmount: '10.00', paymentCurrency: 'USDT', paymentNetwork: 'TRC20', paymentDetails: 'sent' });
  assert.equal(f.events.resolveBuyback({ adminId: 1, buybackId: requested.id, resolution: 'refund', reason: 'Verified payment dispute' }).state, 'rejected');
  const audit = f.db.prepare("SELECT * FROM audit_log WHERE action='organizer_buyback_resolved'").get();
  assert.equal(audit.actor, '1'); assert.match(audit.detail, /Verified payment dispute/);
});

test('paused event recovery requires an audited exact escrow allocation and cannot mint on replay', () => {
  const f = fixture();
  try {
    for (const userId of [2, 3]) {
      if (userId === 3) f.db.prepare("INSERT INTO organizer_chip_accounts VALUES (1,'wallet:3',1100)").run();
      const ticket = f.events.issueTicket({ userId, tournamentId: 't1', idempotencyKey: `recovery-ticket-${userId}` });
      f.events.redeemTicket({ userId, ticketId: ticket.id });
    }
    f.events.startEvent({ organizerId: 1, tournamentId: 't1' });
    f.db.prepare("UPDATE tournaments SET status='paused' WHERE id='t1'").run();
    const plan = { adminId: 1, tournamentId: 't1', awards: [{ userId: 2, amount: 1200 }, { userId: 3, amount: 800 }], reason: 'Verified hand history and player agreement' };
    assert.throws(() => f.events.resolveEvent({ ...plan, adminId: 2 }), (e) => e.status === 403);
    assert.throws(() => f.events.resolveEvent({ ...plan, awards: [{ userId: 2, amount: 2001 }] }), /exactly/);
    assert.throws(() => f.events.resolveEvent({ ...plan, awards: [{ userId: 4, amount: 2000 }] }), /did not enter/);
    assert.equal(f.events.resolveEvent(plan).distributed, 2000);
    assert.equal(f.events.resolveEvent(plan).distributed, 2000);
    assert.equal(f.chips.balance(1, 3), 800);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='organizer_event_resolved'").get().n, 1);
    assert.throws(() => f.events.resolveEvent({ ...plan, awards: [{ userId: 2, amount: 2000 }] }), /different details/);
  } finally { f.db.close(); }
});


test('mystery bounty tiers settle once and reconcile their prefunded reserve', () => {
  for (const [base, amounts] of [[50, [5, 13, 25, 50, 100, 250, 500]], [1, [1, 1, 1, 1, 2, 5, 10]]]) {
    for (const amount of amounts) {
      const f = fixture();
      try {
        f.db.prepare("UPDATE organizer_chip_accounts SET balance=1000 WHERE account_key='wallet:1'").run();
        f.db.prepare("UPDATE tournaments SET mode='MYSTERY',bounty=? WHERE id='t1'").run(base);
        const one = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'm1' });
        const two = f.events.issueTicket({ userId: 2, tournamentId: 't1', idempotencyKey: 'm2' });
        f.events.transferTicket({ userId: 2, ticketId: two.id, toUserId: 3, idempotencyKey: 'mx' });
        f.events.redeemTicket({ userId: 2, ticketId: one.id });
        f.events.redeemTicket({ userId: 3, ticketId: two.id });
        const reserve = f.events.startEvent({ organizerId: 1, tournamentId: 't1' }).bounty_pool;
        assert.equal(reserve, base * 20);
        const payout = { organizerId: 1, tournamentId: 't1', userId: 2, bustedUserId: 3, amount };
        assert.throws(() => f.events.awardBounty({ ...payout, amount: base * 10 + 1 }), error => error.code === 'bounty_amount_mismatch');
        assert.equal(f.events.awardBounty(payout).applied, true);
        assert.equal(f.events.awardBounty(payout).applied, false);
        const other = amounts.find(value => value !== amount);
        assert.throws(() => f.events.awardBounty({ ...payout, amount: other }), error => error.code === 'reference_conflict');
        assert.equal(f.events.burnRemainder({ organizerId: 1, tournamentId: 't1' }).bounty_returned, reserve - amount);
        assert.equal(f.chips.balance(1, 1), 1000 - amount);
        assert.equal(f.db.prepare('SELECT SUM(balance) total FROM organizer_chip_accounts').get().total, 11000);
      } finally { f.db.close(); }
    }
  }
});
