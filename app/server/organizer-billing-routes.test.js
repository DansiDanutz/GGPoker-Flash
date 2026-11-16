// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

const BILLING = '/api/marketplace/billing';
const future = (hours) => new Date(Date.now() + hours * 3600000).toISOString();

async function register(srv, login) {
  const response = await srv.post('/api/auth/register', { body: { login, nick: login, password: 'organizer-billing-test-password' } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

async function postOk(srv, route, token, body) {
  const response = await srv.post(route, { token, body });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}

test('enforced organizer billing covers funding, memberships, setup, sessions, replay and rescheduling', async () => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_NERVIXPAY_MANUAL_FUNDING: 'off' } });
  try {
    const admin = await srv.login('admin', 'admin123');
    const owner = await register(srv, 'billing_owner');
    const stranger = await register(srv, 'billing_stranger');

    const config = await srv.get(BILLING);
    assert.equal(config.status, 200);
    assert.equal(config.data.mode, 'enforce');
    assert.equal(config.data.tariffs.membership, 900);
    assert.equal(config.data.checkout_enabled, false);
    assert.deepEqual(config.data.manual_funding, { enabled: false, links: [] });
    await postOk(srv, '/api/admin/tables', admin, { name: 'Platform table without a subscription', game: 'holdem' });
    assert.equal((await srv.post('/api/tables/host', { token: admin, body: { game: 'holdem', idempotencyKey: 'admin-private-unpaid' } })).status, 402, 'admin authority never buys private hosting');

    assert.equal((await srv.post('/api/admin/marketplace/billing/credits', {
      token: owner.token, body: { userId: owner.user.id, amountCents: 10000, reference: 'provider-owner-denied' },
    })).status, 403);
    const funded = await postOk(srv, '/api/admin/marketplace/billing/credits', admin,
      { userId: owner.user.id, amountCents: 10000, reference: 'provider-receipt-owner-1' });
    assert.equal(funded.balance_cents, 10000);

    await postOk(srv, `${BILLING}/subscribe`, owner.token, { role: 'organizer', idempotencyKey: 'membership-organizer-1' });
    let mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, 9100);
    assert.equal(mine.memberships.organizer.active, true);
    assert.equal(mine.memberships.contributor.active, false);

    const contributor = await postOk(srv, `${BILLING}/subscribe`, owner.token, { role: 'contributor', idempotencyKey: 'membership-contributor-1' });
    assert.equal(contributor.role, 'contributor');
    mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, 8200);
    assert.equal(mine.memberships.organizer.active, true);
    assert.equal(mine.memberships.contributor.active, true);
    assert.notEqual(mine.memberships.organizer, mine.memberships.contributor);

    const cashBody = { name: 'Metered cash', game: 'holdem', seats: 6, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, idempotencyKey: 'cash-setup-1' };
    const cash = await postOk(srv, '/api/tables/host', owner.token, cashBody);
    const cashReplay = await postOk(srv, '/api/tables/host', owner.token, cashBody);
    assert.equal(cashReplay.id, cash.id);
    mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, 7200, 'cash setup is charged exactly once across retry');
    assert.equal(mine.tables.filter((table) => table.id === cash.id).length, 1);

    const beforeInvalid = mine.balance_cents;
    const invalidSpin = await srv.post('/api/tables/host', { token: owner.token, body: {
      name: 'Invalid Spin', game: 'spingold', stake: 1234, start_at: future(3), idempotencyKey: 'invalid-spin-1',
    } });
    assert.equal(invalidSpin.status, 400);
    mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, beforeInvalid, 'invalid creation does not retain a setup debit');
    assert.equal(mine.tables.some((table) => table.name === 'Invalid Spin'), false);

    const foreignStart = await srv.post(`${BILLING}/cash/${encodeURIComponent(cash.id)}/start`, {
      token: stranger.token, body: { idempotencyKey: 'foreign-start-1' },
    });
    assert.equal(foreignStart.status, 404);
    const started = await postOk(srv, `${BILLING}/cash/${encodeURIComponent(cash.id)}/start`, owner.token, { idempotencyKey: 'cash-start-1' });
    assert.equal(Boolean(started.active), true);
    mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, 6700);
    const stopped = await postOk(srv, `${BILLING}/cash/${encodeURIComponent(cash.id)}/stop`, owner.token, {});
    assert.equal(Boolean(stopped.active), false);

    const spinStart = future(4);
    const spin = await postOk(srv, '/api/tables/host', owner.token, {
      name: 'Scheduled Spin', game: 'spingold', stake: 5000, start_at: spinStart, idempotencyKey: 'spin-setup-1',
    });
    mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, 6400);
    assert.equal(mine.tables.find((table) => table.id === spin.id).schedule.start_at, spinStart);

    const unchanged = await postOk(srv, `${BILLING}/spin/${encodeURIComponent(spin.id)}/reschedule`, owner.token,
      { startAt: spinStart, idempotencyKey: 'spin-noop-1' });
    assert.equal(unchanged.unchanged, true);
    assert.equal((await srv.get(`${BILLING}/me`, { token: owner.token })).data.balance_cents, 6400, 'unchanged schedule is free');
    const spinMoved = future(5);
    await postOk(srv, `${BILLING}/spin/${encodeURIComponent(spin.id)}/reschedule`, owner.token,
      { startAt: spinMoved, idempotencyKey: 'spin-move-1' });
    mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, 6300);
    assert.equal(mine.tables.find((table) => table.id === spin.id).schedule.start_at, spinMoved);

    const tournamentStart = future(6);
    const tournament = await postOk(srv, '/api/tournaments/host', owner.token, {
      name: 'Metered tournament', format: 'NLH', start_at: tournamentStart, idempotencyKey: 'tournament-setup-1',
    });
    mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, 5800);
    const tournamentMoved = future(7);
    await postOk(srv, `${BILLING}/tournament/${encodeURIComponent(tournament.id)}/reschedule`, owner.token,
      { startAt: tournamentMoved, idempotencyKey: 'tournament-move-1' });
    mine = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(mine.balance_cents, 5700);
    assert.equal(mine.tournaments.find((entry) => entry.id === tournament.id).start_at, tournamentMoved);
    assert.equal(mine.ledger.filter((entry) => entry.kind === 'setup').length, 3);
    assert.equal(mine.ledger.filter((entry) => entry.kind === 'membership').length, 2);
    assert.equal(mine.ledger.filter((entry) => entry.kind === 'reschedule').length, 2);
  } finally { await srv.stop(); }
});

