import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

let srv;
let owner;
let moderator;
let player;

before(async () => {
  srv = await startServer();
  owner = await srv.login('admin', 'admin123');
  for (const name of ['permission_mod', 'permission_player']) {
    const response = await srv.post('/api/auth/register', { body: { login: name, nick: name, password: 'secret12' } });
    const user = response.data.user;
    if (name.endsWith('mod')) moderator = { ...user, token: response.data.token };
    else player = { ...user, token: response.data.token };
  }
  const assigned = await srv.post(`/api/admin/users/${moderator.id}`, { token: owner, body: { action: 'set_admin', role: 'moderator' } });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.data));
});

after(async () => { await srv.stop(); });

test('owner, moderator and player roles have distinct API permissions', async () => {
  assert.equal((await srv.get('/api/me', { token: moderator.token })).data.user.role, 'moderator');
  assert.equal((await srv.get('/api/me', { token: player.token })).data.user.role, 'player');
  assert.equal((await srv.get('/api/me', { token: owner })).data.user.role, 'owner');
  assert.equal((await srv.get('/api/admin/reports')).status, 401);

  for (const [method, route] of [['get', '/api/admin/reports'], ['get', '/api/admin/chat'], ['get', '/api/admin/waitlists']]) {
    assert.equal((await srv[method](route, { token: moderator.token })).status, 200, `${method} ${route}`);
    assert.equal((await srv[method](route, { token: player.token })).status, 403, `${method} ${route} player`);
  }
  assert.equal((await srv.post(`/api/admin/users/${player.id}`, { token: moderator.token, body: { action: 'mute' } })).status, 200);
  assert.equal((await srv.post(`/api/admin/users/${player.id}`, { token: moderator.token, body: { action: 'unmute' } })).status, 200);
  assert.equal((await srv.post(`/api/admin/users/${moderator.id}`, { token: player.token, body: { action: 'mute' } })).status, 403);

  const ownerOnly = [
    ['get', '/api/admin/users'], ['get', '/api/admin/tables'], ['get', '/api/admin/stats'],
    ['get', '/api/admin/spin/rules?mode=3max&stake=5000'], ['get', '/api/admin/cash-insurance-rules'],
    ['get', '/api/admin/verifications'], ['get', '/api/admin/export/users'], ['get', '/api/admin/audit'], ['get', '/api/admin/backup'],
    ['post', '/api/admin/tournaments'], ['post', '/api/admin/tournaments/example/formats'], ['post', '/api/admin/tournaments/example/entries'],
    ['post', '/api/admin/battle'], ['post', '/api/admin/house/spin3:5000/fund'],
  ];
  for (const [method, route] of ownerOnly) {
    assert.equal((await srv[method](route, { token: moderator.token, ...(method === 'post' ? { body: {} } : {}) })).status, 403, `${method} ${route} moderator`);
    assert.equal((await srv[method](route, { token: player.token, ...(method === 'post' ? { body: {} } : {}) })).status, 403, `${method} ${route} player`);
  }
  for (const route of ['/api/admin/reports', '/api/admin/users', '/api/admin/tables', '/api/admin/stats', '/api/admin/spin/rules?mode=3max&stake=5000', '/api/admin/cash-insurance-rules']) {
    assert.equal((await srv.get(route, { token: owner })).status, 200, `owner ${route}`);
  }
});
