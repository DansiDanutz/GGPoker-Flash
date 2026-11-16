import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, seatHumans } from './test-helpers.js';

let srv;
let adminToken;
const players = [];
const tableId = 'nlh-silver-07';

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  for (const name of ['push_http_a', 'push_http_b']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id, socket: srv.socket(response.data.token) });
  }
  for (const player of players) await player.socket.opened;
  await seatHumans(players.map((player) => player.socket), tableId, 4000);
});

after(async () => {
  for (const player of players) await player.socket.close();
  await srv.stop();
});

test('owner grants, authenticated atomic reservations and cancellation work over HTTP', async () => {
  for (const [index, player] of players.entries()) {
    const granted = await srv.post(`/api/admin/rooms/${tableId}/push-seat-grant`, { token: adminToken, body: { accountId: player.id, uses: 1, expectedRevision: 0, operationId: `http-grant-${index}` } });
    assert.equal(granted.status, 200, JSON.stringify(granted.data));
    const state = await srv.get(`/api/rooms/${tableId}/push-seat`, { token: player.token });
    assert.equal(state.data.state.remaining, 1);
    assert.equal(state.data.state.revision, 1);
    const ownerView = await srv.get(`/api/admin/rooms/${tableId}/push-seat-grant?accountId=${player.id}`, { token: adminToken });
    assert.equal(ownerView.status, 200);
    assert.equal(ownerView.data.state.grantRevision, 1);
  }
  const forbidden = await srv.post(`/api/admin/rooms/${tableId}/push-seat-grant`, { token: players[0].token, body: { accountId: players[1].id, uses: 3, expectedRevision: 1, operationId: 'player-grant' } });
  assert.equal(forbidden.status, 403);
  const attempts = await Promise.all(players.map((player, index) => srv.post(`/api/rooms/${tableId}/push-seat`, { token: player.token, body: { destinationSeat: 4, expectedRevision: 1, operationId: `http-reserve-${index}` } })));
  assert.deepEqual(attempts.map((attempt) => attempt.status).sort(), [200, 409]);
  const winner = attempts.findIndex((attempt) => attempt.status === 200);
  assert.equal(attempts[winner].data.state.remaining, 1);
  assert.equal(attempts[winner].data.state.reservation.destinationSeat, 4);
  const replay = await srv.post(`/api/rooms/${tableId}/push-seat`, { token: players[winner].token, body: { destinationSeat: 4, expectedRevision: 1, operationId: `http-reserve-${winner}` } });
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.data, attempts[winner].data);
  const cancelled = await srv.post(`/api/rooms/${tableId}/push-seat/cancel`, { token: players[winner].token, body: { expectedRevision: 2, operationId: 'http-cancel' } });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  assert.equal(cancelled.data.state.remaining, 1);
  assert.equal(cancelled.data.state.reservation, null);
  const loser = 1 - winner;
  const retry = await srv.post(`/api/rooms/${tableId}/push-seat`, { token: players[loser].token, body: { destinationSeat: 4, expectedRevision: 1, operationId: 'http-reserve-after-cancel' } });
  assert.equal(retry.status, 200, JSON.stringify(retry.data));
  assert.equal(retry.data.state.remaining, 1);
});
