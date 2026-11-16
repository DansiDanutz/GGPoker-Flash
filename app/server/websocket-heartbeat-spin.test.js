import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { startServer } from './test-helpers.js';

test('three-player network black hole is detected and rejoined Spin settles once', { timeout: 180000 }, async (t) => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  const sockets = [], users = [], errors = [];
  let db, outcome, autoPlay = false;
  const peers = [];
  const relay = net.createServer(client => {
    const upstream = net.connect(srv.port, '127.0.0.1');
    const peer = { client, upstream, blocked: false, upstreamClosed: false, droppedUp: 0, droppedDown: 0 }; peers.push(peer);
    client.on('data', chunk => { if (peer.blocked) peer.droppedUp += chunk.length; else upstream.write(chunk); });
    upstream.on('data', chunk => { if (peer.blocked) peer.droppedDown += chunk.length; else client.write(chunk); });
    // Keep the client side blackholed even after the heartbeat closes the server side.
    upstream.on('close', () => { peer.upstreamClosed = true; if (!peer.blocked) client.destroy(); });
    client.on('close', () => upstream.destroy());
    client.on('error', () => upstream.destroy()); upstream.on('error', () => { if (!peer.blocked) client.destroy(); });
  });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  const listen = (s) => {
    const acted = new Set();
    s.ws.on('message', raw => {
      const m = JSON.parse(String(raw)), st = m.state;
      if (m.type === 'error') errors.push(m.error);
      if (m.type !== 'state') return;
      s.latest = st;
      if (st.players.some(p => p.isBot)) errors.push('A bot took a private seat');
      if (st.spin?.winner) outcome = st.spin;
      const me = st.players.find(p => p.isMe), key = `${st.handNo}:${st.turnNo}`;
      if (!autoPlay || !me || st.actor !== me.id || acted.has(key) || st.spin?.winner) return;
      acted.add(key); s.send({ type: 'action', tableId: st.id, action: 'allin', handNo: st.handNo, turnNo: st.turnNo });
    });
  };
  const post = async (route, token, body) => {
    const r = await srv.post(route, { token, body }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data;
  };
  try {
    for (let i = 0; i < 3; i++) users.push(await post('/api/auth/register', null, { login: `human_spin_${i}`, password: 'spin-test-password' }));
    const stake = 5000, before = await Promise.all(users.map(u => srv.balance(u.token)));
    const table = await post('/api/tables/host', users[0].token, { economy: 'play_money', game: 'spingold', name: 'Humans only', stake });
    db = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
    const entries = () => db.prepare("SELECT * FROM transactions WHERE kind='buyin' AND session_id LIKE ?").all(`${table.id}:%`);
    assert.equal((await srv.post('/api/marketplace/chips/spin-tickets', { token: users[0].token, body: { tableId: table.id, key: 'wrong-economy' } })).status, 409);
    for (const [i, u] of users.entries()) {
      const s = srv.socket(u.token, relay.address().port); sockets.push(s); await s.opened; listen(s);
      s.send({ type: 'join_table', tableId: table.id, buyin: stake });
      assert.notEqual((await s.next(m => m.type === 'joined')).seat, null);
      if (i < 2) {
        const { state } = await s.next(m => m.type === 'state' && m.state.players.filter(p => !p.empty).length === i + 1);
        assert.equal(state.spin.multiplier, null, 'no prize draw until three human entries');
        assert.equal(state.handNo, 0);
        assert.equal(state.walletKind, 'play_money');
      }
      s.send({ type: 'join_table', tableId: table.id, buyin: stake });
      await s.next(m => m.type === 'joined');
      assert.equal(entries().length, i + 1, 'duplicate join never charges another entry');
    }
    const { state: active } = await sockets[0].next(m => m.type === 'state' && m.state.handNo > 0 && m.state.actor != null);
    const originalSeats = active.players.filter(p => !p.empty).map(p => [p.id, p.seat]);
    const postEntry = await Promise.all(users.map(u => srv.balance(u.token)));
    const droppedAt = Date.now();
    assert.equal(peers.length, 3);
    for (const peer of peers) peer.blocked = true;
    for (const s of sockets) s.send({ type: 'ping', t: droppedAt });
    await new Promise(resolve => setTimeout(resolve, 75000));
    assert.ok(peers.every(p => p.upstreamClosed && p.droppedUp > 0 && p.droppedDown > 0), 'all silent server transports expired without a client close');
    assert.ok(sockets.every(s => s.ws.readyState === 1), 'blackholed clients never sent a close');
    const observer = srv.socket(users[0].token); sockets.push(observer); await observer.opened;
    observer.send({ type: 'join_table', tableId: table.id, observe: true });
    const { state: absent } = await observer.next(m => m.type === 'state' && m.state.players.filter(p => !p.empty).length === 3);
    assert.ok(absent.players.filter(p => !p.empty).every(p => p.disconnected), 'heartbeat starts disconnect handling');
    assert.deepEqual(absent.players.filter(p => !p.empty).map(p => [p.id, p.seat]), originalSeats);
    assert.ok(absent.handNo > active.handNo || absent.turnNo > active.turnNo, 'action timeouts advance the game');
    assert.equal(absent.players.filter(p => !p.empty).reduce((n, p) => n + p.stack, 0) + (['idle', 'ended'].includes(absent.street) ? 0 : absent.pot), stake * 3);
    assert.deepEqual(await Promise.all(users.map(u => srv.balance(u.token))), postEntry);
    for (const [i, u] of users.entries()) {
      const s = srv.socket(u.token); sockets.push(s); await s.opened; listen(s);
      s.send({ type: 'join_table', tableId: table.id, rejoin: true });
      assert.equal((await s.nextType('joined')).seat, originalSeats.find(([id]) => id === u.user.id)[1]);
      const { state } = await s.next(m => m.type === 'state' && m.state.players.some(p => p.isMe && !p.disconnected));
      assert.equal(state.players.find(p => p.isMe).id, u.user.id);
      s.send({ type: 'sit_out', tableId: table.id, value: false });
    }
    assert.equal(entries().length, 3);
    assert.deepEqual(await Promise.all(users.map(u => srv.balance(u.token))), postEntry);
    autoPlay = true;
    const last = sockets.at(-1); last.send({ type: 'join_table', tableId: table.id, rejoin: true }); await last.nextType('joined');
    t.diagnostic(JSON.stringify({ outageMs: Date.now() - droppedAt, detected: true, seatsPreserved: true, droppedBytes: peers.map(p => ({ up: p.droppedUp, down: p.droppedDown })) }));
    for (let i = 0; i < 900 && !outcome && !errors.length; i++) await new Promise(r => setTimeout(r, 100));
    assert.deepEqual(errors, []); assert.ok(outcome?.winner, 'three-human round completes');
    const after = await Promise.all(users.map(u => srv.balance(u.token)));
    const finished = [...outcome.finished].sort((a, b) => a.place - b.place);
    assert.deepEqual(finished.map(p => p.payout), outcome.payouts);
    assert.equal(finished.length, 3);
    for (const [i, u] of users.entries()) {
      const place = finished.find(p => p.id === u.user.id); assert.ok(place);
      assert.equal(after[i], before[i] - stake + outcome.payouts[place.place - 1]);
      const entry = entries().find(row => row.user_id === u.user.id); assert.equal(entry.amount, -stake);
      const exits = db.prepare('SELECT amount FROM transactions WHERE user_id=? AND reference=?').all(u.user.id, `out:${entry.session_id}`);
      assert.deepEqual(exits.map(row => row.amount), [place.payout]);
    }
    assert.equal(outcome.winner.prize, outcome.payouts[0]);
    assert.equal(after.reduce((a, b) => a + b), before.reduce((a, b) => a + b) - 3 * stake + outcome.prize);
    for (const h of db.prepare('SELECT pot,result FROM hands WHERE table_id=?').all(table.id)) {
      const result = JSON.parse(h.result); assert.equal(result.winners.reduce((n,w) => n+w.amount, 0) + result.rake, h.pot);
    }
    // Reconnect each player through a fresh socket after settlement; no new entry is requested.
    for (const peer of peers) { peer.client.destroy(); peer.upstream.destroy(); }
    for (const s of sockets.splice(0)) s.ws.terminate();
    for (const [i, u] of users.entries()) {
      const rejoined = srv.socket(u.token); sockets.push(rejoined); await rejoined.opened;
      rejoined.send({ type: 'join_table', tableId: table.id, rejoin: true });
      await rejoined.next(m => m.type === 'joined');
      rejoined.send({ type: 'leave_table', tableId: table.id });
      rejoined.send({ type: 'join_table', tableId: table.id, observe: true });
      await rejoined.next(m => m.type === 'joined' && m.observe);
      await rejoined.next(m => m.type === 'state' && !m.state.players.some(p => p.id === u.user.id));
      assert.equal(await srv.balance(u.token), after[i]);
    }
    assert.equal(entries().length, 3);
    assert.deepEqual(await Promise.all(users.map(u => srv.balance(u.token))), after);
    assert.equal(db.prepare('SELECT count(*) n FROM organizer_chip_accounts').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM organizer_chip_spin_tickets').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM organizer_billing_ledger').get().n, 0);
    assert.equal((await srv.del(`/api/tables/host/${table.id}`, { token: users[0].token })).status, 200);
    t.diagnostic(JSON.stringify({ before, stake, multiplier: outcome.multiplier, prize: outcome.prize, winner: outcome.winner, places: finished.map(p => ({ id: p.id, place: p.place, payout: p.payout })), after, entries: 3, reconciled: true }));
  } finally {
    for (const peer of peers) { peer.client.destroy(); peer.upstream.destroy(); }
    for (const s of sockets) s.ws.terminate();
    await new Promise(resolve => relay.close(resolve)); db?.close(); await srv.stop(); fs.rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
