// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createOrganizerBilling, ORGANIZER_TARIFFS } from './organizer-billing.js';

const HOUR = 3600000;
function fixture(start = '2026-01-31T12:00:00Z') {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,banned INTEGER DEFAULT 0,deleted_at TEXT,is_admin INTEGER DEFAULT 0); CREATE TABLE audit_log(actor TEXT,action TEXT,detail TEXT); INSERT INTO users VALUES (1,0,NULL,1),(2,0,NULL,0),(3,0,NULL,0)`);
  let time = Date.parse(start);
  return { db, now: () => time, advance: (ms) => { time += ms; }, set: (value) => { time = Date.parse(value); } };
}
const fund = (billing, amount, reference = crypto.randomUUID(), userId = 2) => billing.credit({ userId, amountCents: amount, reference, actor: 1 });
const grantOrganizer = (f, expires = '2027-01-01T00:00:00.000Z', userId = 2) => f.db.prepare('INSERT INTO organizer_billing_memberships VALUES (?,?,1,?)').run(userId, 'organizer', expires);

test('off mode creates directly without billing operations or replay state', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'off' });
  let creates = 0;
  assert.deepEqual(billing.setup({ userId: 2, kind: 'cash', resourceId: 'off-table', idempotencyKey: 'off-1', payload: 'off-payload', create: () => ({ id: `off-${++creates}` }) }), { id: 'off-1' });
  assert.equal(creates, 1); assert.equal(billing.account(2).balance_cents, 0); assert.equal(billing.history(2).length, 0); assert.equal(billing.replay(2, 'off-1', 'off-payload'), null);
});

test('$9 membership uses a calendar month, replays exactly, and roles cannot share a key', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 2700, 'membership-funds');
  const first = billing.subscribe({ userId: 2, role: 'organizer', idempotencyKey: 'member-1' });
  assert.equal(first.expires_at, '2026-02-28T12:00:00.000Z'); assert.deepEqual(billing.subscribe({ userId: 2, role: 'organizer', idempotencyKey: 'member-1' }), first);
  assert.throws(() => billing.subscribe({ userId: 2, role: 'contributor', idempotencyKey: 'member-1' }), (error) => error.code === 'idempotency_conflict');
  f.set('2026-02-20T12:00:00Z');
  assert.equal(billing.subscribe({ userId: 2, role: 'organizer', idempotencyKey: 'member-2' }).expires_at, '2026-03-28T12:00:00.000Z');
  assert.equal(billing.account(2).balance_cents, 900);
});

test('duplicate provider receipts are idempotent only for identical funding details', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  assert.equal(fund(billing, 1500, 'provider-receipt-1').balance_cents, 1500); assert.equal(fund(billing, 1500, 'provider-receipt-1').balance_cents, 1500);
  assert.throws(() => fund(billing, 1600, 'provider-receipt-1'), (error) => error.code === 'reference_conflict');
  assert.throws(() => fund(billing, 1500, 'provider-receipt-1', 3), (error) => error.code === 'reference_conflict');
  assert.equal(billing.history(2).filter((entry) => entry.kind === 'credit_topup').length, 1);
});

test('enforced setup rolls back money and state on create failure and rejects cross-kind replay', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 3000, 'setup-funds'); grantOrganizer(f);
  assert.throws(() => billing.setup({ userId: 2, kind: 'cash', resourceId: 'cash-fail', idempotencyKey: 'setup-1', payload: 'cash-payload', create: () => { throw new Error('create failed'); } }), /create failed/);
  assert.equal(billing.account(2).balance_cents, 3000); assert.equal(billing.history(2).some((entry) => entry.reference === 'setup:2:setup-1'), false);
  const created = billing.setup({ userId: 2, kind: 'cash', resourceId: 'cash-ok', idempotencyKey: 'setup-1', payload: 'cash-payload', create: () => ({ id: 'cash-ok' }) });
  assert.deepEqual(billing.replay(2, 'setup-1', 'cash-payload'), created);
  assert.throws(() => billing.replay(2, 'setup-1', 'other-payload'), (error) => error.code === 'idempotency_conflict');
  assert.throws(() => billing.setup({ userId: 2, kind: 'spin', resourceId: 'spin-no', idempotencyKey: 'setup-1', payload: 'cash-payload', create: () => ({ id: 'spin-no' }) }), (error) => error.code === 'idempotency_conflict');
  assert.equal(billing.account(2).balance_cents, 2000);
});

test('cash charges $5 for the first hour and once at each reached boundary', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 1500, 'cash-funds'); grantOrganizer(f);
  const first = billing.startCash({ userId: 2, tableId: 'cash-1', idempotencyKey: 'cash-start-1' });
  assert.equal(first.active, 1); assert.equal(billing.account(2).balance_cents, 1000); assert.equal(billing.startCash({ userId: 2, tableId: 'cash-1', idempotencyKey: 'cash-start-1' }).paid_until, first.paid_until);
  f.advance(HOUR); assert.equal(billing.canDeal('cash-1'), true); assert.equal(billing.account(2).balance_cents, 500); assert.equal(billing.canDeal('cash-1'), true); billing.tickCash();
  assert.equal(billing.account(2).balance_cents, 500); assert.equal(billing.history(2).filter((entry) => entry.kind === 'cash_hour').length, 2);
});

test('stop and resume within paid time is free, then insufficient credit pauses at boundary', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 500, 'resume-funds'); grantOrganizer(f);
  const first = billing.startCash({ userId: 2, tableId: 'cash-2', idempotencyKey: 'resume-start-1' }); assert.equal(billing.stopCash({ userId: 2, tableId: 'cash-2' }).active, 0);
  f.advance(HOUR / 2); const resumed = billing.startCash({ userId: 2, tableId: 'cash-2', idempotencyKey: 'resume-start-2' });
  assert.equal(resumed.active, 1); assert.equal(resumed.paid_until, first.paid_until); assert.equal(billing.account(2).balance_cents, 0);
  f.advance(HOUR / 2); assert.equal(billing.canDeal('cash-2'), false); assert.equal(billing.cashSession(2, 'cash-2').active, 0); assert.equal(billing.history(2).filter((entry) => entry.kind === 'cash_hour').length, 1);
});

test('expired organizer membership pauses an active cash session without another debit', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 1000, 'expiry-funds'); grantOrganizer(f, new Date(f.now() + HOUR / 2).toISOString()); billing.startCash({ userId: 2, tableId: 'cash-expiry', idempotencyKey: 'expiry-start' });
  f.advance(HOUR / 2); assert.equal(billing.canDeal('cash-expiry'), false); assert.equal(billing.cashSession(2, 'cash-expiry').active, 0); assert.equal(billing.account(2).balance_cents, 500);
});

test('ledger insertion failure rolls back canDeal boundary debit and session extension', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 1500, 'trigger-funds'); grantOrganizer(f); const started = billing.startCash({ userId: 2, tableId: 'cash-trigger', idempotencyKey: 'trigger-start' });
  f.db.exec(`CREATE TRIGGER fail_boundary_ledger BEFORE INSERT ON organizer_billing_ledger WHEN NEW.reference LIKE 'cash-boundary:%' BEGIN SELECT RAISE(ABORT,'injected ledger failure'); END`);
  f.advance(HOUR); assert.throws(() => billing.canDeal('cash-trigger'), /injected ledger failure/);
  assert.equal(billing.account(2).balance_cents, 1000); assert.equal(billing.cashSession(2, 'cash-trigger').paid_until, started.paid_until); assert.equal(billing.cashSession(2, 'cash-trigger').active, 1);
});

test('restart pauses an expired session without debit and missed whole hours are never back-billed', () => {
  const f = fixture(); let billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 1500, 'restart-funds'); grantOrganizer(f); billing.startCash({ userId: 2, tableId: 'cash-restart', idempotencyKey: 'restart-start' });
  f.advance(HOUR); billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  assert.equal(billing.cashSession(2, 'cash-restart').active, 0); assert.equal(billing.account(2).balance_cents, 1000);
  billing.startCash({ userId: 2, tableId: 'cash-missed', idempotencyKey: 'missed-start' }); assert.equal(billing.account(2).balance_cents, 500);
  f.advance(2 * HOUR); assert.equal(billing.canDeal('cash-missed'), false); assert.equal(billing.cashSession(2, 'cash-missed').active, 0); assert.equal(billing.account(2).balance_cents, 500);
});

test('published tariffs retain the contracted cent values', () => {
  const { cash_hour_tiers, ...fixed } = ORGANIZER_TARIFFS;
  assert.deepEqual(fixed, { membership: 900, cash_setup: 1000, tournament_setup: 500, spin_setup: 300, reschedule: 100, cash_hour: 500, cash_start: 500 });
  assert.deepEqual(cash_hour_tiers, [
    { through: 50, cents: 500 }, { through: 100, cents: 400 }, { through: 200, cents: 300 },
    { through: 500, cents: 200 }, { through: null, cents: 100 },
  ]);
});

test('lifetime paid cash hours cross every price boundary without retroactive discounts or duplicate renewal', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 200000, 'tier-funds'); grantOrganizer(f);
  billing.startCash({ userId: 2, tableId: 'tier-table', idempotencyKey: 'tier-start' });
  let spent = 0;
  for (let hour = 1; hour <= 501; hour++) {
    if (hour > 1) { f.advance(HOUR); billing.tickCash(); }
    assert.equal(billing.canDeal('tier-table'), true);
    const cents = hour <= 50 ? 500 : hour <= 100 ? 400 : hour <= 200 ? 300 : hour <= 500 ? 200 : 100;
    spent += cents;
    const entry = billing.history(2).find((row) => row.kind === 'cash_hour');
    assert.equal(entry.amount_cents, -cents, `hour ${hour}`);
    assert.deepEqual(JSON.parse(entry.metadata), { paid_hour: hour, rate_cents: cents });
    assert.equal(billing.account(2).cash_usage.paid_hours, hour);
    assert.equal(billing.account(2).balance_cents, 200000 - spent);
  }
  assert.equal(spent, 135100);
  assert.deepEqual(billing.account(2).cash_usage, { paid_hours: 501, next_hour: 502, next_hour_cents: 100 });
  assert.equal(createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' }).account(2).cash_usage.paid_hours, 501, 'restart keeps the lifetime count');
  assert.equal(billing.account(3).cash_usage.next_hour_cents, 500, 'other organizers do not inherit a discount');
  f.db.close();
});

test('multiple cash tables share one hour count; failed charges, free resumes and retries do not advance it', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 49 * 500 + 900 + 400, 'shared-tier-funds'); grantOrganizer(f);
  for (let i = 1; i <= 49; i++) {
    billing.startCash({ userId: 2, tableId: `old-${i}`, idempotencyKey: `old-${i}` });
    billing.stopCash({ userId: 2, tableId: `old-${i}` });
  }
  const a = { userId: 2, tableId: 'a', idempotencyKey: 'start-a' };
  const b = { userId: 2, tableId: 'b', idempotencyKey: 'start-b' };
  billing.startCash(a); billing.startCash(b); billing.startCash(a);
  assert.equal(billing.account(2).cash_usage.paid_hours, 51);
  assert.equal(billing.account(2).balance_cents, 400);
  f.advance(HOUR); billing.tickCash();
  assert.equal(billing.cashSession(2, 'a').active, 1);
  assert.equal(billing.cashSession(2, 'b').active, 0);
  assert.equal(billing.account(2).cash_usage.paid_hours, 52);
  billing.stopCash({ userId: 2, tableId: 'a' });
  billing.startCash({ ...a, idempotencyKey: 'resume-a' });
  assert.equal(billing.account(2).cash_usage.paid_hours, 52);
  assert.throws(() => billing.startCash({ ...b, idempotencyKey: 'unfunded-b' }), /Insufficient/);
  assert.equal(billing.account(2).cash_usage.paid_hours, 52);
  assert.equal(billing.account(2).balance_cents, 0);
  f.db.close();
});

test('service-credit topup refunds reserve available balance and settle externally without another transfer', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 2000, 'provider-refund-source');
  const reserved = billing.reserveCreditRefund({ userId: 2, originalReference: 'provider-refund-source', amountCents: 700, requestId: 'refund-request-1', actor: 1, reason: 'Customer requested a partial refund' });
  assert.equal(reserved.status, 'reserved'); assert.equal(billing.account(2).balance_cents, 1300);
  assert.deepEqual(billing.reserveCreditRefund({ userId: 2, originalReference: 'provider-refund-source', amountCents: 700, requestId: 'refund-request-1', actor: 1, reason: 'Customer requested a partial refund' }), reserved);
  assert.throws(() => billing.reserveCreditRefund({ userId: 2, originalReference: 'provider-refund-source', amountCents: 701, requestId: 'refund-request-1', actor: 1, reason: 'Changed request' }), (error) => error.code === 'refund_conflict');
  const paid = billing.markCreditRefundPaid({ requestId: 'refund-request-1', externalReference: 'processor-refund-1', actor: 1 });
  assert.equal(paid.status, 'paid'); assert.equal(billing.markCreditRefundPaid({ requestId: 'refund-request-1', externalReference: 'processor-refund-1', actor: 1 }).status, 'paid');
  assert.equal(billing.account(2).balance_cents, 1300, 'external payment never credits or debits service credits again');
  assert.equal(billing.history(2).filter((entry) => entry.kind === 'credit_refund_reserved').length, 1);
  assert.equal(billing.getCreditRefund('refund-request-1').external_reference, 'processor-refund-1');
  assert.equal(billing.listCreditRefunds({ userId: 2 }).length, 1);
});

test('refund reservation enforces original topup ownership, remaining value, operators, and available credits', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'off' });
  fund(billing, 1000, 'bounded-source'); fund(billing, 500, 'foreign-source', 3);
  assert.throws(() => billing.reserveCreditRefund({ userId: 2, originalReference: 'foreign-source', amountCents: 100, requestId: 'foreign', actor: 1, reason: 'Wrong customer' }), (error) => error.code === 'refund_source_invalid');
  assert.throws(() => billing.reserveCreditRefund({ userId: 2, originalReference: 'topup:bounded-source', amountCents: 100, requestId: 'canonical-prefix-rejected', actor: 1, reason: 'Only raw provider receipts are accepted' }), (error) => error.code === 'refund_source_invalid');
  assert.throws(() => billing.reserveCreditRefund({ userId: 2, originalReference: 'bounded-source', amountCents: 100, requestId: 'not-operator', actor: 2, reason: 'Unauthorized request' }), (error) => error.code === 'operator_required');
  assert.equal(billing.account(2).balance_cents, 1000, 'invalid operator never reserves credits');
  billing.reserveCreditRefund({ userId: 2, originalReference: 'bounded-source', amountCents: 600, requestId: 'partial-a', actor: 1, reason: 'First partial refund' });
  assert.throws(() => billing.reserveCreditRefund({ userId: 2, originalReference: 'bounded-source', amountCents: 401, requestId: 'over-original', actor: 1, reason: 'Too much against receipt' }), (error) => error.code === 'refund_source_exhausted');
  fund(billing, 800, 'available-source'); f.db.prepare('UPDATE organizer_billing_accounts SET balance_cents=100 WHERE user_id=2').run();
  assert.throws(() => billing.reserveCreditRefund({ userId: 2, originalReference: 'available-source', amountCents: 500, requestId: 'over-balance', actor: 1, reason: 'Not enough unused credits' }), (error) => error.code === 'insufficient_credit');
  f.db.prepare("INSERT INTO organizer_billing_ledger(user_id,kind,amount_cents,reference,metadata,created_at) VALUES (2,'membership',-1,'not-a-topup','{}',?)").run(new Date(f.now()).toISOString());
  assert.throws(() => billing.reserveCreditRefund({ userId: 2, originalReference: 'not-a-topup', amountCents: 1, requestId: 'wrong-kind', actor: 1, reason: 'Wrong ledger kind' }), (error) => error.code === 'refund_source_invalid');
});

test('reserved refunds cancel once with restored credits while paid references remain globally immutable', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 1500, 'cancel-source');
  billing.reserveCreditRefund({ userId: 2, originalReference: 'cancel-source', amountCents: 500, requestId: 'cancel-me', actor: 1, reason: 'Reserve before processor call' });
  const cancelled = billing.cancelCreditRefund({ requestId: 'cancel-me', actor: 1, reason: 'Processor rejected the refund' });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(billing.account(2).balance_cents, 1500);
  assert.equal(billing.cancelCreditRefund({ requestId: 'cancel-me', actor: 1, reason: 'Processor rejected the refund' }).status, 'cancelled');
  assert.throws(() => billing.markCreditRefundPaid({ requestId: 'cancel-me', externalReference: 'cannot-pay-cancelled', actor: 1 }), (error) => error.code === 'refund_state');
  billing.reserveCreditRefund({ userId: 2, originalReference: 'cancel-source', amountCents: 400, requestId: 'paid-one', actor: 1, reason: 'Paid refund one' });
  billing.markCreditRefundPaid({ requestId: 'paid-one', externalReference: 'external-global-1', actor: 1 });
  assert.throws(() => billing.markCreditRefundPaid({ requestId: 'paid-one', externalReference: 'changed-external', actor: 1 }), (error) => error.code === 'refund_conflict');
  billing.reserveCreditRefund({ userId: 2, originalReference: 'cancel-source', amountCents: 300, requestId: 'paid-two', actor: 1, reason: 'Paid refund two' });
  assert.throws(() => billing.markCreditRefundPaid({ requestId: 'paid-two', externalReference: 'external-global-1', actor: 1 }), (error) => error.code === 'external_refund_conflict');
  assert.throws(() => billing.cancelCreditRefund({ requestId: 'paid-one', actor: 1, reason: 'Cannot cancel paid refund' }), (error) => error.code === 'refund_state');
  assert.equal(billing.history(2).filter((entry) => entry.kind === 'credit_refund_cancelled').length, 1);
});

test('financial recovery refunds existing banned payers but never creates accounts for unknown users', () => {
  const f = fixture(), billing = createOrganizerBilling({ db: f.db, now: f.now, mode: 'enforce' });
  fund(billing, 1200, 'closed-payer-source'); f.db.prepare('UPDATE users SET banned=1 WHERE id=2').run();
  const reserved = billing.reserveCreditRefund({ userId: 2, originalReference: 'closed-payer-source', amountCents: 400, requestId: 'closed-cancel', actor: 1, reason: 'Refund a closed payer account' });
  assert.equal(reserved.status, 'reserved');
  assert.equal(billing.cancelCreditRefund({ requestId: 'closed-cancel', actor: 1, reason: 'External processor rejected it' }).status, 'cancelled');
  billing.reserveCreditRefund({ userId: 2, originalReference: 'closed-payer-source', amountCents: 500, requestId: 'closed-paid', actor: 1, reason: 'Refund a closed payer externally' });
  assert.equal(billing.markCreditRefundPaid({ requestId: 'closed-paid', externalReference: 'closed-payer-external-1', actor: 1 }).status, 'paid');
  assert.equal(f.db.prepare('SELECT balance_cents FROM organizer_billing_accounts WHERE user_id=2').get().balance_cents, 700);
  assert.throws(() => billing.reserveCreditRefund({ userId: 999, originalReference: 'closed-payer-source', amountCents: 1, requestId: 'unknown-payer', actor: 1, reason: 'Must not create an account' }), (error) => error.code === 'user_not_found');
  assert.equal(f.db.prepare('SELECT 1 FROM organizer_billing_accounts WHERE user_id=999').get(), undefined);
});
