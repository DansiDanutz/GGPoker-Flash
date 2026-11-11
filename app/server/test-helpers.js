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
