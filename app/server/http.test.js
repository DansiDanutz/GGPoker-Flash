import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function startServer() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-http-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: '0', GGPOKER_DATA: data },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 15000);
    child.stdout.on('data', (d) => {
      out += String(d);
      const m = out.match(/LISTENING (\d+)/);
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]) }); }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`exit ${code}`)); });
  });
}

test('server binds an ephemeral port and serves the API', async () => {
  const { child, port } = await startServer();
  try {
    const lobby = await fetch(`http://127.0.0.1:${port}/api/lobby`).then((r) => r.json());
    assert.ok(Array.isArray(lobby.tables));
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
