// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrganizerChipRoutes } from './organizer-chip-routes.js';

function fixture(mode = 'enforce') {
  const calls = [], reply = [];
  const chips = new Proxy({ account: () => [], purchase: (x) => (calls.push(['purchase', x]), x), transfer: (x) => (calls.push(['transfer', x]), x) }, { get: (target, key) => target[key] });
  const events = {
    eligibleTournaments: (id) => [{ id: 't1', viewer: id || null }], list: () => ({ tickets: [], buybacks: [] }),
    issueTicket: (x) => (calls.push(['issue', x]), x), transferTicket: (x) => (calls.push(['ticket-transfer', x]), x), redeemTicket: (x) => (calls.push(['redeem', x]), x),
    requestBuyback: (x) => (calls.push(['buyback', x]), x), reportBuyback: (x) => (calls.push(['report', x]), x), confirmBuyback: (x) => (calls.push(['confirm', x]), x), cancelBuyback: (x) => (calls.push(['cancel', x]), x), rejectBuyback: (x) => (calls.push(['reject', x]), x),
  };
  const route = createOrganizerChipRoutes({ chips, events, billing: { account: () => ({ balance_cents: 0 }) }, mode,
    json: (_res, status, data) => reply.push({ status, data }), requireUser: () => ({ id: 7 }), readBody: async (req) => req.body });
  const call = async (path, body = undefined, method = body === undefined ? 'GET' : 'POST') => { reply.length = 0; await route({ method, body }, {}, new URL(`http://test${path}`)); return reply[0]; };
  return { calls, call };
}

test('public config and authenticated account expose scoped balances, tickets, buybacks and eligible events', async () => {
  const f = fixture();
  const config = await f.call('/api/marketplace/chips');
  assert.equal(config.status, 200); assert.deepEqual(config.data.pack, { service_cents: 100, chips: 10000 }); assert.equal(config.data.membership_grant, 100000);
  const mine = await f.call('/api/marketplace/chips/me');
  assert.equal(mine.status, 200); assert.deepEqual(mine.data.balances, []); assert.deepEqual(mine.data.tickets, []); assert.equal(mine.data.tournaments[0].viewer, 7);
});

test('purchase and transfer derive sender identity from auth and pass no caller-supplied fromUserId', async () => {
  const f = fixture();
  await f.call('/api/marketplace/chips/purchase', { packs: 2, key: 'p1' });
  assert.deepEqual(f.calls.pop(), ['purchase', { organizerId: 7, packs: 2, idempotencyKey: 'p1' }]);
  await f.call('/api/marketplace/chips/transfer', { organizerId: 1, toUserId: 8, amount: 500, key: 'x1' });
  assert.deepEqual(f.calls.pop(), ['transfer', { organizerId: 1, fromUserId: 7, toUserId: 8, amount: 500, idempotencyKey: 'x1' }]);
  await assert.rejects(() => f.call('/api/marketplace/chips/transfer', { organizerId: 1, fromUserId: 99, toUserId: 8, amount: 500, key: 'x2' }), /Unexpected request field/);
});

test('ticket routes bind the authenticated holder and redemption accepts no extra fields', async () => {
  const f = fixture();
  await f.call('/api/marketplace/chips/tickets', { tournamentId: 't1', key: 'i1' });
  assert.deepEqual(f.calls.pop(), ['issue', { userId: 7, tournamentId: 't1', idempotencyKey: 'i1' }]);
  await f.call('/api/marketplace/chips/tickets/ticket-1/transfer', { toUserId: 8, key: 'tx' });
  assert.deepEqual(f.calls.pop(), ['ticket-transfer', { userId: 7, ticketId: 'ticket-1', toUserId: 8, idempotencyKey: 'tx' }]);
  await f.call('/api/marketplace/chips/tickets/ticket-1/redeem', {});
  assert.deepEqual(f.calls.pop(), ['redeem', { userId: 7, ticketId: 'ticket-1' }]);
  await assert.rejects(() => f.call('/api/marketplace/chips/tickets/ticket-1/redeem', { userId: 99 }), /Unexpected request field/);
});

test('buyback routes keep stated payment separate and require explicit report evidence', async () => {
  const f = fixture();
  await f.call('/api/marketplace/chips/buybacks', { organizerId: 1, amount: 1000, paymentAmount: '25.00', paymentCurrency: 'USD', paymentDetails: 'manual agreement', key: 'b1' });
  assert.deepEqual(f.calls.pop(), ['buyback', { userId: 7, organizerId: 1, amount: 1000, paymentAmount: '25.00', paymentCurrency: 'USD', paymentDetails: 'manual agreement', idempotencyKey: 'b1' }]);
  await f.call('/api/marketplace/chips/buybacks/b1/report', { receipt: 'receipt-1', paymentAmount: '25.00', paymentCurrency: 'USD', paymentNetwork: 'SEPA', paymentDetails: 'paid externally' });
  assert.deepEqual(f.calls.pop(), ['report', { userId: 7, buybackId: 'b1', receipt: 'receipt-1', paymentAmount: '25.00', paymentCurrency: 'USD', paymentNetwork: 'SEPA', paymentDetails: 'paid externally' }]);
  for (const action of ['confirm', 'cancel', 'reject']) { await f.call(`/api/marketplace/chips/buybacks/b1/${action}`, {}); assert.equal(f.calls.pop()[1].userId, 7); }
});

test('all mutations are disabled outside enforce mode', async () => {
  const f = fixture('off');
  await assert.rejects(() => f.call('/api/marketplace/chips/purchase', { packs: 1, key: 'p1' }), (error) => error.status === 409);
  assert.equal((await f.call('/api/marketplace/chips')).data.mode, 'off');
});
