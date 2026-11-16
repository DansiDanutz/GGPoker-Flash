import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, seatHumans } from './test-helpers.js';

let srv;
let adminToken;
const players = [];
const tableId = 'rimt-http-table';

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  const created = await srv.post('/api/admin/tables', {
    token: adminToken,
    body: { id: tableId, name: 'RIMT HTTP', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, rimt_mode: 'negotiated' },
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  for (const name of ['rimt_a', 'rimt_b']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id, socket: srv.socket(response.data.token) });
  }
  for (const player of players) await player.socket.opened;
});

after(async () => {
  for (const player of players) await player.socket.close();
  await srv.stop();
});

test('RIMT HTTP negotiates two runs with durable operation receipts', { timeout: 30000 }, async () => {
  await seatHumans(players.map((player) => player.socket), tableId, 4000);
  for (const player of players) {
    player.socket.ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type !== 'state') return;
      const me = msg.state.players.find((seat) => seat?.isMe);
      if (me && msg.state.actor === me.id) player.socket.send({ type: 'action', tableId, action: 'allin', amount: 0, handNo: msg.state.handNo, turnNo: msg.state.turnNo });
    });
  }
  const negotiation = await Promise.any(players.map((player) => player.socket.next((msg) => msg.type === 'state' && msg.state.rimt, 15000)));
  const state = negotiation.state;
  const proposer = players.find((player) => player.id === state.rimt.proposer || state.players[state.rimt.proposer]?.id === player.id);
  const decider = players.find((player) => player !== proposer);
  assert.ok(proposer && decider);

  const suggested = await srv.post(`/api/rooms/${tableId}/rimt`, {
    token: proposer.token,
    body: { handId: state.handId, expectedRevision: 0, operationId: 'rimt-suggest-1', choice: 2 },
  });
  assert.equal(suggested.status, 200, JSON.stringify(suggested.data));
  assert.equal(suggested.data.state.rimt.proposal, 2);

  const accepted = await srv.post(`/api/rooms/${tableId}/rimt`, {
    token: decider.token,
    body: { handId: state.handId, expectedRevision: 1, operationId: 'rimt-accept-1', choice: 'accept' },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.state.rimt.runs, 2);

  const replay = await srv.post(`/api/rooms/${tableId}/rimt`, {
    token: decider.token,
    body: { handId: state.handId, expectedRevision: 1, operationId: 'rimt-accept-1', choice: 'accept' },
  });
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.data, accepted.data);
  const conflict = await srv.post(`/api/rooms/${tableId}/rimt`, {
    token: decider.token,
    body: { handId: state.handId, expectedRevision: 1, operationId: 'rimt-accept-1', choice: 'decline' },
  });
  assert.equal(conflict.status, 409);
});
