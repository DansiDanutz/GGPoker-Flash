// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createProductEvents, isBotOnlyHand, EVENT_VERSION } from './product-events.js';

function fresh() {
  const db = new DatabaseSync(':memory:');
  return { db, events: createProductEvents(db) };
}

test('records declared events and splits human from bot activity', () => {
  const { events } = fresh();
  assert.equal(events.record('guest_joined', { userId: 1 }), true);
  assert.equal(events.record('guest_joined', { userId: 2 }), true);
  assert.equal(events.record('hand_completed', { properties: { table_id: 't1', pot: 900, rake: 45 } }), true);
  assert.equal(events.record('hand_completed', { isBot: true, properties: { table_id: 'bots', pot: 100, rake: 5 } }), true);

  const report = events.summary({ days: 1 });
  assert.equal(report.version, EVENT_VERSION);
  assert.deepEqual(report.events.guest_joined, { human: 2, bot: 0, total: 2 });
  assert.deepEqual(report.events.hand_completed, { human: 1, bot: 1, total: 2 });
  assert.deepEqual(report.events.checkout_started, { human: 0, bot: 0, total: 0 });
});

test('unknown events are ignored instead of stored', () => {
  const { db, events } = fresh();
  assert.equal(events.record('card_seen', { properties: { card: 'Ah' } }), false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM product_events').get().n, 0);
});

test('only declared property keys are stored, and long values are cut', () => {
  const { db, events } = fresh();
  events.record('checkout_started', {
    properties: { product_id: 'p'.repeat(500), amount_cents: 900, credit_card: '4111111111111111' },
  });
  const row = db.prepare('SELECT properties FROM product_events').get();
  const properties = JSON.parse(row.properties);
  assert.deepEqual(Object.keys(properties), ['product_id', 'amount_cents']);
  assert.equal(properties.amount_cents, 900);
  assert.equal(properties.product_id.length, 120);
});

test('prune removes rows older than the retention window', () => {
  const { events } = fresh();
  const old = new Date('2025-01-01T00:00:00Z');
  events.record('account_created', { now: old });
  events.record('account_created', { now: new Date() });
  assert.equal(events.prune({ now: new Date(), retentionDays: 30 }), 1);
  assert.equal(events.summary({ days: 3650 }).events.account_created.total, 1);
});

test('summary window excludes events outside it', () => {
  const { events } = fresh();
  events.record('guest_joined', { now: new Date('2026-01-01T00:00:00Z') });
  events.record('guest_joined', { now: new Date('2026-06-01T00:00:00Z') });
  assert.equal(events.summary({ days: 30, now: new Date('2026-06-02T00:00:00Z') }).events.guest_joined.total, 1);
});

test('a hand is bot activity only when every participant is a bot', () => {
  assert.equal(isBotOnlyHand([]), false);
  assert.equal(isBotOnlyHand(undefined), false);
  assert.equal(isBotOnlyHand([{ isBot: true }, { isBot: true }]), true);
  assert.equal(isBotOnlyHand([{ isBot: true }, { isBot: false }]), false);
  assert.equal(isBotOnlyHand([{ isBot: true }, {}]), false);
});
