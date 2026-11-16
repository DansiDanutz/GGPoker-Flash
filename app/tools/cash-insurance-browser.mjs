#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const SOCKET = process.env.SOCKET_URL || 'ws://127.0.0.1:56198/ws';
const OUT = process.env.CASH_INSURANCE_AUDIT_OUT || '../docs/audits/2026-11-15-systematic-egm/cash-insurance-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tableId = `cash-insurance-browser-${Date.now()}`;
fs.mkdirSync(OUT, { recursive: true });

async function json(route, body, token) {
  const response = await fetch(`${BASE}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
async function until(page, predicate, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('DOM condition timed out');
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
    if (msg.type !== 'state' || msg.state.cashInsurance) return;
    const me = msg.state.players.find((seat) => seat?.isMe);
    if (me && msg.state.actor === me.id) socket.send(JSON.stringify({ type: 'action', tableId, action: 'allin', amount: 0 }));
  };
  socket.on('message', handler);
  return { socket, handler };
}

const admin = await json('/api/auth/login', { login: 'admin', password: 'admin123' });
await json('/api/admin/tables', { id: tableId, name: 'Cash Insurance Browser', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000, rimt_mode: 'off' }, admin.token);
await json('/api/admin/cash-insurance-rules', { insuranceFeeBasisPoints: 1000, expectedRevision: 1, operationId: `browser-cash-rules-${Date.now()}` }, admin.token);
await json('/api/admin/house/cash-insurance/fund', { amount: 100000000, reason: 'Browser insurance audit', operationId: `browser-cash-house-${Date.now()}` }, admin.token);
const players = [];
for (const [index, width] of [390, 1440].entries()) {
  const account = await json('/api/auth/register', { login: `ci${Date.now().toString(36)}${index}`, nick: `CI${Date.now().toString(36)}${index}`, password: 'secret12' });
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
      sessionStorage.setItem('ggpoker.entered', '1');
    }, player.token);
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${BASE}/#/table/${tableId}?buyin=4000&seat=${index}`, { waitUntil: 'domcontentloaded' });
    pages.push(page);
    await page.waitForSelector('.table-screen', { visible: true, timeout: 15000 });
    drivers.push(await drive(player.token));
  }
  let underdogIndex = -1;
  await Promise.any(pages.map((page, index) => until(page, () => [...document.querySelectorAll('.cash-insurance-quote-row button')].some((button) => button.textContent === 'Get quote')).then(() => { underdogIndex = index; })));
  if (underdogIndex < 0) throw new Error('No underdog quote panel');
  for (const driver of drivers) driver.socket.off('message', driver.handler);
  await pages[underdogIndex].bringToFront();
  await pages[underdogIndex].evaluate(() => [...document.querySelectorAll('.cash-insurance-quote-row button')].find((button) => button.textContent === 'Get quote')?.click());
  await until(pages[underdogIndex], () => [...document.querySelectorAll('.cash-insurance-quote-row button')].some((button) => button.textContent === 'Accept insurance'));
  await pages[underdogIndex].screenshot({ path: path.join(OUT, 'quote.png') });
  await pages[underdogIndex].evaluate(() => [...document.querySelectorAll('.cash-insurance-quote-row button')].find((button) => button.textContent === 'Accept insurance')?.click());
  await until(pages[underdogIndex], () => document.querySelector('.cash-insurance-panel')?.textContent.includes('was paid') || document.querySelector('.cash-insurance-panel')?.textContent.includes('hold was released'));
  await Promise.all(pages.map((page, index) => page.screenshot({ path: path.join(OUT, `result-${players[index].width}.png`) })));
  const geometry = [];
  for (const [index, page] of pages.entries()) geometry.push(await page.evaluate((width) => ({ width, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, status: document.querySelector('.cash-insurance-panel')?.textContent }), players[index].width));
  const result = { completed: true, underdogIndex, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (errors.length || geometry.some((row) => row.overflowX > 1)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} catch (error) {
  for (const [index, page] of pages.entries()) console.log('page', index, await page.evaluate(() => document.body.innerText.slice(0, 2200)));
  throw error;
} finally {
  for (const driver of drivers) driver.socket.close();
  await browser.close();
}
