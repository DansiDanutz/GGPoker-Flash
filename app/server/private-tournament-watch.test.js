// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { startServer } from './test-helpers.js';

test('only the owner and entrants can watch a private tournament flight', async () => {
  const srv = await startServer();
  const sockets = [];
  try {
    const post = async (path, token, body = {}) => {
      const res = await srv.post(path, { token, body });
      assert.equal(res.status, 200, JSON.stringify(res.data.error));
      return res.data;
    };
    const owner = await srv.login('DansiDanutz', 'ggpoker');
    const entrant = await srv.login('admin', 'admin123');
    const outsider = await post('/api/auth/register', null, { login: 'watch_outsider', nick: 'Outside', password: 'test12345' });
    assert.ok(outsider.token);
    const event = await post('/api/tournaments/host', owner, { name: 'Private watch fixture', format: 'NLH', buyin: 1000, fee: 100, starting_stack: 5000, blind_speed: 5, late_reg: 60, mode: 'STANDARD' });
    const path = '/api/tournaments/' + event.id;
    const { invite } = await post(path + '/invite', owner);
    await post(path + '/register', entrant, { invite });
    const { tableId } = await post(path + '/play', entrant);
    const observe = async token => {
      const socket = srv.socket(token);
      sockets.push(socket);
      await socket.opened;
      socket.send({ type: 'join_table', tableId, observe: true });
      return socket;
    };
    assert.equal((await srv.get(path + '/watch', { token: outsider.token })).status, 404);
    const denied = await observe(outsider.token);
    assert.equal((await denied.nextType('error')).error, 'table not found');
    for (const token of [owner, entrant]) {
      const watch = await srv.get(path + '/watch', { token });
      assert.equal(watch.status, 200);
      assert.equal(watch.data.tableId, tableId);
      const socket = await observe(token);
      assert.equal((await socket.nextType('joined')).tableId, tableId);
      assert.ok((await socket.nextType('state')).state);
    }
    // Both authorized joins have now triggered state broadcasts.
    await assert.rejects(denied.next(m => ['joined', 'state'].includes(m.type), 200), /timed out/);
  } finally {
    await Promise.all(sockets.map(socket => socket.close()));
    await srv.stop();
    rmSync(srv.dataDir, { recursive: true, force: true });
  }
});