test('manual NervixPay funding links require both explicit opt-in and enforced billing', async () => {
  const enabled = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_NERVIXPAY_MANUAL_FUNDING: 'on' } });
  try {
    const config = await enabled.get(BILLING);
    assert.equal(config.status, 200);
    assert.equal(config.data.checkout_enabled, false, 'automated checkout remains disabled');
    assert.equal(config.data.manual_funding.enabled, true);
    assert.deepEqual(config.data.manual_funding.links, [
      { amount_cents: 900, url: 'https://nervixpay.live/l/b0afce77-773a-48a0-9a73-72274791313d' },
      { amount_cents: 1000, url: 'https://nervixpay.live/l/9aae5873-9e81-4ac0-be07-3b189ffded2f' },
    ]);
    assert.deepEqual(config.data.manual_funding.assets, ['USDC on Polygon', 'USDT on BNB Chain']);
  } finally { await enabled.stop(); }

  const billingOff = await startServer({ env: { GGPOKER_USAGE_BILLING: 'off', GGPOKER_NERVIXPAY_MANUAL_FUNDING: 'on' } });
  try {
    const config = await billingOff.get(BILLING);
    assert.deepEqual(config.data.manual_funding, { enabled: false, links: [] });
  } finally { await billingOff.stop(); }
});

test('production admin network guard also protects organizer credit funding', async () => {
  const srv = await startServer({ env: {
    NODE_ENV: 'production', GGPOKER_TRUST_PROXY: '1', GGPOKER_ADMIN_ALLOW: '',
    GGPOKER_ADMIN_PASSWORD: 'test-only-organizer-billing-admin-password', GGPOKER_USAGE_BILLING: 'enforce',
  } });
  try {
    const denied = await srv.post('/api/admin/marketplace/billing/credits', {
      headers: { 'x-forwarded-for': '203.0.113.5' }, body: { userId: 1, amountCents: 100, reference: 'public-denied' },
    });
    assert.equal(denied.status, 403);
    assert.match(String(denied.data?.error), /restricted/i);
    assert.equal((await srv.get('/api/admin/marketplace/billing/refunds', { headers: { 'x-forwarded-for': '203.0.113.5' } })).status, 403);
  } finally { await srv.stop(); }
});

test('only private finance admins can reserve, cancel or record externally paid service-credit refunds', async () => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce' } });
  const refunds = '/api/admin/marketplace/billing/refunds';
  try {
    const admin = await srv.login('admin', 'admin123');
    const owner = await register(srv, 'refund_owner');
    const body = { userId: owner.user.id, originalReference: 'refund-route-receipt', amountCents: 1000, requestId: 'refund-route-1', reason: 'Verified unused credit refund request' };
    await postOk(srv, '/api/admin/marketplace/billing/credits', admin, { userId: owner.user.id, amountCents: 1000, reference: body.originalReference });
    assert.equal((await srv.get(refunds, { token: owner.token })).status, 403);
    assert.equal((await srv.post(refunds, { token: owner.token, body })).status, 403);
    assert.equal((await srv.post(refunds, { token: admin, body: { ...body, actor: owner.user.id } })).status, 400);
    assert.equal((await postOk(srv, refunds, admin, body)).status, 'reserved');
    assert.equal((await srv.get(`${BILLING}/me`, { token: owner.token })).data.balance_cents, 0);
    assert.equal((await srv.get(refunds, { token: admin })).data.refunds[0].request_id, body.requestId);
    assert.equal((await srv.post(`${refunds}/${body.requestId}/cancel`, { token: owner.token, body: { reason: 'Not authorized' } })).status, 403);
    assert.equal((await postOk(srv, `${refunds}/${body.requestId}/cancel`, admin, { reason: 'Verified no external payment was sent' })).status, 'cancelled');
    assert.equal((await srv.get(`${BILLING}/me`, { token: owner.token })).data.balance_cents, 1000);
    await postOk(srv, refunds, admin, { ...body, requestId: 'refund-route-2' });
    assert.equal((await postOk(srv, `${refunds}/refund-route-2/paid`, admin, { externalReference: 'verified-external-refund-1' })).status, 'paid');
    assert.equal((await postOk(srv, `${refunds}/refund-route-2/paid`, admin, { externalReference: 'verified-external-refund-1' })).status, 'paid');
    assert.equal((await srv.get(`${BILLING}/me`, { token: owner.token })).data.balance_cents, 0);
  } finally { await srv.stop(); }
});
