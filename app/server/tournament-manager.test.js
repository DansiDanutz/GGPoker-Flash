import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './test-helpers.js';

test('organiser tournament terms, capacity, setup replay, rescheduling and cancellation reconcile', async () => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  const sockets = [];
  let db;
  const post = async (route, token, body) => {
    const r = await srv.post(route, { token, body }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data;
  };
  const bill = '/api/marketplace/billing', chips = '/api/marketplace/chips';
  try {
    const admin = await srv.login('admin', 'admin123');
    const users = [];
    for (const login of ['tournament_owner', 'tournament_first', 'tournament_second', 'tournament_outsider']) {
      users.push(await post('/api/auth/register', null, { login, nick: login, password: 'tournament-test-password' }));
    }
    const [owner, first, second, outsider] = users;
    const free = await post('/api/tournaments/host', outsider.token, { economy: 'play_money', name: 'Free tournament trial', buyin: 0, fee: 0, late_reg: 0, max_players: 2 });
    const freeDetail = (await srv.get(`/api/tournaments/${free.id}`, { token: outsider.token })).data;
    assert.equal(freeDetail.tournament.late_reg, 0); assert.equal(freeDetail.tournament.max_players, 2);
    assert.equal((await srv.get(`${bill}/me`, { token: outsider.token })).data.ledger.length, 0);

    await post('/api/admin/marketplace/billing/credits', admin, { userId: owner.user.id, amountCents: 3000, reference: 'tournament-test-funding' });
    await post(`${bill}/subscribe`, owner.token, { role: 'organizer', idempotencyKey: 'member' });
    const body = { economy: 'organizer', name: 'Ticket Cup', buyin: 1000, fee: 100, starting_stack: 5000, blind_speed: 5, late_reg: 0, max_players: 2, start_at: new Date(Date.now() + 3600000).toISOString(), idempotencyKey: 'setup' };
    for (const max_players of [1, 1001, 2.5, '2']) {
      assert.equal((await srv.post('/api/tournaments/host', { token: owner.token, body: { ...body, max_players } })).status, 400);
    }
    assert.equal((await srv.get(`${bill}/me`, { token: owner.token })).data.balance_cents, 2100, 'invalid setup never debits');
    const event = await post('/api/tournaments/host', owner.token, body);
    assert.equal((await post('/api/tournaments/host', owner.token, body)).id, event.id);
    const detail = (await srv.get(`/api/tournaments/${event.id}`, { token: owner.token })).data;
    assert.equal(detail.tournament.max_players, 2); assert.equal(detail.tournament.late_reg, 0);
    assert.equal((await srv.get(`${bill}/me`, { token: owner.token })).data.balance_cents, 1600);
    const tickets = [];
    for (let i = 0; i < 3; i++) tickets.push(await post(`${chips}/tickets`, owner.token, { tournamentId: event.id, key: `ticket-${i}` }));
    for (const [i, player] of [first, second].entries()) {
      await post(`${chips}/tickets/${tickets[i].id}/transfer`, owner.token, { toUserId: player.user.id, key: `transfer-${i}` });
      await post(`${chips}/tickets/${tickets[i].id}/redeem`, player.token, {});
      await post(`${chips}/tickets/${tickets[i].id}/redeem`, player.token, {});
    }
    assert.equal((await srv.post(`${chips}/tickets/${tickets[2].id}/redeem`, { token: owner.token, body: {} })).status, 409);
    assert.equal((await srv.post(`${chips}/tickets`, { token: outsider.token, body: { tournamentId: event.id, key: 'no-funds' } })).status, 402);
    assert.equal((await srv.post(`${bill}/tournament/${event.id}/reschedule`, { token: outsider.token, body: { startAt: body.start_at, idempotencyKey: 'foreign' } })).status, 404);
    const schedule = { startAt: new Date(Date.now() + 7200000).toISOString(), idempotencyKey: 'reschedule' };
    await post(`${bill}/tournament/${event.id}/reschedule`, owner.token, schedule);
    await post(`${bill}/tournament/${event.id}/reschedule`, owner.token, schedule);
    assert.equal((await srv.get(`${bill}/me`, { token: owner.token })).data.balance_cents, 1500, '$5 setup and $1 reschedule charged once');
    assert.equal((await srv.del(`/api/tournaments/host/${event.id}`, { token: outsider.token })).status, 404);
    assert.equal((await srv.del(`/api/tournaments/host/${event.id}`, { token: owner.token })).status, 200);
    let total = 0;
    for (const [player, expected] of [[owner, 97800], [first, 1100], [second, 1100]]) {
      const account = (await srv.get(`${chips}/me`, { token: player.token })).data;
      const balance = account.balances.find(row => row.organizer_id === owner.user.id)?.balance || 0;
      assert.equal(balance, expected); total += balance;
      assert.ok(account.tickets.every(ticket => ticket.state === 'refunded'));
    }
    assert.equal(total, 100000, 'issued and redeemed tickets refund to current holders without chip loss');
    assert.equal((await srv.get(`${bill}/me`, { token: owner.token })).data.balance_cents, 1500, 'cancelling does not promise a service-fee refund');
    const final = await post('/api/tournaments/host', owner.token, { ...body, name: 'Settlement Cup', idempotencyKey: 'settlement' });
    for (const player of [first, second]) {
      const ticket = await post(`${chips}/tickets`, player.token, { tournamentId: final.id, key: 'final-ticket' });
      await post(`${chips}/tickets/${ticket.id}/redeem`, player.token, {});
    }
    db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    db.prepare('UPDATE tournaments SET start_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), final.id);
    const play = await post(`/api/tournaments/${final.id}/play`, first.token, {});
    for (const player of [first, second]) {
      const socket = srv.socket(player.token); sockets.push(socket); await socket.opened;
      const acted = new Set();
      socket.ws.on('message', raw => {
        const message = JSON.parse(String(raw)), state = message.state;
        if (message.type !== 'state' || state.id !== play.tableId) return;
        const me = state.players.find(p => p.isMe), key = `${state.handNo}:${state.turnNo}`;
        if (!me || me.id !== state.actor || acted.has(key)) return;
        acted.add(key); socket.send({ type: 'action', tableId: play.tableId, action: 'allin', handNo: state.handNo, turnNo: state.turnNo });
      });
      socket.send({ type: 'join_table', tableId: play.tableId, rejoin: true });
    }
    let finished;
    for (let i = 0; i < 600; i++) {
      finished = db.prepare('SELECT status FROM tournaments WHERE id=?').get(final.id).status;
      if (finished === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(finished, 'completed', 'real tournament hands reach settlement');
    const balances = [first, second].map(player => db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(owner.user.id, `wallet:${player.user.id}`).balance);
    assert.deepEqual(balances.sort((a,b) => a-b), [750, 1250]);
    assert.equal(db.prepare("SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key='burn'").get(owner.user.id).balance, 200);
    assert.equal(db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(owner.user.id, `event:${final.id}`).balance, 0);
    const beforeReplay = db.prepare('SELECT count(*) n FROM organizer_chip_journals').get().n;
    assert.equal((await srv.post(`/api/tournaments/${final.id}/play`, { token: first.token, body: {} })).status, 400);
    assert.equal(db.prepare('SELECT count(*) n FROM organizer_chip_journals').get().n, beforeReplay, 'finished-game retry cannot duplicate payout');

  } finally { await Promise.all(sockets.map(socket => socket.close())); db?.close(); await srv.stop(); fs.rmSync(srv.dataDir, { recursive: true, force: true }); }
});
