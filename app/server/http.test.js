import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './test-helpers.js';

test('server binds an ephemeral port and serves the API', async () => {
  const { child, port } = await startServer();
  try {
    const lobby = await fetch(`http://127.0.0.1:${port}/api/lobby`).then((r) => r.json());
    assert.ok(Array.isArray(lobby.tables));
    assert.equal(lobby.tables[0].synthetic, true);
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
    }).then((r) => r.json());
    assert.ok(login.token);
    const deposit = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ amount: 1000, method: 'card' }),
    }).then((r) => r.json());
    assert.equal(deposit.ok, true);
    const bad = await fetch(`http://127.0.0.1:${port}/api/admin/users/1`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ action: 'credit', amount: 1 }),
    });
    assert.equal(bad.status, 403);
  } finally {
    child.kill();
  }
});
