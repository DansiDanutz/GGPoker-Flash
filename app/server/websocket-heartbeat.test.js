import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { startHeartbeat } from './websocket-heartbeat.js';

async function fixture(t) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(wss, 'listening');
  const stop = startHeartbeat(wss, 100);
  t.after(async () => {
    stop();
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
  });
  return { wss, url: `ws://127.0.0.1:${wss.address().port}` };
}

test('healthy protocol pongs keep an idle connection alive', { timeout: 5000 }, async t => {
  const { url } = await fixture(t);
  const ws = new WebSocket(url);
  t.after(() => ws.terminate());
  let pings = 0;
  const observed = new Promise(resolve => ws.on('ping', () => { if (++pings === 3) resolve(); }));
  await once(ws, 'open');
  await observed;
  assert.equal(ws.readyState, WebSocket.OPEN);
});

test('an unresponsive connection is terminated without a close handshake', { timeout: 5000 }, async t => {
  const { url } = await fixture(t);
  const ws = new WebSocket(url, { autoPong: false });
  const ping = once(ws, 'ping'), closed = once(ws, 'close');
  await once(ws, 'open');
  await ping;
  assert.equal(ws.readyState, WebSocket.OPEN, 'first missed response gets one interval to arrive');
  const [code] = await closed;
  assert.equal(code, 1006, 'server terminated the transport instead of waiting for a close reply');
});

test('a replacement connection remains healthy when the old socket expires', { timeout: 5000 }, async t => {
  const { url } = await fixture(t);
  const old = new WebSocket(url, { autoPong: false });
  const ping = once(old, 'ping'), closed = once(old, 'close');
  await once(old, 'open'); await ping;
  const replacement = new WebSocket(url);
  t.after(() => replacement.terminate());
  await once(replacement, 'open'); await closed;
  await once(replacement, 'ping');
  assert.equal(replacement.readyState, WebSocket.OPEN);
});
