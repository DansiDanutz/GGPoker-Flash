// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './test-helpers.js';
import { createMarketplaceCommerce } from './marketplace-commerce.js';

const CASH = 'cash-games-manager';
const FINANCE = '/api/admin/marketplace/commerce';

async function register(server, login) {
  const result = await server.post('/api/auth/register', {
    body: { login, nick: login, password: 'management-policy-test-only-password' },
  });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  return result.data;
}

function nextLiveMessage(socket, matches) {
  // Socket helpers retain old snapshots. Configuration acknowledgements must
  // observe a new message, rather than an earlier snapshot with the same value.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.ws.off('message', listener);
      reject(new Error('Timed out waiting for a fresh configuration snapshot'));
    }, 5000);
    const listener = (raw) => {
      const message = JSON.parse(String(raw));
      if (!matches(message)) return;
      clearTimeout(timer);
      socket.ws.off('message', listener);
      resolve(message);
    };
    socket.ws.on('message', listener);
  });
}

test('off mode preserves existing unpaid hosting while planned management plugins stay unavailable', async () => {
  const server = await startServer({ env: { GGPOKER_MARKETPLACE_ENFORCEMENT: 'off' } });
  try {
    const owner = await register(server, 'policy_off_owner');
    const created = await server.post('/api/tables/host', { token: owner.token, body: { name: 'Community mode table', game: 'holdem' } });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const event = await server.post('/api/tournaments/host', { token: owner.token, body: { name: 'Community mode event' } });
    assert.equal(event.status, 200, JSON.stringify(event.data));
    const account = (await server.get('/api/marketplace/management/me', { token: owner.token })).data;
    assert.equal(account.mode, 'off');
    const cash = account.access.find((entry) => entry.product_id === CASH);
    assert.equal(cash.active, false, 'community access must not be labelled as paid');
    assert.equal(cash.can_manage, true);
    assert.equal(cash.reason, 'community_mode');
    for (const id of ['sit-and-go-manager', 'social-casino-manager']) {
      const planned = account.access.find((entry) => entry.product_id === id);
      assert.equal(planned.can_manage, false);
      assert.equal(planned.reason, 'not_implemented');
    }
    assert.equal((await server.get('/api/me', { token: owner.token })).data.user.is_admin, false);
  } finally { await server.stop(); }
});

test('observe mode permits an unpaid organizer action and records the missing entitlement for rollout', async () => {
  const server = await startServer({ env: { GGPOKER_MARKETPLACE_ENFORCEMENT: 'observe' } });
  try {
    const owner = await register(server, 'policy_observe_owner');
    const created = await server.post('/api/tables/host', { token: owner.token, body: { name: 'Observed hosting', game: 'holdem' } });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const db = new DatabaseSync(path.join(server.dataDir, 'ggpoker.db'), { readOnly: true });
    try {
      const audit = db.prepare("SELECT actor,action,detail FROM audit_log WHERE action = 'plugin_access_observed' AND actor = ?").all('policy_observe_owner');
      assert.equal(audit.length, 1);
      assert.deepEqual(JSON.parse(audit[0].detail), { product_id: CASH, action: 'host_table_create' });
      assert.equal(db.prepare('SELECT owner_id FROM tables WHERE id = ?').get(created.data.id).owner_id, owner.user.id);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM marketplace_paid_access WHERE user_id = ?').get(owner.user.id).n, 0);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'plugin_access_denied' AND actor = ?").get('policy_observe_owner').n, 0);
    } finally { db.close(); }
    const account = (await server.get('/api/marketplace/management/me', { token: owner.token })).data;
    const cash = account.access.find((entry) => entry.product_id === CASH);
    assert.equal(cash.active, false);
    assert.equal(cash.can_manage, true);
    assert.equal(cash.reason, 'rollout_observation');
  } finally { await server.stop(); }
});

