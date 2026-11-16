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
  assert.deepEqual(ORGANIZER_TARIFFS, { membership: 900, cash_setup: 1000, tournament_setup: 500, spin_setup: 300, reschedule: 100, cash_hour: 500, cash_start: 500 });
});
