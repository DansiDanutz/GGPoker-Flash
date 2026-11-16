import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, seatHumans } from './test-helpers.js';

let srv;
const users = [];
const tableId = 'nlh-silver-07';

before(async () => {
  srv = await startServer({ env: { GGPOKER_WAITLIST_HOLD_MS: '10000' } });
  for (let i = 1; i <= 8; i++) {
    const response = await srv.post('/api/auth/register', { body: { login: `decline_${i}`, nick: `Decline ${i}`, password: 'secret12' } });
    users.push({ token: response.data.token, id: response.data.user.id, socket: srv.socket(response.data.token) });
  }
  for (const user of users) await user.socket.opened;
});

after(async () => {
  for (const user of users) await user.socket.close();
  await srv.stop();
});

test('Pass advances the server queue exactly once and replays its durable receipt', { timeout: 30000 }, async () => {
  await seatHumans(users.slice(0, 6).map((user) => user.socket), tableId, 4000);
  users[6].socket.send({ type: 'join_table', tableId, buyin: 4000 });
  assert.equal((await users[6].socket.nextType('waitlist')).position, 1);
  users[7].socket.send({ type: 'join_table', tableId, buyin: 4000 });
  assert.equal((await users[7].socket.nextType('waitlist')).position, 2);

  users[0].socket.send({ type: 'leave_table', tableId });
  const firstOffer = (await users[6].socket.next((msg) => msg.type === 'event' && msg.event.type === 'waitlist_ready')).event;
  const offerId = [tableId, firstOffer.seat, users[6].id, firstOffer.deadline]
    .map((value) => encodeURIComponent(String(value))).join(':');
  const body = { offerId, expectedRevision: firstOffer.deadline, operationId: 'decline-once-1' };
  const declined = await srv.post(`/api/rooms/${tableId}/seat-offer/decline`, { token: users[6].token, body });
  assert.equal(declined.status, 200, JSON.stringify(declined.data));
  assert.equal(declined.data.state.status, 'declined');

  const secondOffer = (await users[7].socket.next((msg) => msg.type === 'event' && msg.event.type === 'waitlist_ready')).event;
  assert.equal(secondOffer.seat, firstOffer.seat);
  const replay = await srv.post(`/api/rooms/${tableId}/seat-offer/decline`, { token: users[6].token, body });
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.data, declined.data);
  const conflict = await srv.post(`/api/rooms/${tableId}/seat-offer/decline`, {
    token: users[6].token,
    body: { ...body, expectedRevision: firstOffer.deadline + 1 },
  });
  assert.equal(conflict.status, 409);
});
