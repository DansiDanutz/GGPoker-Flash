import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
function startServer() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-features-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root, env: { ...process.env, PORT: '0', GGPOKER_DATA: data }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 15000);
    child.stdout.on('data', (d) => { out += String(d); const m = out.match(/LISTENING (\d+)/); if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]), data }); } });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`exit ${code}`)); });
  });
}
async function login(port, login, password) {
  const r = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password }) });
  return r.json();
}
const H = (token) => ({ 'content-type': 'application/json', authorization: `Bearer ${token}` });

test('host tables, private tournaments, bonuses and direct messages', async () => {
  const { child, port } = await startServer();
  try {
    const base = `http://127.0.0.1:${port}`;
    const u = await login(port, 'DansiDanutz', 'ggpoker');
    const admin = await login(port, 'admin', 'admin123');

    let r = await fetch(`${base}/api/tables/host`, { method: 'POST', headers: H(u.token), body: JSON.stringify({ name: 'Feature Table', game: 'holdem', seats: 6, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000 }) });
    const host = await r.json();
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/tables/host`, { headers: H(u.token) });
    assert.equal((await r.json()).tables.some((t) => t.id === host.id), true);
    const publicLobby = await (await fetch(`${base}/api/lobby`)).json();
    assert.equal(publicLobby.tables.some((t) => t.id === host.id), false);

    r = await fetch(`${base}/api/tables/host/${host.id}/mutes`, { method: 'POST', headers: H(u.token), body: JSON.stringify({ userId: 2, muted: true }) });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/tables/host/${host.id}/mutes`, { headers: H(u.token) });
    assert.equal((await r.json()).muted[0].user_id, 2);

    r = await fetch(`${base}/api/tournaments/host`, { method: 'POST', headers: H(u.token), body: JSON.stringify({ name: 'Feature Freezeout', format: 'NLH', buyin: 1000, fee: 100, starting_stack: 5000, blind_speed: 5, late_reg: 60, mode: 'STANDARD' }) });
    const tourney = await r.json();
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/tournaments/${tourney.id}`);
    assert.equal((await r.json()).tournament.name, 'Feature Freezeout');

    r = await fetch(`${base}/api/cashier`, { headers: H(u.token) });
    const before = (await r.json()).bonuses.find((b) => b.id === 'daily');
    r = await fetch(`${base}/api/cashier/bonus`, { method: 'POST', headers: H(u.token), body: JSON.stringify({ id: 'daily' }) });
    assert.equal(r.status, before.claimed ? 409 : 200);

    r = await fetch(`${base}/api/reports`, { method: 'POST', headers: H(u.token), body: JSON.stringify({ targetId: 2, reason: 'Other', detail: 'test', handId: 'hand-test-1' }) });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/admin/reports`, { headers: H(admin.token) });
    const reports = await r.json();
    assert.equal(reports.reports[0].hand_id, 'hand-test-1');

    r = await fetch(`${base}/api/elo`, { headers: H(u.token) });
    const elo = await r.json();
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(elo.leaders));
    assert.equal(elo.me.elo, 1000);

    r = await fetch(`${base}/api/messages`, { method: 'POST', headers: H(admin.token), body: JSON.stringify({ peerId: u.user.id, message: 'Feature DM' }) });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/messages`, { headers: H(u.token) });
    assert.equal((await r.json()).threads.some((t) => t.unread >= 1), true);

    r = await fetch(`${base}/api/tables/host/${host.id}`, { method: 'DELETE', headers: H(u.token) });
    assert.equal(r.status, 200);
    r = await fetch(`${base}/api/tournaments/host/${tourney.id}`, { method: 'DELETE', headers: H(u.token) });
    assert.equal(r.status, 200);
  } finally { child.kill(); }
});
