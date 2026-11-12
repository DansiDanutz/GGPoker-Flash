import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

// End to end over the real socket: three players at a straddle table, the non-blind player
// gets the native ask, answers Yes and the straddle lands before the cards.
let srv;
const tokens = [];
before(async () => {
  srv = await startServer();
  for (const n of ['strad_a', 'strad_b', 'strad_c']) {
    tokens.push((await srv.post('/api/auth/register', { body: { login: n, nick: n, password: 'secret12' } })).data.token);
  }
});
after(async () => { await srv.stop(); });

test('the asked player straddles over the socket', { timeout: 60000 }, async () => {
  const res = await srv.post('/api/tables/host', { token: tokens[0], body: { name: 'Straddle Room', sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, seats: 6 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const tableId = res.data.id;
  const sockets = [];
  for (const tok of tokens) {
    const ws = srv.socket(tok);
    await ws.opened;
    ws.send({ type: 'join_table', tableId, buyin: 4000 });
    await ws.nextType('joined');
    sockets.push(ws);
    // Bots seed the hosted table and deal at once; options change between hands only, so fold
    // through that first hand and switch straddles on as soon as it ends.
    ws.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type !== 'state' || m.state.straddle) return;
      const me = m.state.players.find((p) => p.isMe);
      if (me && m.state.actor === me.id) ws.send({ type: 'action', tableId, action: 'fold', amount: 0 });
      if (m.state.street === 'ended' || m.state.street === 'idle') ws.send({ type: 'option', tableId, straddle: true });
    });
  }
  const asked = await Promise.any(sockets.map((ws, i) => ws.next((m) => m.type === 'state' && m.state.straddleAsk, 40000).then((m) => ({ i, m }))));
  const ask = asked.m.state.straddleAsk;
  assert.equal(ask.amount, 400, 'first straddle is 2x BB');
  assert.equal(asked.m.state.players.find((p) => p.isMe).cards.length, 0, 'no cards before the straddle round ends');
  const ws = sockets[asked.i];
  ws.send({ type: 'straddle_decide', tableId, decision: 'yes' });
  const after = await ws.next((m) => m.type === 'state' && m.state.players.find((p) => p.isMe)?.lastAction?.action === 'Straddle', 10000);
  const me = after.state.players.find((p) => p.isMe);
  assert.equal(me.bet, 400);
  for (const s of sockets) await s.close();
});
