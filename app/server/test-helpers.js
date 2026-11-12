// Shared helpers for integration tests: boot a real server on an ephemeral port with a throwaway database.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const root = path.resolve(import.meta.dirname, '..');

export function startServer({ dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangro-test-')), env = {} } = {}) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: '0', GGPOKER_DATA: dataDir, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  return new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('server start timeout')); }, 15000);
    child.stdout.on('data', (d) => {
      out += String(d);
      const m = out.match(/LISTENING (\d+)/);
      if (m) { clearTimeout(timer); resolve(makeClient(child, Number(m[1]), dataDir, exited)); }
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`exit ${code}`)); });
  });
}

function makeClient(child, port, dataDir, exited) {
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, route, { token, body, headers = {} } = {}) => {
    const res = await fetch(base + route, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
  return {
    child, port, base, dataDir, exited,
    get: (route, opts) => call('GET', route, opts),
    post: (route, opts) => call('POST', route, opts),
    put: (route, opts) => call('PUT', route, opts),
    del: (route, opts) => call('DELETE', route, opts),
    login: async (login, password) => (await call('POST', '/api/auth/login', { body: { login, password } })).data.token,
    balance: async (token) => (await call('GET', '/api/me', { token })).data.user.balance,
    socket: (token) => openSocket(port, token),
    stop: async (signal = 'SIGKILL') => { child.kill(signal); await exited; },
  };
}

// A WebSocket wrapper that lets a test await the next message matching a predicate.
function openSocket(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token || '')}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  const next = (match, timeoutMs = 5000) => {
    const i = inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for a socket message')), timeoutMs);
      waiters.push({ match, resolve: (m) => { clearTimeout(timer); resolve(m); } });
    });
  };
  return {
    ws,
    opened: new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); }),
    send: (msg) => ws.send(JSON.stringify(msg)),
    next,
    nextType: (type, timeoutMs) => next((m) => m.type === type, timeoutMs),
    close: () => new Promise((resolve) => { ws.once('close', resolve); ws.terminate(); }),
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Seat humans at one table without bots in between: everyone watches, reserves seat i
 * (Take Seat; bots never take a reserved seat) and then buys in. A bot holding live cards
 * is never removed mid-hand, so this is how a test fills a table with humans only.
 * `players` are open sockets; resolves with each player's seat.
 */
export async function seatHumans(players, tableId, buyin) {
  for (const sock of players) {
    sock.send({ type: 'join_table', tableId, observe: true });
    await sock.next((m) => m.type === 'joined' && m.tableId === tableId);
  }
  for (const [seat, sock] of players.entries()) {
    sock.send({ type: 'reserve_seat', tableId, seat });
    await sock.next((m) => m.type === 'seat_reserved' && m.tableId === tableId);
  }
  const seats = [];
  for (const [seat, sock] of players.entries()) {
    sock.send({ type: 'join_table', tableId, buyin, seat });
    seats.push((await sock.next((m) => m.type === 'joined' && m.tableId === tableId && m.seat != null)).seat);
  }
  return seats;
}

// Read an SSE stream until a `data:` frame matches `match`.
export async function nextSseEvent(base, token, match, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const res = await fetch(`${base}/api/notifications/stream?token=${encodeURIComponent(token)}`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('SSE stream ended');
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop();
      for (const frame of frames) {
        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        const evt = line ? JSON.parse(line.slice(6)) : null;
        if (evt && match(evt)) return evt;
      }
    }
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}
