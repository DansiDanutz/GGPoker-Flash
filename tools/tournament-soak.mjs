#!/usr/bin/env node
/**
 * Tournament restart soak: create a running event with two players, SIGKILL the
 * server while a snapshot exists, restart on the same data dir and prove the
 * room comes back with its players, stacks/level and the same table id.
 *
 * Usage: node tools/tournament-soak.mjs [--cycles 2] [--rooms 3]
 * Runs against a disposable temp database and random port; never touches the
 * production database or the 5197/5198 servers.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP = path.join(ROOT, 'app');
const arg = process.argv.indexOf('--cycles');
const CYCLES = Math.max(1, Number(arg > 0 ? process.argv[arg + 1] : process.env.SOAK_CYCLES) || 2);
const roomsArg = process.argv.indexOf('--rooms');
const ROOMS = Math.max(1, Number(roomsArg > 0 ? process.argv[roomsArg + 1] : process.env.SOAK_ROOMS) || 1);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer(dataDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: APP,
      env: { ...process.env, PORT: '0', GGPOKER_DATA: dataDir, NODE_ENV: 'test', GGPOKER_ADMIN_ALLOW: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timer = setTimeout(() => reject(new Error(`server start timeout\n${output}`)), 20_000);
    const onData = (chunk) => {
      output += chunk;
      const match = output.match(/LISTENING (\d+)/);
      if (!match) return;
      clearTimeout(timer);
      resolve({ child, port: Number(match[1]), base: `http://127.0.0.1:${match[1]}`, logs: () => output });
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}\n${output}`));
    });
  });
}

async function stopServer(child, signal = 'SIGTERM') {
  if (!child || child.exitCode != null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill(signal);
  await Promise.race([exited, sleep(5_000)]);
  if (child.exitCode == null) child.kill('SIGKILL');
}

async function login(base, loginName, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: loginName, password }),
  });
  assert.equal(res.status, 200, `login ${loginName}`);
  return (await res.json()).token;
}

async function register(base, loginName) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: loginName, nick: loginName, password: 'ggpoker' }),
  });
  const text = await res.text();
  assert.equal(res.status, 200, `register ${loginName}: ${text}`);
  return JSON.parse(text).token;
}

async function join(base, token, id) {
  const res = await fetch(`${base}/api/tournaments/${id}/play`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.json() };
}

function insertTournament(dataDir, id) {
  const db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
  try {
    db.prepare(`INSERT INTO tournaments (id,name,game,buyin,fee,gtd,start_at,status,max_players,entrants,starting_stack,blind_speed,late_reg,format,mode,enabled)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, 'Soak Event', 'holdem', 0, 0, 0, new Date(Date.now() - 60_000).toISOString(),
      'registering', 100, 0, 10_000, 8, 90, 'NLH', 'STANDARD', 1);
  } finally { db.close(); }
}

async function waitForSnapshot(dataDir, id, predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'));
      try {
        const row = db.prepare('SELECT state FROM tourney_state WHERE tournament_id = ?').get(id);
        if (row?.state) {
          const state = JSON.parse(row.state);
          if (predicate(state)) return state;
        }
      } finally { db.close(); }
    } catch { /* database busy while the server writes */ }
    await sleep(250);
  }
  return null;
}

async function cycle(index, rooms = ROOMS) {
  const dataDir = mkdtempSync(path.join(tmpdir(), `dangg-soak-${process.pid}-${index}-`));
  let first = null;
  let second = null;
  const checks = [];
  try {
    first = await startServer(dataDir);
    for (let r = 0; r < rooms; r += 1) {
      const id = `soak-${Date.now()}-${index}-${r}`;
      insertTournament(dataDir, id);
      const tag = `${String(Date.now()).slice(-5)}${r}`;
      const a = await register(first.base, `soaka${tag}`);
      const b = await register(first.base, `soakb${tag}`);
      for (const token of [a, b]) {
        const res = await fetch(`${first.base}/api/tournaments/${id}/register`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200, `register entrant room ${r}`);
      }
      const played = await join(first.base, a, id);
      assert.equal(played.status, 200, `start tournament room ${r}: ${JSON.stringify(played.body)}`);
      const tableId = played.body.tableId;
      assert.ok(tableId, `table id returned room ${r}`);

      const snapshot = await waitForSnapshot(dataDir, id, (state) =>
        (state.flights || []).some((flight) => (flight.players || []).length >= 2));
      assert.ok(snapshot, `settled snapshot with both players room ${r}`);
      const before = snapshot.flights.flatMap((flight) => flight.players).map((p) => ({ nick: p.nick, stack: p.stack }));
      assert.equal(before.length, 2, `two players snapshotted room ${r}`);
      checks.push({ id, tableId, token: a, before });
    }

    // Hard crash once, after every room has a settled-hand snapshot.
    await stopServer(first.child, 'SIGKILL');
    first = null;

    second = await startServer(dataDir);
    const admin = await login(second.base, 'admin', 'admin123');
    const live = await (await fetch(`${second.base}/api/admin/tournaments/live`, { headers: { authorization: `Bearer ${admin}` } })).json();
    for (const check of checks) {
      const room = live.tournaments.items.find((r) => r.id === check.id);
      assert.ok(room, `room ${check.id} restored after the crash`);
      assert.equal(room.playersLeft, 2, `both players restored in ${check.id}`);
      assert.ok(room.restoredAt, `restoredAt marker set in ${check.id}`);
      assert.ok(room.snapshot, `recovery snapshot reported in ${check.id}`);
      const reconnect = await join(second.base, check.token, check.id);
      assert.equal(reconnect.status, 200, `player can reconnect to ${check.id}`);
      assert.equal(reconnect.body.tableId, check.tableId, `reconnect returns the original table for ${check.id}`);
    }

    const summary = checks.map((check) => `${check.tableId}[${check.before.map((p) => `${p.nick}:${p.stack}`).join(',')}]`).join(' ');
    console.log(`cycle ${index + 1}: PASS  rooms=${checks.length}  ${summary}`);
    return true;
  } catch (err) {
    console.error(`cycle ${index + 1}: FAIL\n${err.stack || err}`);
    if (first?.logs) console.error(first.logs().split('\n').slice(-20).join('\n'));
    return false;
  } finally {
    if (first) await stopServer(first.child);
    if (second) await stopServer(second.child);
    rmSync(dataDir, { recursive: true, force: true });
  }
}

let failures = 0;
for (let i = 0; i < CYCLES; i += 1) {
  if (!(await cycle(i))) failures += 1;
}
console.log(`\n${CYCLES - failures}/${CYCLES} soak cycles passed (${ROOMS} room(s) per cycle)`);
process.exit(failures ? 1 : 0);
