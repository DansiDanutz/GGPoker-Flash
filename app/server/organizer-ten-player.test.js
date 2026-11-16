// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer, sleep } from './test-helpers.js';
import { SHOWDOWN_CLEAR_MS } from './handPacing.js';

const BILLING = '/api/marketplace/billing';
const CHIPS = '/api/marketplace/chips';

test('ten isolated test players: scoped transfers, six seats, three hands, sit-out and cash-out reconcile', { timeout: 90000 }, async (t) => {
  // Only the throwaway loopback server is used; these chips have no monetary value.
  const srv = await startServer({ env: { GGPOKER_BIND: '127.0.0.1', GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  const sockets = [];
  let db;
  const post = async (route, token, body) => {
    const response = await srv.post(route, { token, body });
    assert.equal(response.status, 200, `${route}: ${JSON.stringify(response.data)}`);
    return response.data;
  };
  const register = (login) => post('/api/auth/register', null, { login, nick: login, password: 'local-only-ten-player-test' });
  const open = async (token) => {
    const socket = srv.socket(token); sockets.push(socket); await socket.opened; return socket;
  };
  try {
    assert.match(srv.base, /^http:\/\/127\.0\.0\.1:\d+$/);
    const admin = await srv.login('admin', 'admin123');
    const owner = await register('test_organizer');
    const players = [];
    for (let i = 1; i <= 10; i++) players.push(await register(`test_player_${String(i).padStart(2, '0')}`));
    const outsider = players[9];
    for (const [user, amount] of [[owner, 2400], [outsider, 900]]) {
      await post('/api/admin/marketplace/billing/credits', admin, { userId: user.user.id, amountCents: amount, reference: `local-fixture-${user.user.id}` });
      await post(`${BILLING}/subscribe`, user.token, { role: 'organizer', idempotencyKey: 'local-membership' });
    }
    db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    const balance = (organizerId, account) => db.prepare('SELECT balance FROM organizer_chip_accounts WHERE organizer_id=? AND account_key=?').get(organizerId, account)?.balance || 0;
    const ownBalance = (user) => balance(owner.user.id, `wallet:${user.user.id}`);
    assert.equal(ownBalance(owner), 100000);
    const legacyBefore = await Promise.all(players.map((player) => srv.balance(player.token)));
    for (const player of players.slice(0, 9)) {
      const transfer = { organizerId: owner.user.id, toUserId: player.user.id, amount: 5000, key: `local-transfer-${player.user.id}` };
      await post(`${CHIPS}/transfer`, owner.token, transfer);
      await post(`${CHIPS}/transfer`, owner.token, transfer);
      assert.equal(ownBalance(player), 5000, 'retry must not duplicate a transfer');
    }
    assert.equal(ownBalance(owner), 55000);
    assert.equal(ownBalance(outsider), 0);
    assert.equal(balance(outsider.user.id, `wallet:${outsider.user.id}`), 100000);

    const cash = await post('/api/tables/host', owner.token, {
      name: 'Isolated six-player verification', game: 'holdem', seats: 6,
      sb: 50, bb: 100, min_buyin: 5000, max_buyin: 5000, idempotencyKey: 'local-table',
    });
    await post(`${BILLING}/cash/${cash.id}/start`, owner.token, { idempotencyKey: 'local-first-hour' });
    const alienSocket = await open(outsider.token);
    alienSocket.send({ type: 'join_table', tableId: cash.id, buyin: 5000, seat: 0 });
    const rejected = await alienSocket.nextType('error');
    assert.match(rejected.error, /not enough chips for this organizer/i);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM organizer_chip_sessions WHERE user_id=?').get(outsider.user.id).n, 0);

    const seated = [];
    const latest = new Map(), acted = new Set(), hands = new Map(), errors = [];
    let enabled = false, sittingOut = false;
    const handle = (socket, message) => {
      if (message.type === 'error') errors.push(message.error);
      if (message.type !== 'state' || message.state.id !== cash.id) return;
      const state = message.state;
      latest.set(socket, message);
      if (!enabled || sittingOut) return;
      if (state.street === 'ended') {
        hands.set(state.handId, { hand: state.handNo, rake: state.rake, players: state.players.filter((p) => p.inHand).length });
        if (hands.size === 3) {
          sittingOut = true;
          for (const player of seated) player.send({ type: 'sit_out', tableId: cash.id, value: true });
        }
        return;
      }
      const actor = state.players.find((p) => p.id === state.actor && p.isMe);
      const turn = `${state.handId}:${state.turnNo}`;
      if (!actor || acted.has(turn)) return;
      acted.add(turn);
      socket.send({ type: 'action', tableId: cash.id, action: state.currentBet > actor.bet ? 'call' : 'check', amount: 0, handNo: state.handNo, turnNo: state.turnNo });
    };
    for (const [seat, player] of players.slice(0, 6).entries()) {
      const socket = await open(player.token); seated.push(socket);
      socket.ws.on('message', (raw) => handle(socket, JSON.parse(String(raw))));
      socket.send({ type: 'join_table', tableId: cash.id, buyin: 5000, seat });
      await socket.next((m) => m.type === 'joined' && m.tableId === cash.id && m.seat === seat);
    }
    const sessions = () => db.prepare('SELECT user_id,held,status FROM organizer_chip_sessions WHERE organizer_id=? AND table_id=? ORDER BY user_id').all(owner.user.id, cash.id);
    assert.equal(sessions().length, 6);
    assert.equal(sessions().reduce((sum, row) => sum + row.held, 0), 30000);
    assert.equal(balance(owner.user.id, `table:${cash.id}`), 30000);
    enabled = true;
    for (const [socket, message] of latest) handle(socket, message);
    const satOut = await seated[0].next((m) => m.type === 'state' && m.state.id === cash.id
      && hands.size === 3 && m.state.players.length === 6 && m.state.players.every((p) => p.sittingOut), 60000);
    assert.deepEqual(errors, []);
    assert.equal(satOut.state.street, 'ended');
    assert.equal([...hands.values()].filter((hand) => hand.players === 6).length, 2, 'after the initial deal during seating, two complete hands include all six players');
    const rake = [...hands.values()].reduce((sum, hand) => sum + hand.rake, 0);
    assert.ok(rake > 0);
    const rakeRows = db.prepare("SELECT amount FROM organizer_chip_journals WHERE organizer_id=? AND kind='rake'").all(owner.user.id);
    assert.equal(rakeRows.length, 3);
    assert.equal(rakeRows.reduce((sum, row) => sum + row.amount, 0), rake);
    assert.equal(balance(owner.user.id, 'burn'), rake);
    assert.equal(balance(owner.user.id, `table:${cash.id}`), 30000 - rake);
    const finalStacks = new Map(satOut.state.players.map((player) => [player.id, player.stack]));
    assert.equal([...finalStacks.values()].reduce((sum, stack) => sum + stack, 0), 30000 - rake);
    for (const row of sessions()) assert.equal(row.held, finalStacks.get(row.user_id));
    assert.ok(players.slice(0, 6).every((player) => ownBalance(player) === 0), 'sit-out retains the stack at the table');
    await sleep(SHOWDOWN_CLEAR_MS + 1000);
    assert.equal(hands.size, 3);
    assert.equal(latest.get(seated[0]).state.handNo, satOut.state.handNo, 'all sitting out prevents another deal');
    await post(`${BILLING}/cash/${cash.id}/stop`, owner.token, {});

    const watcher = await open(owner.token);
    watcher.send({ type: 'join_table', tableId: cash.id, observe: true });
    await watcher.next((m) => m.type === 'joined' && m.tableId === cash.id);
    for (const socket of seated) socket.send({ type: 'leave_table', tableId: cash.id });
    await watcher.next((m) => m.type === 'state' && m.state.id === cash.id && m.state.players.every((player) => player.empty));
    // stand() broadcasts before closeSeat commits; read through the server before checking SQLite.
    await srv.get(`${CHIPS}/me`, { token: owner.token });
    for (const player of players.slice(0, 6)) assert.equal(ownBalance(player), finalStacks.get(player.user.id), `${player.user.login}: ${JSON.stringify(sessions())}`);
    assert.ok(sessions().every((row) => row.status === 'closed'));
    assert.equal(balance(owner.user.id, `table:${cash.id}`), 0);
    assert.equal(ownBalance(owner), 55000, 'rake is burned, not minted back into the organizer wallet');
    for (const player of players.slice(6, 9)) assert.equal(ownBalance(player), 5000);
    assert.equal(ownBalance(outsider), 0);
    assert.equal(balance(outsider.user.id, `wallet:${outsider.user.id}`), 100000);
    assert.equal(ownBalance(owner) + players.reduce((sum, player) => sum + ownBalance(player), 0) + rake, 100000);
    assert.deepEqual(await Promise.all(players.map((player) => srv.balance(player.token))), legacyBefore);
    const bill = (await srv.get(`${BILLING}/me`, { token: owner.token })).data;
    assert.equal(bill.balance_cents, 0, 'only the fixture membership, setup and first hour consume service credits');
    assert.equal(Number(bill.tables.find((table) => table.id === cash.id).session.active), 0);
    assert.deepEqual(errors, []);
    t.diagnostic(JSON.stringify({ environment: 'isolated loopback; valueless test chips', playerAccounts: 10, fundedPlayers: 9, transferEach: 5000, seatedPlayers: 6,
      hands: [...hands.values()], rakeBurned: rake, organizerRemaining: ownBalance(owner), seatedPlayerBalances: players.slice(0, 6).map((player) => ({ login: player.user.login, chips: ownBalance(player) })),
      reservePlayerBalances: players.slice(6, 9).map(ownBalance), outsiderOrganizerBalance: ownBalance(outsider), tableEscrow: 0, allSessionsClosed: true, billingPaused: true }));
  } finally {
    await Promise.all(sockets.filter((socket) => socket.ws.readyState !== 3).map((socket) => socket.close()));
    db?.close(); await srv.stop(); fs.rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
