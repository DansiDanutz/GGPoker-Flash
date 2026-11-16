#!/usr/bin/env node
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const OUT = process.env.RIMT_SCREENSHOT || '../docs/audits/2026-11-15-systematic-egm/rimt-two-browser.png';
const RUNS = Number(process.env.RIMT_RUNS || 2);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function json(route, body, token) {
  const response = await fetch(`${BASE}${route}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function reserve(tableId, seat, token) {
  const ws = new WebSocket(`ws://127.0.0.1:56198/ws?token=${encodeURIComponent(token)}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('reserve timeout')), 10000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join_table', tableId, observe: true })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'joined') ws.send(JSON.stringify({ type: 'reserve_seat', tableId, seat }));
      if (msg.type === 'seat_reserved') { clearTimeout(timer); ws.close(); resolve(); }
      if (msg.type === 'error') { clearTimeout(timer); console.log('socket error', msg.error); reject(new Error(msg.error)); }
    });
    ws.on('error', reject);
  });
}

async function allIn(tableId, token) {
  const ws = new WebSocket(`ws://127.0.0.1:56198/ws?token=${encodeURIComponent(token)}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('all-in timeout')), 15000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join_table', tableId })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'state') {
        const me = msg.state.players.find((player) => player?.isMe);
        if (me && msg.state.actor === me.id) ws.send(JSON.stringify({ type: 'action', tableId, action: 'allin', amount: 0 }));
        if (msg.state.rimt) { clearTimeout(timer); ws.close(); resolve(); }
      }
      if (msg.type === 'error' && msg.error !== 'not your turn') { clearTimeout(timer); reject(new Error(msg.error)); }
    });
    ws.on('error', reject);
  });
}

const admin = await json('/api/auth/login', { login: 'admin', password: 'admin123' });
const tableId = `rimt-browser-${Date.now()}`;
await json('/api/admin/tables', { id: tableId, name: 'RIMT Browser', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, rimt_mode: 'negotiated' }, admin.token);
const players = [];
for (const name of [`rimt_a_${Date.now()}`, `rimt_b_${Date.now()}`]) {
  const account = await json('/api/auth/register', { login: name, nick: name, password: 'secret12' });
  players.push(account);
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const pages = [];
try {
  for (const account of players) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('ggpoker.token', token);
      localStorage.setItem('ggpoker.welcomeSeen', '1');
      localStorage.setItem('ggpoker.animations', '0');
      sessionStorage.setItem('ggpoker.entered', '1');
    }, account.token);
    await reserve(tableId, players.indexOf(account), account.token);
    await page.goto(`${BASE}/#/table/${tableId}?buyin=4000&seat=${players.indexOf(account)}`, { waitUntil: 'domcontentloaded' });
    pages.push(page);
  }
  await Promise.all(pages.map((page) => allIn(tableId, players[pages.indexOf(page)].token)));
  const proposerIndex = await Promise.any(pages.map((page, index) => page.waitForFunction(() => document.body.innerText.includes('Choose run count'), { timeout: 15000 }).then(() => index)));
  const deciderIndex = proposerIndex === 0 ? 1 : 0;
  await pages[proposerIndex].evaluate((runs) => [...document.querySelectorAll('button')].find((button) => button.textContent === (runs === 3 ? 'Run it three times' : runs === 2 ? 'Run it twice' : 'Run it once'))?.click(), RUNS);
  await pages[deciderIndex].waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === 'Accept'), { timeout: 10000 });
  await pages[deciderIndex].evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Accept')?.click());
  for (const page of pages) {
    await page.waitForFunction((runs) => !document.querySelector('.rimt-panel') && document.querySelectorAll('.rimt-board').length === runs, { timeout: 20000 }, RUNS);
  }
  const result = { tableId, proposerIndex, deciderIndex, runs: RUNS, completed: true };
  fs.writeFileSync(OUT.replace(/\.png$/, '.json'), JSON.stringify(result, null, 2));
  await pages[deciderIndex].screenshot({ path: OUT });
  console.log(JSON.stringify(result));
} catch (error) {
  for (const [index, page] of pages.entries()) {
    console.log('page', index, await page.evaluate(() => document.body.innerText.slice(0, 1500)));
    console.log('board markup', index, await page.evaluate(() => document.querySelector('.board')?.outerHTML.slice(0, 500)));
    await page.screenshot({ path: `/tmp/rimt-browser-failure-${index}.png` });
  }
  throw error;
} finally {
  await browser.close();
}
