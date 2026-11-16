import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from './test-helpers.js';

test('expiring an old socket never disconnects or charges its replacement seat', { timeout: 75000 }, async () => {
  const srv = await startServer();
  let old, replacement, db;
  try {
    const { data: u } = await srv.post('/api/auth/register', { body: { login: 'heartbeat_race', password: 'heartbeat-test-password' } });
    const { data: table } = await srv.post('/api/tables/host', { token: u.token, body: { economy: 'play_money', game: 'spingold', name: 'Heartbeat race', stake: 5000 } });
    old = new WebSocket(`ws://127.0.0.1:${srv.port}/ws?token=${u.token}`, { autoPong: false });
    await once(old, 'open');
    const joined = new Promise(resolve => old.on('message', raw => { const m = JSON.parse(String(raw)); if (m.type === 'joined') resolve(m); }));
    old.send(JSON.stringify({ type: 'join_table', tableId: table.id, buyin: 5000 }));
    const originalSeat = (await joined).seat;
    assert.notEqual(originalSeat, null);
    replacement = srv.socket(u.token); await replacement.opened;
    replacement.send({ type: 'join_table', tableId: table.id, rejoin: true });
    assert.equal((await replacement.nextType('joined')).seat, originalSeat);
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('silent old socket was not terminated by heartbeat')), 65000);
      old.once('close', c => { clearTimeout(timer); resolve(c); });
    });
    assert.equal(code, 1006);
    const expiredAt = Date.now();
    replacement.send({ type: 'join_table', tableId: table.id, rejoin: true });
    const { state: fresh } = await replacement.next(m => m.type === 'state' && m.state.now > expiredAt);
    const me = fresh.players.find(p => p.isMe);
    assert.equal(me.seat, originalSeat); assert.equal(me.stack, 5000); assert.equal(me.disconnected, false);
    db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'), { readOnly: true });
    assert.equal(db.prepare("SELECT count(*) n FROM transactions WHERE kind='buyin' AND session_id LIKE ?").get(table.id + ':%').n, 1);
  } finally {
    old?.terminate(); replacement?.ws.terminate(); db?.close(); await srv.stop(); fs.rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
