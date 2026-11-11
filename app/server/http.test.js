import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
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
      if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]), data }); }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`exit ${code}`)); });
  });
}

test('server binds an ephemeral port and serves the API', async () => {
  const { child, port, data } = await startServer();
  try {
    const lobby = await fetch(`http://127.0.0.1:${port}/api/lobby`).then((r) => r.json());
    assert.ok(Array.isArray(lobby.tables));
    assert.equal(lobby.tables[0].synthetic, true);
    const badOrigin = await fetch(`http://127.0.0.1:${port}/api/lobby`, { headers: { origin: 'http://evil.example' } });
    assert.equal(badOrigin.status, 403);
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
    const first = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
      body: JSON.stringify({ amount: 700, method: 'card' }),
    }).then((r) => r.json());
    const second = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
      body: JSON.stringify({ amount: 700, method: 'card' }),
    }).then((r) => r.json());
    assert.equal(first.balance, second.balance);
    assert.equal(second.replayed, true);
    const conflict = await fetch(`http://127.0.0.1:${port}/api/cashier/deposit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'test-key-1' },
      body: JSON.stringify({ amount: 800, method: 'card' }),
    });
    assert.equal(conflict.status, 409);
    const w1 = await fetch(`http://127.0.0.1:${port}/api/cashier/withdraw`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'wd-1' },
      body: JSON.stringify({ amount: 100, method: 'bank' }),
    }).then((r) => r.json());
    const w2 = await fetch(`http://127.0.0.1:${port}/api/cashier/withdraw`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}`, 'idempotency-key': 'wd-1' },
      body: JSON.stringify({ amount: 100, method: 'bank' }),
    }).then((r) => r.json());
    assert.equal(w1.balance, w2.balance);
    assert.equal(w2.replayed, true);
    const reg = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'freshuser', nick: 'Fresh', password: 'fresh123' }),
    }).then((r) => r.json());
    assert.equal(reg.user.balance, 600000);
    const regCash = await fetch(`http://127.0.0.1:${port}/api/cashier`, {
      headers: { authorization: `Bearer ${reg.token}` },
    }).then((r) => r.json());
    assert.equal(regCash.user.balance, 600000);
    assert.equal(regCash.transactions.find((t) => t.kind === 'welcome')?.amount, 600000);
    const bad = await fetch(`http://127.0.0.1:${port}/api/admin/users/1`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ action: 'credit', amount: 1 }),
    });
    assert.equal(bad.status, 403);
    const admin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
    }).then((r) => r.json());
    const del = await fetch(`http://127.0.0.1:${port}/api/admin/users/3`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ action: 'delete' }),
    }).then((r) => r.json());
    assert.equal(del.ok, true);
    const guest = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'guest', password: 'guest' }),
    });
    assert.equal(guest.status, 400);
    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
    const deleted = db.prepare('SELECT deleted_at, login FROM users WHERE id = 3').get();
    assert.ok(deleted.deleted_at);
    assert.ok(deleted.login.startsWith('deleted:3:'));
  } finally {
    child.kill();
  }
});


test('live join and leave write matching session markers', async () => {
  const { child, port, data } = await startServer();
  try {
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
    }).then((r) => r.json());
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${login.token}`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ type: 'join_table', tableId: 'nlh-diamond-01', buyin: 50000 }));
    await new Promise((r) => setTimeout(r, 1800));
    ws.send(JSON.stringify({ type: 'leave_table', tableId: 'nlh-diamond-01' }));
    await new Promise((r) => setTimeout(r, 600));
    ws.close();
    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
    const rows = db.prepare("SELECT kind, amount, session_id, reference FROM transactions WHERE session_id IS NOT NULL ORDER BY id").all();
    assert.equal(rows[0].kind, 'buyin');
    assert.ok(rows[0].reference.startsWith('in:'));
    const close = rows.find((r) => r.reference.startsWith('out:'));
    assert.ok(close);
    assert.equal(close.session_id, rows[0].session_id);
    assert.equal(close.reference, `out:${rows[0].session_id}`);
  } finally {
    child.kill();
  }
});


test('deleting a user closes the live socket and blocks a rejoin', async () => {
  const { child, port, data } = await startServer();
  try {
    const user = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
    }).then((r) => r.json());
    const admin = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
    }).then((r) => r.json());
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${user.token}`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ type: 'join_table', tableId: 'nlh-diamond-01', buyin: 50000 }));
    await new Promise((r) => setTimeout(r, 1200));
    const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
    await fetch(`http://127.0.0.1:${port}/api/admin/users/1`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
      body: JSON.stringify({ action: 'delete' }),
    });
    assert.equal(await closed, 4001);
    const db = new DatabaseSync(path.join(data, 'ggpoker.db'));
    const second = db.prepare("SELECT COUNT(*) c FROM transactions WHERE session_id LIKE 'nlh-diamond-02:%'").get().c;
    assert.equal(second, 0);
  } finally {
    child.kill();
  }
});
