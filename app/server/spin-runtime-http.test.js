import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';
import { spinPayouts } from './spin.js';

let srv;
let adminToken;
const players = [];
let outsider;

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  const config = { rows: spinPayouts(5000).map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) };
  const saved = await srv.put('/api/admin/spin/rules', { token: adminToken, body: { mode: '3max', stake: 5000, expectedRevision: 1, operationId: 'runtime-rules', config, insurance: null } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  for (const scope of ['spin3:5000', 'spin3-insurance:5000']) {
    const funded = await srv.post(`/api/admin/house/${scope}/fund`, { token: adminToken, body: { amount: 200000000, reason: 'Spin runtime test', operationId: `runtime-fund-${scope}` } });
    assert.equal(funded.status, 200, JSON.stringify(funded.data));
  }
  for (const name of ['spin_runtime_a', 'spin_runtime_b', 'spin_runtime_c', 'spin_runtime_outside']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    const player = { token: response.data.token, id: response.data.user.id };
    if (players.length < 3) players.push(player);
    else outsider = player;
  }
});

after(async () => { await srv.stop(); });

test('matched sockets reconnect without charging and all-ready starts the committed hand', async () => {
  let eventId;
  const afterRegistration = [];
  for (const [index, player] of players.entries()) {
    const result = await srv.post('/api/spin/register', {
      token: player.token,
      body: { mode: '3max', stake: 5000, expectedRevision: index, ruleRevision: 2, operationId: `runtime-register-${index}`, insurance: false },
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    eventId = result.data.state.eventId;
    afterRegistration.push(await srv.balance(player.token));
  }
  const tableId = `spin:${eventId}`;
  const sockets = [];
  const assignedSeats = [];
  try {
    for (const [seat, player] of players.entries()) {
      const socket = srv.socket(player.token);
      sockets.push(socket);
      await socket.opened;
      socket.send({ type: 'join_table', tableId });
      const joined = await socket.next((message) => message.type === 'joined' && message.tableId === tableId);
      assert.ok(Number.isInteger(joined.seat));
      assignedSeats.push(joined.seat);
      assert.equal(await srv.balance(player.token), afterRegistration[seat]);
      const state = await socket.next((message) => message.type === 'state' && message.state.id === tableId && message.state.spin?.eventId === eventId);
      assert.equal(state.state.handNo, 0);
      assert.equal(state.state.spin.presentation.barrierOpensAt > 0, true);
    }

    const rejected = srv.socket(outsider.token);
    sockets.push(rejected);
    await rejected.opened;
    rejected.send({ type: 'join_table', tableId, observe: true });
    const refusal = await rejected.next((message) => message.type === 'error' && message.errorCode === 'spin_not_matched');
    assert.ok(refusal);

    await sockets[0].close();
    sockets[0] = srv.socket(players[0].token);
    await sockets[0].opened;
    sockets[0].send({ type: 'join_table', tableId });
    const rejoined = await sockets[0].next((message) => message.type === 'joined' && message.tableId === tableId);
    assert.equal(rejoined.seat, assignedSeats[0]);
    assert.equal(await srv.balance(players[0].token), afterRegistration[0]);

    for (const [index, socket] of sockets.slice(0, 3).entries()) {
      for (const stage of ['wheel', 'ready']) {
        const expectedRevision = 1 + index * 2 + (stage === 'ready' ? 1 : 0);
        const result = await srv.post(`/api/spin/${eventId}/presented`, {
          token: players[index].token,
          body: { expectedRevision, operationId: `runtime-${stage}-${index}`, stage },
        });
        assert.equal(result.status, 200, JSON.stringify(result.data));
      }
    }
    const started = await sockets[2].next((message) => message.type === 'state' && message.state.id === tableId && message.state.handNo === 1);
    assert.equal(started.state.spin.eventId, eventId);
    assert.equal(started.state.players.filter((player) => player.id).length, 3);
    for (const [index, player] of players.entries()) assert.equal(await srv.balance(player.token), afterRegistration[index]);
  } finally {
    await Promise.all(sockets.map((socket) => socket.close().catch(() => {})));
  }
});
