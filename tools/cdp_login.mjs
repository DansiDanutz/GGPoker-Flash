// Minimal Chrome DevTools Protocol helper (no npm dependencies) used to log in the
// packaged Electron app and capture a screenshot.
import fs from 'node:fs';

const login = await fetch('http://127.0.0.1:5198/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
}).then((r) => r.json());

const targets = await fetch('http://127.0.0.1:9333/json/list').then((r) => r.json());
const page = targets.find((t) => t.type === 'page' && t.url.includes('5198')) || targets[0];
if (!page) throw new Error('no CDP page target; is the app running?');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable');
await send('Runtime.evaluate', { expression: `localStorage.setItem('ggpoker.token', ${JSON.stringify(login.token)}); localStorage.removeItem('ggpoker.guest'); true` });
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 3800));
await send('Runtime.evaluate', { expression: `window.location.hash = '/'; true` });
await new Promise((r) => setTimeout(r, 1600));
const shot = await send('Page.captureScreenshot', { format: 'png' });
const out = process.argv[2] || 'research/screens/deliverable/final_lobby.png';
fs.mkdirSync(out.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('logged in and captured', out);
ws.close();
