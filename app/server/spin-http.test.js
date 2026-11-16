import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';
import { spinPayouts } from './spin.js';

let srv;
let adminToken;
const players = [];

before(async () => {
  srv = await startServer();
  adminToken = await srv.login('admin', 'admin123');
  for (const stake of [5000, 10000]) {
    const config = { rows: spinPayouts(stake).map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) };
    const saved = await srv.put('/api/admin/spin/rules', { token: adminToken, body: { mode: '3max', stake, expectedRevision: 1, operationId: `rules-${stake}`, config, insurance: null } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
  }
  for (const scope of ['spin3:5000', 'spin3:10000', 'spin3-insurance:5000']) {
    const result = await srv.post(`/api/admin/house/${scope}/fund`, { token: adminToken, body: { amount: 200000000, reason: 'Spin test capital', operationId: `fund-${scope}` } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
  }
  for (const name of ['spin_http_a', 'spin_http_b', 'spin_http_c']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    players.push({ token: response.data.token, id: response.data.user.id });
  }
});

after(async () => { await srv.stop(); });

test('Spin HTTP registration, presentation, cancellation and polling work end to end', async () => {
  const forbidden = await srv.put('/api/admin/spin/rules', { token: players[0].token, body: {} });
  assert.equal(forbidden.status, 403);
  let eventId;
  const initialQueue = await srv.get('/api/spin/queue?mode=3max&stake=5000', { token: players[0].token });
  assert.equal(initialQueue.status, 200);
  assert.equal(initialQueue.data.state.revision, 0);
  assert.equal(initialQueue.data.state.ruleRevision, 2);
  assert.deepEqual(initialQueue.data.state.registrations, []);
  for (const [index, player] of players.entries()) {
    const result = await srv.post('/api/spin/register', {
      token: player.token,
      body: { mode: '3max', stake: 5000, expectedRevision: index, ruleRevision: 2, operationId: `spin-register-${index}`, insurance: false },
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    eventId = result.data.state.eventId;
    const registrationId = result.data.state.registrationId;
    const current = await srv.get(`/api/spin/registrations/${registrationId}`, { token: player.token });
    assert.equal(current.status, 200);
  }
  assert.ok(eventId);
  const matchedQueue = await srv.get('/api/spin/queue?mode=3max&stake=5000', { token: players[0].token });
  assert.equal(matchedQueue.data.state.revision, 3);
  assert.equal(matchedQueue.data.state.registrations.length, 1);
  assert.equal(matchedQueue.data.state.registrations[0].eventId, eventId);
  const wheel = await srv.post(`/api/spin/${eventId}/presented`, {
    token: players[0].token,
    body: { expectedRevision: 1, operationId: 'present-wheel-1', stage: 'wheel' },
  });
  assert.equal(wheel.status, 200, JSON.stringify(wheel.data));
  const ready = await srv.post(`/api/spin/${eventId}/presented`, {
    token: players[0].token,
    body: { expectedRevision: 2, operationId: 'present-ready-1', stage: 'ready' },
  });
  assert.equal(ready.status, 200, JSON.stringify(ready.data));

  const waiting = await srv.post('/api/spin/register', {
    token: players[0].token,
    body: { mode: '3max', stake: 10000, expectedRevision: 0, ruleRevision: 2, operationId: 'spin-cancel-http', insurance: false },
  });
  assert.equal(waiting.status, 200, JSON.stringify(waiting.data));
  const registrationId = waiting.data.state.registrationId;
  const cancelled = await srv.post(`/api/spin/registrations/${registrationId}/cancel`, {
    token: players[0].token,
    body: { expectedRevision: 0, operationId: 'spin-cancel-http-1' },
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  assert.equal(cancelled.data.state.status, 'cancelled');
});
