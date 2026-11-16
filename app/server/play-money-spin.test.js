import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './test-helpers.js';

test('private Play Money Spin seats three humans and pays each place exactly once', { timeout: 120000 }, async (t) => {
  const srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  const sockets = [], users = [], errors = [];
  let db, outcome;
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
      const s = srv.socket(u.token); sockets.push(s); await s.opened;
      const acted = new Set();
      s.ws.on('message', raw => {
        const m = JSON.parse(String(raw)), st = m.state;
        if (m.type === 'error') errors.push(m.error);
        if (m.type !== 'state' || st.id !== table.id) return;
        if (st.players.some(p => p.isBot)) errors.push('A bot took a private seat');
        if (st.spin?.winner) outcome = st.spin;
        const me = st.players.find(p => p.isMe), key = `${st.handNo}:${st.turnNo}`;
        if (!me || st.actor !== me.id || acted.has(key) || st.spin?.winner) return;
        acted.add(key);
        s.send({ type: 'action', tableId: table.id, action: 'allin', handNo: st.handNo, turnNo: st.turnNo });
      });
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
    // Reconnect each player through a fresh socket after settlement; no new entry is requested.
    await Promise.all(sockets.splice(0).map(s => s.close()));
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
    await Promise.all(sockets.map(s => s.close())); db?.close(); await srv.stop(); fs.rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
