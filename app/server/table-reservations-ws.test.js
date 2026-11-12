import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

// Over the real socket: reservations are stored on the seat and applied by the server.
let srv;
let token;
before(async () => {
  srv = await startServer();
  token = (await srv.post('/api/auth/register', { body: { login: 'resv_a', nick: 'resv_a', password: 'secret12' } })).data.token;
});
after(async () => { await srv.stop(); });

async function hostAndJoin(name) {
  const res = await srv.post('/api/tables/host', { token, body: { name, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, seats: 6 } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const tableId = res.data.id;
  const ws = srv.socket(token);
  await ws.opened;
  ws.send({ type: 'join_table', tableId, buyin: 4000 });
  await ws.nextType('joined');
  // Fold whenever the action reaches us so hands finish quickly.
  ws.ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    const me = m.type === 'state' && m.state.players.find((p) => p.isMe);
    if (me && m.state.actor === me.id) ws.send({ type: 'action', tableId, action: 'fold', amount: 0 });
  });
  return { tableId, ws };
}

const myState = (m) => m.type === 'state' && m.state.players.find((p) => p.isMe);

// Wait for a message that arrives after this call (the helper's inbox may hold stale states).
function fresh(ws, match, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.ws.off('message', on); reject(new Error('timed out waiting for a fresh state')); }, timeoutMs);
    function on(raw) {
      const m = JSON.parse(String(raw));
      if (!match(m)) return;
      clearTimeout(timer);
      ws.ws.off('message', on);
      resolve(m);
    }
    ws.ws.on('message', on);
  });
}

test('"leave table after this hand" cashes the seat out once the hand is over', { timeout: 60000 }, async () => {
  const before = await srv.balance(token);
  const { tableId, ws } = await hostAndJoin('Leave Room');
  const armed = fresh(ws, (m) => myState(m)?.leaveAfterHand === true);
  ws.send({ type: 'option', tableId, leaveAfterHand: true });
  await armed;
  await fresh(ws, (m) => m.type === 'state' && !m.state.players.some((p) => p.isMe), 40000);
  const afterLeave = await srv.balance(token);
  assert.ok(afterLeave > before - 4000, 'the stack came back to the balance');
  await ws.close();
});

test('"sit out at all tables" applies to every table the player is seated at, and cancels', { timeout: 60000 }, async () => {
  const a = await hostAndJoin('All Tables A');
  const b = await hostAndJoin('All Tables B');
  const sat = [a, b].map(({ ws }) => fresh(ws, (m) => myState(m)?.sitOutAll === true && (myState(m).sittingOut || myState(m).sitOutNext)));
  a.ws.send({ type: 'sit_out_all', value: true });
  await Promise.all(sat);
  const back = [a, b].map(({ ws }) => fresh(ws, (m) => myState(m) && myState(m).sitOutAll === false && !myState(m).sitOutNext && !myState(m).sittingOut));
  a.ws.send({ type: 'sit_out_all', value: false });
  await Promise.all(back);
  await a.ws.close();
  await b.ws.close();
});
