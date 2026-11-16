import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './test-helpers.js';

test('Spin setup, scoped tickets, funded play and refunds conserve chips', async (t) => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } }), sockets = [];
  let db;
  const post = async (route, token, body) => { const r = await srv.post(route, { token, body }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
  const bill = '/api/marketplace/billing', chips = '/api/marketplace/chips';
  try {
    const admin = await srv.login('admin', 'admin123'), users = [];
    for (const login of ['spin_owner', 'spin_first', 'spin_second', 'spin_third', 'spin_outsider']) users.push(await post('/api/auth/register', null, { login, password: 'spin-test-password' }));
    const [owner, ...players] = users;
    await post('/api/admin/marketplace/billing/credits', admin, { userId: owner.user.id, amountCents: 3000, reference: 'spin-fixture' });
    await post(bill + '/subscribe', owner.token, { role: 'organizer', idempotencyKey: 'membership' });
    const body = { economy: 'organizer', game: 'spingold', name: 'Spin ticket test', min_buyin: 5000, max_buyin: 5000, rakePercent: 3, start_at: new Date(Date.now() + 3600000).toISOString(), idempotencyKey: 'setup' };
    const before = (await srv.get(bill + '/me', { token: owner.token })).data.balance_cents;
    assert.equal((await srv.post('/api/tables/host', { token: owner.token, body: { ...body, min_buyin: 7, max_buyin: 7 } })).status, 400);
    assert.equal((await srv.get(bill + '/me', { token: owner.token })).data.balance_cents, before);
    for (const rakePercent of [1, 6, 2.5, '3', null]) assert.equal((await srv.post('/api/tables/host', { token: owner.token, body: { ...body, rakePercent } })).status, 400);
    assert.equal((await srv.get(bill + '/me', { token: owner.token })).data.balance_cents, before);
    const table = await post('/api/tables/host', owner.token, body);
    assert.equal((await post('/api/tables/host', owner.token, body)).id, table.id);
    const rakeRoute = bill + `/spin/${table.id}/rake`;
    assert.equal((await srv.post(rakeRoute, { token: players[3].token, body: { rakePercent: 2 } })).status, 404);
    for (const rakePercent of [2, 3, 4, 5]) {
      await post(rakeRoute, owner.token, { rakePercent });
      assert.equal((await srv.get(bill + '/me', { token: owner.token })).data.tables.find(t => t.id === table.id).rakePercent, rakePercent);
    }
    for (const rakePercent of [1, 6, 2.5, '3', null]) assert.equal((await srv.post(rakeRoute, { token: owner.token, body: { rakePercent } })).status, 400);
    await post(rakeRoute, owner.token, { rakePercent: 3 });
    const ticket = await post(chips + '/spin-tickets', owner.token, { tableId: table.id, key: 'ticket' });
    assert.equal((await srv.post(rakeRoute, { token: owner.token, body: { rakePercent: 2 } })).status, 409, 'issued ticket locks its rake');
    assert.equal((await post(chips + '/spin-tickets', owner.token, { tableId: table.id, key: 'ticket' })).id, ticket.id);
    assert.equal((await srv.post(chips + '/spin-tickets', { token: players[3].token, body: { tableId: table.id, key: 'unfunded' } })).status, 402);
    await post(chips + `/spin-tickets/${ticket.id}/transfer`, owner.token, { toUserId: players[0].user.id, key: 'transfer' });
    assert.equal((await srv.post(chips + `/spin-tickets/${ticket.id}/refund`, { token: owner.token, body: {} })).status, 404);
    await post(chips + `/spin-tickets/${ticket.id}/refund`, players[0].token, {});
    await post(chips + `/spin-tickets/${ticket.id}/refund`, players[0].token, {});
    const reschedule = { startAt: new Date(Date.now() + 7200000).toISOString(), idempotencyKey: 'reschedule' };
    await post(bill + `/spin/${table.id}/reschedule`, owner.token, reschedule);
    await post(bill + `/spin/${table.id}/reschedule`, owner.token, reschedule);
    assert.equal((await srv.get(bill + '/me', { token: owner.token })).data.balance_cents, before - 400);
    await post(chips + `/spin/${table.id}/start`, owner.token, {});
    assert.equal((await srv.post(rakeRoute, { token: owner.token, body: { rakePercent: 2 } })).status, 409, 'open round locks rake');
    db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    db.prepare("UPDATE organizer_chip_spin_rounds SET state='disputed' WHERE table_id=?").run(table.id);
    assert.equal((await srv.del(`/api/tables/host/${table.id}`, { token: owner.token })).status, 409);
    assert.ok(db.prepare('SELECT 1 FROM tables WHERE id=?').get(table.id));
    db.prepare("UPDATE organizer_chip_spin_rounds SET state='waiting' WHERE table_id=?").run(table.id);
    db.prepare("INSERT INTO organizer_chip_sessions VALUES (?, 'recovered-seat', ?, ?, 5000, 'open', datetime('now'), NULL)").run(owner.user.id, players[0].user.id, table.id);
    assert.equal((await srv.del(`/api/tables/host/${table.id}`, { token: owner.token })).status, 409);
    db.prepare("DELETE FROM organizer_chip_sessions WHERE session_id='recovered-seat'").run();
    const playMoneyBefore = db.prepare('SELECT id,balance FROM users ORDER BY id').all();
    const entryTickets = [];
    for (const [i, p] of players.slice(0, 3).entries()) {
      const t = await post(chips + '/spin-tickets', owner.token, { tableId: table.id, key: `entry-${i}` });
      await post(chips + `/spin-tickets/${t.id}/transfer`, owner.token, { toUserId: p.user.id, key: `give-${i}` });
      entryTickets.push(t.id);
    }
    const spare = await post(chips + '/spin-tickets', owner.token, { tableId: table.id, key: 'spare' });
    await post(chips + `/spin-tickets/${spare.id}/transfer`, owner.token, { toUserId: players[0].user.id, key: 'spare-transfer' });
    db.prepare('UPDATE organizer_spin_schedule SET start_at=? WHERE table_id=?').run(new Date(Date.now() - 1000).toISOString(), table.id);
    for (const p of players.slice(0, 3)) {
      const s = srv.socket(p.token); sockets.push(s); await s.opened; const acted = new Set();
      s.ws.on('message', raw => { const m = JSON.parse(String(raw)), st = m.state; if (m.type !== 'state' || st.id !== table.id) return; const me = st.players.find(x => x.isMe), k = `${st.handNo}:${st.turnNo}`; if (!me || st.actor !== me.id || acted.has(k)) return; acted.add(k); s.send({ type: 'action', tableId: table.id, action: 'allin', handNo: st.handNo, turnNo: st.turnNo }); });
      s.send({ type: 'join_table', tableId: table.id, buyin: 5000 });
      await s.next(m => m.type === 'joined' && m.tableId === table.id);
      s.send({ type: 'join_table', tableId: table.id, rejoin: true });
      await s.next(m => m.type === 'joined' && m.tableId === table.id);
    }
    let round;
    for (let i = 0; i < 900; i++) { round = db.prepare('SELECT * FROM organizer_chip_spin_rounds WHERE table_id=? ORDER BY created_at DESC LIMIT 1').get(table.id); if (round.state === 'complete') break; await new Promise(r => setTimeout(r, 100)); }
    assert.equal(round.state, 'complete');
    const outcome = JSON.parse(round.outcome), paid = db.prepare('SELECT * FROM organizer_chip_spin_players WHERE round_id=? ORDER BY place').all(round.id);
    assert.equal(outcome.payoutModel, 'pooled');
    assert.equal(outcome.rakePercent, 3);
    assert.equal(outcome.rakeAmount, 450);
    assert.equal(outcome.entryTotal, 15000);
    assert.equal(outcome.prizePool, 14550);
    assert.equal(round.max_reserve, 0);
    assert.deepEqual(paid.map(p => p.payout), [14550, 0, 0]);
    assert.equal(db.prepare("SELECT count(*) n FROM organizer_chip_journals WHERE kind='spin_payout'").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM organizer_chip_journals WHERE kind='spin_rake'").get().n, 1);
    for (const p of paid) assert.equal(db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(owner.user.id, `wallet:${p.user_id}`).balance, p.payout + (p.user_id === players[0].user.id ? 5000 : 0), 'ticket entry does not debit the holder wallet');
    assert.equal(db.prepare('SELECT balance FROM organizer_chip_accounts WHERE account_key=?').get(`event:spin:${round.id}`).balance, 0);
    assert.equal(db.prepare('SELECT SUM(balance) n FROM organizer_chip_accounts WHERE organizer_id=?').get(owner.user.id).n, 100000);
    assert.equal(db.prepare("SELECT SUM(balance) n FROM organizer_chip_accounts WHERE organizer_id=? AND account_key!='burn'").get(owner.user.id).n, 99550);
    assert.equal(db.prepare("SELECT count(*) n FROM organizer_chip_spin_tickets WHERE state='consumed'").get().n, 3);
    assert.equal(db.prepare('SELECT state FROM organizer_chip_spin_tickets WHERE id=?').get(spare.id).state, 'issued', 'rejoin cannot consume the next ticket');
    for (const id of entryTickets) {
      const ticket = db.prepare('SELECT * FROM organizer_chip_spin_tickets WHERE id=?').get(id);
      assert.equal(ticket.state, 'consumed');
      assert.equal(db.prepare('SELECT count(*) n FROM organizer_chip_journals WHERE reference=?').get(`spin-ticket:${id}:redeem`).n, 1);
      assert.equal(db.prepare('SELECT count(*) n FROM organizer_chip_sessions WHERE session_id=?').get(ticket.session_id).n, 1);
      const holder = players.find(p => p.user.id === ticket.holder_id);
      assert.equal((await srv.post(chips + `/spin-tickets/${id}/refund`, { token: holder.token, body: {} })).status, 409);
      assert.equal((await srv.post(chips + `/spin-tickets/${id}/transfer`, { token: holder.token, body: { toUserId: players[3].user.id, key: `reused-${id}` } })).status, 409);
    }
    const settled = db.prepare('SELECT account_key,balance FROM organizer_chip_accounts WHERE organizer_id=? ORDER BY account_key').all(owner.user.id);
    for (const s of sockets) {
      s.send({ type: 'join_table', tableId: table.id, rejoin: true });
      await s.next(m => m.type === 'joined');
    }
    assert.deepEqual(db.prepare('SELECT account_key,balance FROM organizer_chip_accounts WHERE organizer_id=? ORDER BY account_key').all(owner.user.id), settled);
    assert.equal(db.prepare('SELECT state FROM organizer_chip_spin_tickets WHERE id=?').get(spare.id).state, 'issued');
    assert.equal(db.prepare("SELECT count(*) n FROM organizer_chip_journals WHERE kind='spin_payout'").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM organizer_chip_journals WHERE kind='spin_rake'").get().n, 1);
    assert.deepEqual(db.prepare('SELECT id,balance FROM users ORDER BY id').all(), playMoneyBefore, 'paid Spin cannot alter Play Money wallets');
    for (const s of sockets) s.send({ type: 'leave_table', tableId: table.id });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await srv.del(`/api/tables/host/${table.id}`, { token: owner.token })).status, 200);
    assert.equal(db.prepare('SELECT state FROM organizer_chip_spin_tickets WHERE id=?').get(spare.id).state, 'refunded');
    assert.equal(db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(owner.user.id, `wallet:${players[0].user.id}`).balance, paid.find(p => p.user_id === players[0].user.id).payout + 10000);
    assert.equal(db.prepare('SELECT SUM(balance) n FROM organizer_chip_accounts WHERE organizer_id=?').get(owner.user.id).n, 100000);
    t.diagnostic(JSON.stringify({ rakePercent: outcome.rakePercent, rakeAmount: outcome.rakeAmount, entryTotal: outcome.entryTotal, prizes: outcome.prizes, ticketsConsumed: entryTickets.length, unusedTicketRefunded: true, supplyIncludingBurn: 100000, reconciled: true }));
  } finally { await Promise.all(sockets.map(s => s.close())); db?.close(); await srv.stop(); fs.rmSync(srv.dataDir, { recursive: true, force: true }); }
});
