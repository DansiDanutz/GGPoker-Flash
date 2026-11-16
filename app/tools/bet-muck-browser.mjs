#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const SOCKET = process.env.SOCKET_URL || 'ws://127.0.0.1:56198/ws';
const OUT = process.env.BET_MUCK_AUDIT_OUT || '../docs/audits/2026-11-15-systematic-egm/bet-muck-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tableId = `bet-muck-browser-${Date.now()}`;
fs.mkdirSync(OUT, { recursive: true });

async function until(page, predicate, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('DOM condition timed out');
}

async function json(route, body, token) {
  const response = await fetch(`${BASE}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function reserve(seat, token) {
  const socket = new WebSocket(`${SOCKET}?token=${encodeURIComponent(token)}`);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'join_table', tableId, observe: true }));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Seat reservation timed out')), 10000);
    socket.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'joined') socket.send(JSON.stringify({ type: 'reserve_seat', tableId, seat }));
      if (msg.type === 'seat_reserved') { clearTimeout(timer); socket.close(); resolve(); }
      if (msg.type === 'error') { clearTimeout(timer); reject(new Error(msg.error)); }
    });
  });
}

async function drive(token) {
  const socket = new WebSocket(`${SOCKET}?token=${encodeURIComponent(token)}`);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'join_table', tableId }));
  const handler = (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type !== 'state' || msg.state.street === 'river') return;
    const me = msg.state.players.find((seat) => seat?.isMe);
    if (me && msg.state.actor === me.id) socket.send(JSON.stringify({ type: 'action', tableId, action: msg.state.currentBet > me.bet ? 'call' : 'check', amount: 0 }));
  };
  socket.on('message', handler);
  return { socket, handler };
}

const admin = await json('/api/auth/login', { login: 'admin', password: 'admin123' });
await json('/api/admin/tables', { id: tableId, name: 'Bet Muck Browser', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, bet_and_muck: 1, bet_muck_condition_rank: 1 }, admin.token);
const players = [];
for (const [index, width] of [390, 1440].entries()) {
  const account = await json('/api/auth/register', { login: `bm${Date.now().toString(36)}${index}`, nick: `BM${Date.now().toString(36)}${index}`, password: 'secret12' });
  players.push({ ...account, width });
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const pages = [];
const drivers = [];
const errors = [];
try {
  for (const [index, player] of players.entries()) await reserve(index, player.token);
  for (const [index, player] of players.entries()) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: player.width, height: index ? 900 : 844, isMobile: !index, hasTouch: !index });
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('ggpoker.token', token);
      localStorage.setItem('ggpoker.welcomeSeen', '1');
      localStorage.setItem('ggpoker.animations', '0');
      localStorage.setItem('ggpoker.confirmBet', '0');
      sessionStorage.setItem('ggpoker.entered', '1');
    }, player.token);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') console.log('browser console', index, message.text()); });
    page.on('response', (response) => { if (response.url().includes('bet-and-muck')) console.log('bet response', index, response.status()); });
    await page.goto(`${BASE}/#/table/${tableId}?buyin=4000&seat=${index}`, { waitUntil: 'domcontentloaded' });
    pages.push(page);
    await page.waitForSelector('.table-screen', { visible: true, timeout: 15000 });
    drivers.push(await drive(player.token));
  }
  let bettorIndex = -1;
  await Promise.any(pages.map((page, index) => until(page, () => !!document.querySelector('.bet-muck-toggle input')).then(() => { bettorIndex = index; })));
  if (bettorIndex < 0) throw new Error('No Bet-and-Muck toggle reached the river');
  for (const driver of drivers) driver.socket.off('message', driver.handler);
  const opponentIndex = bettorIndex === 0 ? 1 : 0;
  await pages[bettorIndex].bringToFront();
  await pages[bettorIndex].click('.bet-muck-toggle input');
  await until(pages[bettorIndex], () => document.querySelector('.bet-muck-panel')?.dataset.selected === 'true');
  console.log('before flag', await pages[bettorIndex].evaluate(() => ({ selected: document.querySelector('.bet-muck-panel')?.dataset.selected, toggle: !!document.querySelector('.bet-muck-toggle input'), button: document.querySelector('.act-btn')?.outerHTML })));
  const flagResponse = pages[bettorIndex].waitForResponse((response) => response.url().includes('/bet-and-muck'), { timeout: 10000 });
  await pages[bettorIndex].click('.act-raise, .act-allin');
  console.log('flag response', (await flagResponse).status());
  await pages[opponentIndex].waitForFunction(() => document.querySelector('.bet-muck-panel p')?.textContent.includes('A call folds the bettor'), { timeout: 10000 });
  await pages[opponentIndex].bringToFront();
  await pages[opponentIndex].evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.startsWith('Call'))?.click());
  await pages[opponentIndex].waitForFunction(() => document.body.innerText.includes('Hand complete'), { timeout: 10000 }).catch(() => undefined);
  await pages[opponentIndex].screenshot({ path: path.join(OUT, 'result-desktop.png') });
  await pages[bettorIndex].screenshot({ path: path.join(OUT, 'result-phone.png') });
  const geometry = [];
  for (const [index, page] of pages.entries()) geometry.push(await page.evaluate((width) => ({ width, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, flagPresent: !!document.querySelector('.bet-muck-panel') }), players[index].width));
  const result = { completed: true, bettorIndex, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (errors.length || geometry.some((row) => row.overflowX > 1)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} catch (error) {
  console.log('page errors', errors);
  for (const [index, page] of pages.entries()) console.log('page', index, await page.evaluate(() => ({ hash: location.hash, selected: document.querySelector('.bet-muck-panel')?.dataset.selected, text: document.body.innerText.slice(0, 2600) })));
  throw error;
} finally {
  for (const driver of drivers) driver.socket.close();
  await browser.close();
}