test('WebSocket host-rule changes recheck expiry and refund while ordinary player options and ownership remain independent', { timeout: 25_000 }, async () => {
  const server = await startServer({ env: { GGPOKER_MARKETPLACE_ENFORCEMENT: 'enforce' } });
  const sockets = [];
  let db;
  try {
    const owner = await register(server, 'policy_socket_owner');
    const player = await register(server, 'policy_socket_player');
    const adminToken = await server.login('admin', 'admin123');
    const admin = (await server.get('/api/me', { token: adminToken })).data.user;
    db = new DatabaseSync(path.join(server.dataDir, 'ggpoker.db'));
    const commerce = createMarketplaceCommerce({ db });
    const publisher = commerce.registerPublisher({ ownerUserId: admin.id, displayName: 'Policy fixture publisher', kind: 'company', nervixpayMerchantId: 'policy-merchant' });
    commerce.reviewPublisher({ publisherId: publisher.id, status: 'approved', actor: 'policy-test', reason: 'Verified fixture merchant.' });
    db.prepare("UPDATE marketplace_products SET status = 'available',pricing = 'monthly',currency = 'USD',price_cents = 10000 WHERE id = ?").run(CASH);
    commerce.bindOffer({ productId: CASH, publisherId: publisher.id, actor: 'policy-test' });
    commerce.creditPublisher({ publisherId: publisher.id, amountCents: 5000, reference: 'policy-confirmed-topup', actor: 'policy-test' });
    const purchase = () => {
      const order = commerce.reserveOrder({ buyerUserId: owner.user.id, productId: CASH, idempotencyKey: crypto.randomUUID() });
      const evidence = { providerOrderId: `policy-provider-${order.id}`, merchantId: 'policy-merchant', network: 'polygon', token: 'USDC', amountBaseUnits: '100000000' };
      commerce.bindPayment({ orderId: order.id, ...evidence, actor: 'policy-test' });
      commerce.settleOrder({ ...evidence, paymentId: `policy-payment-${order.id}`, paidAt: new Date().toISOString(), actor: 'policy-test' });
      return order;
    };
    const firstOrder = purchase();
    const created = await server.post('/api/tables/host', {
      token: owner.token,
      body: { name: 'Policy socket table', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 4000 },
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const tableId = created.data.id;
    const ownerSocket = server.socket(owner.token);
    const playerSocket = server.socket(player.token);
    sockets.push(ownerSocket, playerSocket);
    await Promise.all(sockets.map((socket) => socket.opened));
    // Reserve both seats before either player buys in. The spectator's reserved
    // seat prevents bot filling, so the owner can configure an idle table.
    for (const [seat, socket] of sockets.entries()) {
      socket.send({ type: 'join_table', tableId, observe: true });
      await socket.next((message) => message.type === 'joined' && message.tableId === tableId);
      socket.send({ type: 'reserve_seat', tableId, seat });
      await socket.next((message) => message.type === 'seat_reserved' && message.tableId === tableId);
    }
    ownerSocket.send({ type: 'join_table', tableId, buyin: 4000, seat: 0 });
    await ownerSocket.next((message) => message.type === 'joined' && message.tableId === tableId && message.seat === 0);
    ownerSocket.send({ type: 'option', tableId, straddle: true });
    const enabled = await ownerSocket.next((message) => message.type === 'state' && message.state.id === tableId && message.state.straddle === true);
    assert.equal(enabled.state.street, 'idle');

    db.prepare('UPDATE marketplace_paid_access SET expires_at = ? WHERE order_id = ?').run('2000-01-01T00:00:00.000Z', firstOrder.id);
    ownerSocket.send({ type: 'option', tableId, straddle: false });
    const expired = await ownerSocket.next((message) => message.type === 'error' && message.code === 'paid_plugin_required');
    assert.equal(expired.product_id, CASH);

    const secondOrder = purchase();
    const configured = nextLiveMessage(ownerSocket, (message) => message.type === 'state' && message.state.id === tableId
      && message.state.straddle === false && message.state.players.some((entry) => entry.isMe));
    ownerSocket.send({ type: 'option', tableId, straddle: false });
    await configured;
    commerce.refundOrder({ orderId: secondOrder.id, refundReference: 'policy-verified-refund', actor: 'policy-test' });
    ownerSocket.send({ type: 'option', tableId, straddle: true });
    const revoked = await ownerSocket.next((message) => message.type === 'error' && message.code === 'paid_plugin_required');
    assert.equal(revoked.product_id, CASH);

    // This is a player's own preference, not the owner's table-wide rule.
    ownerSocket.send({ type: 'option', tableId, autoStraddle: true });
    const ownPreference = await ownerSocket.next((message) => message.type === 'state' && message.state.id === tableId
      && message.state.players.some((entry) => entry.isMe && entry.autoStraddle === true));
    assert.equal(ownPreference.state.straddle, false, 'denied owner mutation did not change the rule');

    assert.equal(commerce.hasPaidAccess(player.user.id, CASH), false);
    playerSocket.send({ type: 'join_table', tableId, buyin: 4000, seat: 1 });
    await playerSocket.next((message) => message.type === 'joined' && message.tableId === tableId && message.seat === 1);
    playerSocket.send({ type: 'option', tableId, autoStraddle: true });
    await playerSocket.next((message) => message.type === 'state' && message.state.id === tableId
      && message.state.players.some((entry) => entry.isMe && entry.autoStraddle === true));
    playerSocket.send({ type: 'option', tableId, straddle: true });
    const notOwner = await playerSocket.next((message) => message.type === 'error' && /Only the table host/.test(message.error));
    assert.equal(notOwner.code, undefined, 'ownership is checked before commercial entitlement');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action = 'plugin_access_denied' AND json_extract(detail,'$.action') = 'host_straddle_configure'").get().n, 2);
    assert.equal((await server.get('/api/me', { token: owner.token })).data.user.is_admin, false);
  } finally {
    for (const socket of sockets) await socket.close();
    if (db) db.close();
    await server.stop();
  }
});

test('production commerce endpoints reject a forwarded public caller even with a valid administrator token', async () => {
  const password = 'policy-test-only-strong-admin-password';
  const server = await startServer({ env: {
    NODE_ENV: 'production', GGPOKER_TRUST_PROXY: '1', GGPOKER_ADMIN_ALLOW: '',
    GGPOKER_ADMIN_PASSWORD: password, GGPOKER_MARKETPLACE_ENFORCEMENT: 'enforce',
  } });
  try {
    const token = await server.login('admin', password);
    assert.ok(token);
    assert.equal((await server.get(FINANCE, { token })).status, 403, 'loopback alone cannot identify the operator');
    const headers = { 'x-forwarded-for': '203.0.113.5' };
    for (const response of [
      await server.get(FINANCE, { token, headers }),
      await server.post(`${FINANCE}/payments/confirm`, { token, headers, body: { paymentId: 'untrusted-payment' } }),
      await server.post(`${FINANCE}/publishers`, { token, headers, body: { ownerUserId: 1 } }),
    ]) {
      assert.equal(response.status, 403);
      assert.match(response.data.error, /restricted/i, 'network boundary runs before commerce validation');
    }
    assert.equal((await server.get('/api/marketplace/management', { headers })).status, 200, 'public catalog remains public');
    const db = new DatabaseSync(path.join(server.dataDir,'ggpoker.db'), {readOnly:true});
    try {
      for (const table of ['marketplace_publishers','marketplace_orders']) {
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);
      }
    } finally { db.close(); }
  } finally { await server.stop(); }
});
