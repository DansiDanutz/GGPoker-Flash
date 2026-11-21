// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from './test-helpers.js';

test('only the owner and entrants can watch a private tournament flight', async () => {
  const srv = await startServer();
  const sockets = [];
  try {
    const post = async (path, token, body = {}) => {
      const res = await srv.post(path, { token, body });
      assert.equal(res.status, 200, JSON.stringify(res.data.error));
      return res.data;
    };
    const owner = await srv.login('DansiDanutz', 'ggpoker');
    const entrant = await srv.login('admin', 'admin123');
    const outsider = await post('/api/auth/register', null, { login: 'watch_outsider', nick: 'Outside', password: 'test12345' });
    assert.ok(outsider.token);
    const event = await post('/api/tournaments/host', owner, { name: 'Private watch fixture', format: 'NLH', buyin: 1000, fee: 100, starting_stack: 5000, blind_speed: 5, late_reg: 60, mode: 'STANDARD' });
    const path = '/api/tournaments/' + event.id;
    const { invite } = await post(path + '/invite', owner);
    await post(path + '/register', entrant, { invite });
    const { tableId } = await post(path + '/play', entrant);
    const observe = async token => {
      const socket = srv.socket(token);
      sockets.push(socket);
      await socket.opened;
      socket.send({ type: 'join_table', tableId, observe: true });
      return socket;
    };
    assert.equal((await srv.get(path + '/watch', { token: outsider.token })).status, 404);
    const denied = await observe(outsider.token);
    assert.equal((await denied.nextType('error')).error, 'table not found');
    for (const token of [owner, entrant]) {
      const watch = await srv.get(path + '/watch', { token });
      assert.equal(watch.status, 200);
      assert.equal(watch.data.tableId, tableId);
      const socket = await observe(token);
      assert.equal((await socket.nextType('joined')).tableId, tableId);
      assert.ok((await socket.nextType('state')).state);
    }
    // Both authorized joins have now triggered state broadcasts.
    await assert.rejects(denied.next(m => ['joined', 'state'].includes(m.type), 200), /timed out/);
  } finally {
    await Promise.all(sockets.map(socket => socket.close()));
    await srv.stop();
    rmSync(srv.dataDir, { recursive: true, force: true });
  }
});

test('forfeiting a private tournament records a terminal zero payout and keeps watch access', async () => {
  const srv = await startServer();
  const sockets = [];
  try {
    const post = async (p, token, body = {}) => {
      const res = await srv.post(p, { token, body });
      assert.equal(res.status, 200, JSON.stringify(res.data.error));
      return res.data;
    };
    const owner = await srv.login('DansiDanutz', 'ggpoker');
    const entrant = await srv.login('admin', 'admin123');
    const staying = await post('/api/auth/register', null, { login: 'watch_staying', nick: 'Staying', password: 'test12345' });
    const withdrawn = await post('/api/auth/register', null, { login: 'watch_withdrawn', nick: 'Withdrawn', password: 'test12345' });
    const event = await post('/api/tournaments/host', owner, { name: 'Forfeit & watch fixture', format: 'NLH', buyin: 200, fee: 0, starting_stack: 5000, blind_speed: 5, late_reg: 60, mode: 'STANDARD' });
    const base = '/api/tournaments/' + event.id;
    const { invite } = await post(base + '/invite', owner);
    await post(base + '/register', withdrawn.token, { invite });
    await post(base + '/unregister', withdrawn.token);
    await post(base + '/register', owner, { invite });
    await post(base + '/register', staying.token, { invite });
    await post(base + '/register', entrant, { invite });
    const { tableId } = await post(base + '/play', owner);
    for (const tok of [owner, staying.token]) {
      const sock = srv.socket(tok);
      sockets.push(sock);
      await sock.opened;
      sock.send({ type: 'join_table', tableId });
      assert.equal((await sock.nextType('joined')).tableId, tableId);
    }

    // Join as seated entrant and then leave_table to forfeit the entry.
    const seatSock = srv.socket(entrant);
    sockets.push(seatSock);
    await seatSock.opened;
    seatSock.send({ type: 'join_table', tableId });
    assert.equal((await seatSock.nextType('joined')).tableId, tableId);
    await seatSock.nextType('state');
    seatSock.send({ type: 'leave_table', tableId });
    await new Promise((r) => setTimeout(r, 150));

    // P1: verify a zero-value terminal tourney_payout with matching session_id and prize:<sid> reference was recorded.
    const db = new DatabaseSync(join(srv.dataDir, 'ggpoker.db'), { readOnly: true });
    try {
      const entrantId = db.prepare("SELECT id FROM users WHERE login = 'admin'").get().id;
      const txs = db.prepare('SELECT kind, amount, session_id, reference, memo FROM transactions WHERE tournament_id = ? AND user_id = ? ORDER BY id').all(event.id, entrantId);
      const buyinTx = txs.find((x) => x.kind === 'tourney_buyin' && x.amount === -200 && x.reference === 'entry:' + x.session_id);
      const forfeitTx = txs.find((x) => x.kind === 'tourney_payout' && x.amount === 0 && x.session_id === buyinTx?.session_id && x.reference === 'prize:' + buyinTx?.session_id);
      assert.ok(buyinTx, 'expected tourney_buyin transaction');
      assert.ok(forfeitTx, 'expected zero-value terminal tourney_payout matching forfeited entry session');
    } finally {
      db.close();
    }

    // P2: eliminated/forfeited entrant retains details, watch, and WS observe access; withdrawn player is rejected.
    assert.equal((await srv.get(base, { token: entrant })).status, 200);
    assert.equal((await srv.get(base + '/watch', { token: entrant })).status, 200);
    const reWatch = srv.socket(entrant);
    sockets.push(reWatch);
    await reWatch.opened;
    reWatch.send({ type: 'join_table', tableId, observe: true });
    assert.equal((await reWatch.nextType('joined')).tableId, tableId);

    assert.equal((await srv.get(base, { token: withdrawn.token })).status, 404);
    assert.equal((await srv.get(base + '/watch', { token: withdrawn.token })).status, 404);
  } finally {
    await Promise.all(sockets.map(socket => socket.close()));
    await srv.stop();
    rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
