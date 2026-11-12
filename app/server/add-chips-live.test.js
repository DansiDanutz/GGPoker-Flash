// Add Chips over the live socket (REA F14): a request during a live hand is paid now and held as
// pending, a replay is refused, and leaving before the next deal refunds it through the ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { sleep, startServer } from './test-helpers.js';

const TABLE = 'nlh-diamond-01';

test('add chips mid-hand: pending, replay-safe, refunded on leave', async () => {
  const server = await startServer();
  try {
    const token = await server.login('DansiDanutz', 'ggpoker');
    const before = await server.balance(token);
    const sock = server.socket(token);
    await sock.opened;
    sock.send({ type: 'join_table', tableId: TABLE });
    const live = await sock.next((m) => m.type === 'state'
      && m.state.players.some((p) => p.isMe && p.inHand && !p.folded) && !['idle', 'ended'].includes(m.state.street), 10000);
    const me = live.state.players.find((p) => p.isMe);
    const amount = Math.min(live.state.maxBuyin - me.stack, live.state.bb * 10);
    assert.ok(amount > 0);

    sock.send({ type: 'rebuy', tableId: TABLE, amount, basePending: 0 });
    const pending = await sock.next((m) => m.type === 'state' && m.state.players.some((p) => p.isMe && p.pendingTopUp === amount));
    assert.equal(pending.state.players.find((p) => p.isMe).stack, me.stack, 'the live stack is unchanged');

    sock.send({ type: 'rebuy', tableId: TABLE, amount, basePending: 0 });
    const replay = await sock.nextType('error');
    assert.match(replay.error, /pending chips changed/);

    sock.send({ type: 'leave_table', tableId: TABLE });
    await sleep(500);
    await sock.close();

    const db = new DatabaseSync(path.join(server.dataDir, 'ggpoker.db'));
    const rows = db.prepare("SELECT kind, amount, reference FROM transactions WHERE reference LIKE 'topup:%' ORDER BY id").all();
    db.close();
    assert.equal(rows.length, 2, JSON.stringify(rows));
    assert.equal(rows[0].kind, 'rebuy');
    assert.equal(rows[0].amount, -amount);
    assert.match(rows[0].reference, /^topup:.+:1$/);
    assert.equal(rows[1].kind, 'chips_refund');
    assert.equal(rows[1].amount, amount);
    assert.match(rows[1].reference, /^topup:.+:1:leave$/);
    const after = await server.balance(token);
    assert.ok(after <= before, 'no chips are created');
  } finally {
    await server.stop();
  }
});

test('leave-after-hand reservation refunds the pending top-up when the seat is cashed out', { timeout: 60000 }, async () => {
  const server = await startServer();
  try {
    const token = await server.login('DansiDanutz', 'ggpoker');
    const sock = server.socket(token);
    await sock.opened;
    sock.send({ type: 'join_table', tableId: TABLE });
    const live = await sock.next((m) => m.type === 'state'
      && m.state.players.some((p) => p.isMe && p.inHand && !p.folded) && !['idle', 'ended'].includes(m.state.street), 10000);
    const me = live.state.players.find((p) => p.isMe);
    const amount = Math.min(live.state.maxBuyin - me.stack, live.state.bb * 10);
    sock.send({ type: 'rebuy', tableId: TABLE, amount, basePending: 0, idempotencyKey: 'live-leave-1' });
    await sock.next((m) => m.type === 'state' && m.state.players.some((p) => p.isMe && p.pendingTopUp === amount));
    sock.send({ type: 'option', tableId: TABLE, leaveAfterHand: true });
    // Fold whenever the action reaches us so the hand ends quickly.
    sock.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      const mine = m.type === 'state' && m.state.players.find((p) => p.isMe);
      if (mine && m.state.actor === mine.id) sock.send({ type: 'action', tableId: TABLE, action: 'fold', amount: 0 });
    });
    await sock.next((m) => m.type === 'state' && !m.state.players.some((p) => p.isMe), 45000);
    await sock.close();

    const db = new DatabaseSync(path.join(server.dataDir, 'ggpoker.db'));
    const rows = db.prepare("SELECT kind, amount, reference FROM transactions WHERE reference LIKE 'in:%:k:%' OR reference LIKE 'topup:%' ORDER BY id").all();
    db.close();
    assert.equal(rows.length, 2, JSON.stringify(rows));
    assert.deepEqual([rows[0].kind, rows[0].amount], ['rebuy', -amount]);
    assert.match(rows[0].reference, /:k:live-leave-1$/, 'the pending charge carries the client key');
    assert.deepEqual([rows[1].kind, rows[1].amount], ['chips_refund', amount]);
    assert.match(rows[1].reference, /^topup:.+:leave$/);
  } finally {
    await server.stop();
  }
});
