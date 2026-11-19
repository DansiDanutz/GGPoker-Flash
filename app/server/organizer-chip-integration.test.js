// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

const BILLING = '/api/marketplace/billing';
const CHIPS = '/api/marketplace/chips';
async function register(srv, login) {
  const response = await srv.post('/api/auth/register', { body: { login, nick: login, password: 'organizer-chip-integration-password' } });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  return response.data;
}
async function postOk(srv, route, token, body) {
  const response = await srv.post(route, { token, body });
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(response.data)}`);
  return response.data;
}
const wallet = (account, organizerId) => account.balances.find((row) => row.organizer_id === organizerId)?.balance || 0;

test('real server integrates enforced billing, scoped chips, events, buybacks, and settled cash recovery', async () => {
  let srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  let db;
  try {
    const admin = await srv.login('admin', 'admin123');
    const owner = await register(srv, 'chip_owner');
    const first = await register(srv, 'chip_first');
    const second = await register(srv, 'chip_second');
    const unfunded = await register(srv, 'chip_empty');

    await postOk(srv, '/api/admin/marketplace/billing/credits', admin, { userId: owner.user.id, amountCents: 10000, reference: 'chip-integration-service-funds' });
    await postOk(srv, `${BILLING}/subscribe`, owner.token, { role: 'organizer', idempotencyKey: 'chip-member-1' });
    let ownerChips = (await srv.get(`${CHIPS}/me`, { token: owner.token })).data;
    assert.equal(wallet(ownerChips, owner.user.id), 100000);
    await postOk(srv, `${BILLING}/subscribe`, owner.token, { role: 'organizer', idempotencyKey: 'chip-member-early-renewal' });
    ownerChips = (await srv.get(`${CHIPS}/me`, { token: owner.token })).data;
    assert.equal(wallet(ownerChips, owner.user.id), 100000, 'early renewal schedules rather than immediately minting');
    assert.equal(ownerChips.grants.filter((grant) => grant.status === 'pending').length, 1);
    const purchase = await postOk(srv, `${CHIPS}/purchase`, owner.token, { packs: 1, key: 'chip-pack-1' });
    assert.equal(purchase.chips, 10000); assert.equal(purchase.service_cents, 100);
    assert.equal((await srv.get(`${BILLING}/me`, { token: owner.token })).data.balance_cents, 8100);

    await postOk(srv, `${CHIPS}/transfer`, owner.token, { organizerId: owner.user.id, toUserId: first.user.id, amount: 12000, key: 'owner-to-first' });
    await postOk(srv, `${CHIPS}/transfer`, owner.token, { organizerId: owner.user.id, toUserId: second.user.id, amount: 6000, key: 'owner-to-second' });
    assert.equal(wallet((await srv.get(`${CHIPS}/me`, { token: first.token })).data, owner.user.id), 12000);
    const freeSpend = await srv.post(`${CHIPS}/transfer`, { token: unfunded.token, body: { organizerId: owner.user.id, toUserId: second.user.id, amount: 1, key: 'free-conversion-denied' } });
    assert.equal(freeSpend.status, 402, JSON.stringify(freeSpend.data));

    const tournament = await postOk(srv, '/api/tournaments/host', owner.token, {
      name: 'Cash Chip Integration Cup', format: 'NLH', buyin: 1000, fee: 100, starting_stack: 10000,
      start_at: new Date(Date.now() + 3600000).toISOString(), mode: 'STANDARD', idempotencyKey: 'chip-tournament-1',
    });
    const ticketOne = await postOk(srv, `${CHIPS}/tickets`, first.token, { tournamentId: tournament.id, key: 'ticket-one' });
    const ticketTwo = await postOk(srv, `${CHIPS}/tickets`, first.token, { tournamentId: tournament.id, key: 'ticket-two' });
    await postOk(srv, `${CHIPS}/tickets/${ticketTwo.id}/transfer`, first.token, { toUserId: second.user.id, key: 'ticket-transfer' });
    await postOk(srv, `/api/tournaments/${tournament.id}/register`, first.token, {});
    await postOk(srv, `/api/tournaments/${tournament.id}/unregister`, first.token, {});
    await postOk(srv, `/api/tournaments/${tournament.id}/register`, first.token, {});
    await postOk(srv, `/api/tournaments/${tournament.id}/register`, second.token, {});
    assert.equal((await srv.post(`/api/tournaments/${tournament.id}/play`, { token: first.token, body: {} })).status, 409, 'players cannot start a scheduled paid event early');
    db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    db.prepare('UPDATE tournaments SET start_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), tournament.id);
    const play = await postOk(srv, `/api/tournaments/${tournament.id}/play`, first.token, {});
    assert.ok(play.tableId);
    const lobby = await srv.get(`/api/tournaments/${tournament.id}`, { token: first.token });
    assert.equal(lobby.status, 200, JSON.stringify(lobby.data));
    assert.equal(lobby.data.prizePool, 2000, 'fees are excluded from the playable prize pool');
    const event = db.prepare('SELECT contract,prize_pool FROM organizer_chip_event_states WHERE tournament_id=?').get(tournament.id);
    assert.equal(event.prize_pool, 2000); assert.equal(JSON.parse(event.contract).starting_stack, 10000);
    assert.equal(db.prepare('SELECT redemptions FROM organizer_chip_tickets WHERE id=?').get(ticketOne.id).redemptions, 2);
    const tournamentSocket = srv.socket(first.token); await tournamentSocket.opened;
    tournamentSocket.send({ type: 'join_table', tableId: play.tableId, rejoin: true });
    await tournamentSocket.next((message) => message.type === 'joined' && message.tableId === play.tableId);
    const tournamentState = await tournamentSocket.next((message) => message.type === 'state' && message.state?.id === play.tableId && message.state.players.some((player) => player.isMe));
    assert.ok(tournamentState.state.players.find((player) => player.isMe).stack <= 10000, 'the configured 10,000 stack is seated before blinds are posted');
    db.prepare("UPDATE tournaments SET status='paused' WHERE id=?").run(tournament.id);
    await postOk(srv, `/api/admin/marketplace/chips/tournaments/${tournament.id}/resolve`, admin, {
      awards: [{ userId: first.user.id, amount: 1000 }, { userId: second.user.id, amount: 1000 }], reason: 'Test operator reconciled interrupted event with player agreement',
    });
    const settledEvent = await tournamentSocket.nextType('error'); assert.match(settledEvent.error, /settled/);
    assert.equal((await srv.get(`/api/tournaments/${tournament.id}/watch`, { token: first.token })).status, 404, 'resolved live flights are removed');
    const finished = await srv.post(`/api/tournaments/${tournament.id}/play`, { token: first.token, body: {} });
    assert.equal(finished.status, 400); assert.match(finished.data.error, /finished/);
    await tournamentSocket.close();

    const buyback = await postOk(srv, `${CHIPS}/buybacks`, first.token, { organizerId: owner.user.id, amount: 1000, paymentAmount: '10.00', paymentCurrency: 'USDT', paymentDetails: 'Manual integration agreement', key: 'buyback-one' });
    const ownerBeforeBuyback = wallet((await srv.get(`${CHIPS}/me`, { token: owner.token })).data, owner.user.id);
    await postOk(srv, `${CHIPS}/buybacks/${buyback.id}/accept`, owner.token, {});
    await postOk(srv, `${CHIPS}/buybacks/${buyback.id}/report`, owner.token, { receipt: 'integration-receipt-1', paymentAmount: '10.00', paymentCurrency: 'USDT', paymentNetwork: 'TRC20', paymentDetails: 'Paid externally' });
    await postOk(srv, `${CHIPS}/buybacks/${buyback.id}/confirm`, first.token, {});
    assert.equal(wallet((await srv.get(`${CHIPS}/me`, { token: owner.token })).data, owner.user.id), ownerBeforeBuyback + 1000);

    const cash = await postOk(srv, '/api/tables/host', owner.token, {
      name: 'Cash Chip Integration Table', game: 'holdem', seats: 3, sb: 50, bb: 100, min_buyin: 4000, max_buyin: 10000, rakePercent: 3, rakeCap: 4, idempotencyKey: 'chip-cash-1',
    });
    await postOk(srv, `${BILLING}/cash/${cash.id}/start`, owner.token, { idempotencyKey: 'chip-cash-start' });
    const emptySocket = srv.socket(unfunded.token); await emptySocket.opened;
    emptySocket.send({ type: 'join_table', tableId: cash.id, buyin: 4000, seat: 0 });
    const denied = await emptySocket.nextType('error'); assert.match(denied.error, /balance|chips/i); await emptySocket.close();
    const usdBefore = [await srv.balance(first.token), await srv.balance(second.token)];
    const firstSocket = srv.socket(first.token), secondSocket = srv.socket(second.token); await Promise.all([firstSocket.opened, secondSocket.opened]);
    firstSocket.send({ type: 'join_table', tableId: cash.id, buyin: 4000, seat: 0 });
    await firstSocket.next((message) => message.type === 'joined' && message.tableId === cash.id && message.seat != null);
    secondSocket.send({ type: 'join_table', tableId: cash.id, buyin: 4000, seat: 1 });
    await secondSocket.next((message) => message.type === 'joined' && message.tableId === cash.id && message.seat != null);
    const live = await firstSocket.next((message) => message.type === 'state' && message.state?.id === cash.id
      && message.state.players.filter((player) => player.inHand).length === 2 && !['idle', 'ended'].includes(message.state.street), 10000);
    assert.equal(live.state.players.some((player) => player?.isBot), false);
    const me = live.state.players.find((player) => player.isMe), topup = 500;
    firstSocket.send({ type: 'rebuy', tableId: cash.id, amount: topup, basePending: 0, topUpVersion: me.topUpVersion, idempotencyKey: 'integration-pending-1' });
    const pendingState = await firstSocket.next((message) => message.type === 'state' && message.state.players.some((player) => player.isMe && player.pendingTopUp === topup));
    const escrow = db.prepare("SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?").get(owner.user.id, `table:${cash.id}`);
    const sessions = db.prepare("SELECT held,status FROM organizer_chip_sessions WHERE organizer_id=? AND table_id=? ORDER BY user_id").all(owner.user.id, cash.id);
    assert.equal(escrow.balance, 8500); assert.equal(sessions.length, 2); assert.equal(sessions.reduce((sum, session) => sum + session.held, 0), escrow.balance);
    assert.equal(sessions.every((session) => session.status === 'open'), true);
    assert.deepEqual([await srv.balance(first.token), await srv.balance(second.token)], usdBefore, 'Cash Chips never debit the legacy USD wallet');
    const secondLive = await secondSocket.next((message) => message.type === 'state' && message.state.id === cash.id && message.state.handNo === live.state.handNo);
    const acted = new Set();
    const act = (socket) => (raw) => {
      const message = JSON.parse(String(raw)); if (message.type !== 'state' || message.state.id !== cash.id || message.state.handNo !== live.state.handNo) return;
      const actor = message.state.players.find((player) => player.id === message.state.actor);
      if (!actor || acted.has(message.state.turnNo)) return;
      const mine = message.state.players.find((player) => player.isMe); if (!mine || mine.id !== actor.id) return;
      acted.add(message.state.turnNo);
      socket.send({ type: 'action', tableId: cash.id, action: message.state.currentBet > actor.bet ? 'call' : 'check', amount: 0, handNo: message.state.handNo, turnNo: message.state.turnNo });
    };
    firstSocket.ws.on('message', act(firstSocket)); secondSocket.ws.on('message', act(secondSocket));
    act(firstSocket)(Buffer.from(JSON.stringify(pendingState))); act(secondSocket)(Buffer.from(JSON.stringify(secondLive)));
    const settled = await firstSocket.next((message) => message.type === 'state' && message.state.id === cash.id && message.state.handNo === live.state.handNo && message.state.street === 'ended', 15000);
    await firstSocket.next(message => message.type === 'event' && message.event?.type === 'chat'
      && message.event.kind === 'dealer' && /wins /.test(message.event.message), 15000);
    const dealerLines = db.prepare("SELECT message FROM chat_messages WHERE table_id=? AND kind='dealer'").all(cash.id).map(row => row.message);
    assert.ok(dealerLines.some(line => /calls 50 chips/.test(line)), 'live cash actions use whole Cash Chips');
    assert.ok(dealerLines.some(line => /wins [\d,]+ chips/.test(line)), 'live results use whole Cash Chips');
    assert.equal(dealerLines.some(line => line.includes('$')), false, 'Cash Chips are not labelled USD');
    assert.equal(settled.state.rakePercent, 3);
    assert.equal(settled.state.rakeCap, 4);
    assert.equal(settled.state.rake, 4, 'the configured cap limits the raked 200-chip hand');
    const rakeJournal = db.prepare("SELECT amount FROM organizer_chip_journals WHERE organizer_id=? AND kind='rake' AND reference=?").get(owner.user.id, `hand:${settled.state.handId}:rake`);
    assert.equal(rakeJournal.amount, settled.state.rake);
    const settledEscrow = db.prepare("SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?").get(owner.user.id, `table:${cash.id}`).balance;
    const settledSessions = db.prepare("SELECT user_id,held,status FROM organizer_chip_sessions WHERE organizer_id=? AND table_id=? ORDER BY user_id").all(owner.user.id, cash.id);
    assert.equal(settledSessions.reduce((sum, session) => sum + session.held, 0), settledEscrow);
    assert.equal(settledEscrow + rakeJournal.amount, 8500);
    const journalsBeforeRetry = db.prepare('SELECT COUNT(*) count FROM organizer_chip_journals WHERE organizer_id=?').get(owner.user.id).count;
    firstSocket.send({ type: 'action', tableId: cash.id, action: 'check', amount: 0, handNo: live.state.handNo, turnNo: Math.max(...acted) });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(db.prepare('SELECT COUNT(*) count FROM organizer_chip_journals WHERE organizer_id=?').get(owner.user.id).count, journalsBeforeRetry, 'stale retry cannot mint or move chips');
    await Promise.all([firstSocket.close(), secondSocket.close()]);
    const walletsBeforeRestart = new Map([first.user.id, second.user.id].map((userId) => [userId, db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(owner.user.id, `wallet:${userId}`).balance]));
    const dataDir = srv.dataDir; db.close(); db = null; await srv.stop();
    srv = await startServer({ dataDir, env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
    db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
    const restoredSocket = srv.socket(first.token); await restoredSocket.opened;
    restoredSocket.send({ type: 'join_table', tableId: cash.id, observe: true });
    await restoredSocket.next((message) => message.type === 'state' && message.state.id === cash.id && message.state.rakePercent === 3 && message.state.rakeCap === 4);
    await restoredSocket.close();
    for (const session of settledSessions) assert.equal(db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(owner.user.id, `wallet:${session.user_id}`).balance, walletsBeforeRestart.get(session.user_id) + session.held);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM organizer_chip_sessions WHERE organizer_id=? AND table_id=? AND status='open'").get(owner.user.id, cash.id).count, 0);
    const afterRecovery = db.prepare("SELECT account_key,balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key IN (?,?) ORDER BY account_key").all(owner.user.id, `wallet:${first.user.id}`, `wallet:${second.user.id}`);
    db.close(); db = null; await srv.stop(); srv = await startServer({ dataDir, env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
    db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
    assert.deepEqual(db.prepare("SELECT account_key,balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key IN (?,?) ORDER BY account_key").all(owner.user.id, `wallet:${first.user.id}`, `wallet:${second.user.id}`), afterRecovery, 'second restart never refunds twice');
  } finally {
    db?.close();
    await srv.stop();
    fs.rmSync(srv.dataDir, { recursive: true, force: true });
  }
});

test('private admin Spin resolution completes a recovered deterministic outcome with audit evidence', async () => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  let db;
  try {
    const admin = await srv.login('admin', 'admin123');
    const owner = await register(srv, 'spin_owner');
    const players = [await register(srv, 'spin_one'), await register(srv, 'spin_two'), await register(srv, 'spin_three')];
    db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    const roundId = 'integration-spin-recovered', tableId = 'integration-spin-table';
    const outcome = JSON.stringify({ multiplier: 2, prizePool: 10000, prizes: [10000, 0, 0] });
    db.prepare("INSERT INTO organizer_chip_spin_rounds(id,organizer_id,table_id,stake,max_reserve,state,outcome,entry_total,created_at,committed_at) VALUES (?,?,?,?,?,'disputed',?,?,datetime('now'),datetime('now'))")
      .run(roundId, owner.user.id, tableId, 5000, 100000000, outcome, 15000);
    for (const player of players) db.prepare('INSERT INTO organizer_chip_spin_players(round_id,user_id,session_id) VALUES (?,?,?)').run(roundId, player.user.id, `spin-session:${player.user.id}`);
    db.prepare('INSERT INTO organizer_chip_accounts(organizer_id,account_key,balance) VALUES (?,?,?)').run(owner.user.id, `event:spin:${roundId}`, 15000);
    for (const [index, player] of players.entries()) {
      const resolved = await postOk(srv, `/api/admin/marketplace/chips/spin/${roundId}/resolve`, admin, { userId: player.user.id, place: index + 1, reason: `Verified integration finishing place ${index + 1}` });
      assert.equal(resolved.applied, true); assert.equal(resolved.complete, index === 2);
    }
    assert.equal(db.prepare('SELECT state FROM organizer_chip_spin_rounds WHERE id=?').get(roundId).state, 'complete');
    assert.equal(db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(owner.user.id, `wallet:${players[0].user.id}`).balance, 10000);
    assert.equal(db.prepare("SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key='burn'").get(owner.user.id).balance, 5000);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM audit_log WHERE action='organizer_spin_resolved'").get().count, 3);
  } finally {
    db?.close(); await srv.stop(); fs.rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
