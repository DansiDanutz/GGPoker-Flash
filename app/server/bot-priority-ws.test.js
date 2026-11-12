// End to end over the socket: humans before bots (F05/F06), stale actions (F08) and a wait
// list that survives a restart (F07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';
import { STALE_ACTION_ERROR } from './action-version.js';

const TABLE = 'bp-heads-up';
const BUYIN = 2000;
const PASSWORD = 'secret12';

async function register(srv, login) {
  const res = await srv.post('/api/auth/register', { body: { login, nick: `Nick ${login}`, password: PASSWORD } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return { login, token: res.data.token, id: res.data.user.id };
}

async function openSocket(srv, token) {
  const sock = srv.socket(token);
  await sock.opened;
  return sock;
}

const stateWhere = (sock, match, timeoutMs) => sock.next((m) => m.type === 'state' && m.state.id === TABLE && match(m.state), timeoutMs);

test('a bot with live cards finishes its hand, then gives its seat to the waiting human; stale actions are refused', async () => {
  const srv = await startServer();
  const sockets = [];
  try {
    const admin = await srv.login('admin', 'admin123');
    const created = await srv.post('/api/admin/tables', {
      token: admin,
      body: { id: TABLE, name: 'BP Heads-Up', game: 'holdem', sb: 50, bb: 100, min_buyin: BUYIN, max_buyin: 4000, seats: 2, sort: 0 },
    });
    assert.equal(created.status, 200);
    const [b, c, d] = [await register(srv, 'bp_b'), await register(srv, 'bp_c'), await register(srv, 'bp_d')];

    // B sits; a bot fills the other chair and the hand is dealt. The bot is labelled.
    const bSock = await openSocket(srv, b.token);
    sockets.push(bSock);
    bSock.send({ type: 'join_table', tableId: TABLE, buyin: BUYIN });
    const bSeat = (await bSock.next((m) => m.type === 'joined' && m.seat != null)).seat;
    const live = await stateWhere(bSock, (s) => s.actor === b.id && s.street === 'preflop', 10_000);
    const bot = live.state.players.find((p) => !p.empty && !p.isMe);
    assert.equal(bot.isBot, true, 'the bot is flagged in the public state');
    assert.equal(live.state.players.find((p) => p.isMe).isBot, false);

    // It is B's turn, so the bot still holds live cards: C is queued, the bot keeps its seat.
    const cSock = await openSocket(srv, c.token);
    sockets.push(cSock);
    cSock.send({ type: 'join_table', tableId: TABLE, buyin: BUYIN });
    assert.equal((await cSock.nextType('waitlist')).position, 1);

    // A click aimed at an earlier hand is refused and changes nothing.
    const handNo = live.state.handNo;
    bSock.send({ type: 'action', tableId: TABLE, action: 'fold', handNo: handNo - 1 });
    const refused = await bSock.nextType('error');
    assert.equal(refused.error, STALE_ACTION_ERROR);
    assert.equal(refused.handNo, handNo);

    // B folds this hand: between hands the bot stands up and C is offered its seat.
    bSock.send({ type: 'action', tableId: TABLE, action: 'fold', handNo });
    const offer = (await cSock.next((m) => m.type === 'event' && m.event.type === 'waitlist_ready', 8000)).event;
    assert.equal(offer.seat, bot.seat);
    cSock.send({ type: 'join_table', tableId: TABLE, buyin: BUYIN });
    assert.equal((await cSock.next((m) => m.type === 'joined' && m.seat != null)).seat, bot.seat);
    const humansOnly = await stateWhere(cSock, (s) => s.players.some((p) => p.isMe));
    assert.ok(humansOnly.state.players.every((p) => !p.isBot), 'no bot is left at the table');
    assert.notEqual(bSeat, bot.seat);

    // The table is full of humans: D queues over HTTP, and the queue survives a restart.
    const queued = await srv.post(`/api/tables/${TABLE}/waitlist`, { token: d.token });
    assert.equal(queued.data.status, 'queued');
    await Promise.all(sockets.splice(0).map((s) => s.close()));
    await srv.stop('SIGTERM');

    const again = await startServer({ dataDir: srv.dataDir });
    try {
      const token = await again.login(d.login, PASSWORD);
      const me = (await again.get('/api/waitlists/me', { token })).data;
      assert.deepEqual(me.queues.map((q) => [q.queueKey, q.position]), [[`t:${TABLE}`, 1]]);
      // The seats were cashed out on shutdown, so opening the table offers D a seat first.
      const dSock = await openSocket(again, token);
      sockets.push(dSock);
      dSock.send({ type: 'join_table', tableId: TABLE, buyin: BUYIN });
      assert.notEqual((await dSock.next((m) => m.type === 'joined' && m.seat != null)).seat, null);
    } finally {
      await Promise.all(sockets.splice(0).map((s) => s.close()));
      await again.stop();
    }
  } finally {
    await Promise.all(sockets.map((s) => s.close()));
    if (srv.child.exitCode == null) await srv.stop();
  }
});
