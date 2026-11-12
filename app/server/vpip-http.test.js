// Native seat VPIP badge endpoint: login required, live tables only, seated nicks only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

test('GET /api/tables/:id/vpip returns a VPIP for every seated player', async () => {
  const srv = await startServer();
  try {
    const token = (await srv.post('/api/auth/register', { body: { login: 'vpip_a', nick: 'Vpip A', password: 'secret12' } })).data.token;
    const tableId = (await srv.post('/api/tables/host', { token, body: { name: 'Vpip Room', sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, seats: 6 } })).data.id;
    assert.equal((await srv.get(`/api/tables/${tableId}/vpip`)).status, 401);
    assert.equal((await srv.get(`/api/tables/${tableId}/vpip`, { token })).status, 404, 'not live yet');
    const ws = srv.socket(token);
    await ws.opened;
    ws.send({ type: 'join_table', tableId, buyin: 4000 });
    await ws.nextType('joined');
    const { status, data } = await srv.get(`/api/tables/${tableId}/vpip`, { token });
    assert.equal(status, 200);
    assert.equal(data.vpip['Vpip A'], 0, 'a new player starts at 0');
    assert.ok(Object.keys(data.vpip).length >= 2, 'bots are listed too');
    assert.ok(Object.values(data.vpip).every((v) => Number.isInteger(v) && v >= 0 && v <= 100));
    await ws.close();
  } finally { await srv.stop(); }
});
