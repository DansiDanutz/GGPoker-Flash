import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

let srv;
let adminToken;
const players = [];
const config = {
  id: 'battle-http', name: 'HTTP Battle', capacity: 2, finalSeats: 2, startingChips: 1000, entry: 1000,
  rushMinutes: 10, tableSize: 2, smallBlind: 10, bigBlind: 20, rushStartLevel: 1, shootoutStartLevel: 1,
  finalStartLevel: 1, prizeShares: [50, 50], bountyItems: [{ id: 'b1', amount: 500, frequencyUnits: 1 }],
};

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  for (const name of ['battle_http_a', 'battle_http_b']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id });
  }
});

after(async () => { await srv.stop(); });

test('Battle catalog, registration, start, reopen and abort work over HTTP', async () => {
  const forbidden = await srv.post('/api/admin/battle', { token: players[0].token, body: { operationId: 'forbidden', config } });
  assert.equal(forbidden.status, 403);
  const created = await srv.post('/api/admin/battle', { token: adminToken, body: { operationId: 'create-battle-http', config } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const first = await srv.post('/api/battle/battle-http/register', { token: players[0].token, body: { eventId: 'battle-http', expectedRevision: 1, operationId: 'http-register-1' } });
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const second = await srv.post('/api/battle/battle-http/register', { token: players[1].token, body: { eventId: 'battle-http', expectedRevision: 2, operationId: 'http-register-2' } });
  assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.equal(second.data.state.status, 'rush');
  const before = await srv.balance(players[0].token);
  const currentRevision = (await srv.get('/api/battle/battle-http', { token: players[0].token })).data.state.revision;
  const reopened = await srv.post('/api/battle/battle-http/reopen', { token: players[0].token, body: { eventId: 'battle-http', expectedRevision: currentRevision, operationId: 'http-reopen' } });
  assert.equal(reopened.status, 200, JSON.stringify(reopened.data));
  assert.equal(await srv.balance(players[0].token), before);
  const cancelled = await srv.post('/api/battle/battle-http/cancel', { token: players[0].token, body: { eventId: 'battle-http', expectedRevision: currentRevision, operationId: 'http-cancel-started' } });
  assert.equal(cancelled.status, 409);
  const catalog = await srv.get('/api/battle');
  assert.equal(catalog.data.events.find((event) => event.eventId === 'battle-http').registeredCount, 2);
  assert.equal((await srv.get('/api/battle/not-found')).status, 404);

  await srv.post('/api/admin/battle', { token: adminToken, body: { operationId: 'create-abort-http', config: { ...config, id: 'battle-abort-http' } } });
  await srv.post('/api/battle/battle-abort-http/register', { token: players[0].token, body: { eventId: 'battle-abort-http', expectedRevision: 1, operationId: 'abort-register' } });
  const aborted = await srv.post('/api/battle/battle-abort-http/abort', { token: adminToken, body: { eventId: 'battle-abort-http', expectedRevision: 2, operationId: 'http-abort' } });
  assert.equal(aborted.status, 200, JSON.stringify(aborted.data));
  assert.equal(aborted.data.state.status, 'aborted');
});

test('Battle actions settle through HTTP with private projections and stale-command rejection', async () => {
  const balanceBefore = (await Promise.all(players.map((player) => srv.balance(player.token)))).reduce((sum, balance) => sum + balance, 0);
  const opened = await srv.get('/api/battle/battle-http', { token: players[0].token });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const room = opened.data.state.rooms[0];
  assert.equal(room.stage, 'final');
  assert.ok(room.table.handId);
  const own = room.table.players.find((player) => player.isMe);
  const opponent = room.table.players.find((player) => !player.isMe);
  assert.equal(own.cards.length, 2);
  assert.deepEqual(opponent.cards, ['??', '??']);
  assert.equal(JSON.stringify(opened.data).includes('"deck"'), false);
  const wrongActor = players.find((player) => player.id !== room.table.actor);
  const command = {
    eventId: 'battle-http', stage: room.stage, roomId: room.roomId, handId: room.table.handId,
    expectedRevision: room.revision, operationId: 'http-wrong-actor', action: 'allin', amount: 0,
  };
  assert.equal((await srv.post('/api/battle/battle-http/action', { token: wrongActor.token, body: command })).status, 409);

  let finished;
  for (let attempt = 0; attempt < 120; attempt++) {
    const viewer = players[attempt % 2];
    const response = await srv.get('/api/battle/battle-http', { token: viewer.token });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const state = response.data.state;
    if (state.status === 'finished') { finished = state; break; }
    const active = state.rooms.find((entry) => entry.stage === state.status);
    if (active?.table.actor) {
      const actor = players.find((player) => player.id === active.table.actor);
      const action = await srv.post('/api/battle/battle-http/action', { token: actor.token, body: {
        eventId: 'battle-http', stage: state.status, roomId: active.roomId, handId: active.table.handId,
        expectedRevision: active.revision, operationId: `http-play-${attempt}`, action: 'allin', amount: 0,
      } });
      assert.equal(action.status, 200, JSON.stringify(action.data));
      if (attempt === 1) {
        const stale = await srv.post('/api/battle/battle-http/action', { token: actor.token, body: {
          eventId: 'battle-http', stage: state.status, roomId: active.roomId, handId: active.table.handId,
          expectedRevision: active.revision, operationId: 'http-stale-replay', action: 'allin', amount: 0,
        } });
        assert.equal(stale.status, 409);
      }
    } else await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(finished, 'Battle did not finish through real HTTP actions');
  assert.equal(finished.prizes.length, 2);
  assert.equal(finished.prizes.reduce((sum, prize) => sum + prize.amount, 0), 2000);
  assert.equal(finished.bounty.awards.length, 1);
  assert.equal(finished.bounty.awards[0].amount, 500);
  assert.equal(finished.bounty.awards[0].ticket, undefined);
  const balances = await Promise.all(players.map((player) => srv.balance(player.token)));
  assert.equal(balances.reduce((sum, balance) => sum + balance, 0), balanceBefore + 2500);
});
