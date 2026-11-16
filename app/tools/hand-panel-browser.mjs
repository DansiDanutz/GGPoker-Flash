#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const WS = process.env.WS_URL || 'ws://127.0.0.1:56198/ws';
const OUT = process.env.HAND_AUDIT_OUT || '../docs/audits/2026-11-15-systematic-egm/hand-panel-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });
async function json(route, body, token) {
  const response = await fetch(`${BASE}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const suffix = Date.now().toString(36);
const admin = await json('/api/auth/login', { login: 'admin', password: 'admin123' });
const tableId = `hand-panel-${suffix}`;
await json('/api/admin/tables', { id: tableId, name: 'Hand Panel Browser', game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000 }, admin.token);
const players = [];
for (const [index, role] of ['aggressor', 'caller'].entries()) {
  const account = await json('/api/auth/register', { login: `hp${suffix}${index}`, nick: `HP${suffix}${index}`, password: 'secret12' });
  players.push({ ...account, role });
}

async function reserve(seat, token) {
  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(token)}`);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Seat reservation timed out')), 10000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join_table', tableId, observe: true })));
    ws.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'joined') ws.send(JSON.stringify({ type: 'reserve_seat', tableId, seat }));
      if (message.type === 'seat_reserved') { clearTimeout(timer); ws.close(); resolve(); }
      if (message.type === 'error') { clearTimeout(timer); reject(new Error(message.error)); }
    });
    ws.on('error', reject);
  });
}

async function playHand(pages) {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (await pages[0].evaluate(() => document.body.innerText.includes('wins'))) return;
    let acted = false;
    for (const [index, page] of pages.entries()) {
      const clicked = await page.evaluate((aggressor) => {
        const buttons = [...document.querySelectorAll('.action-bar button')].filter((button) => !button.disabled && button.getBoundingClientRect().width > 0);
        const confirm = buttons.find((entry) => entry.textContent === 'Confirm');
        const button = confirm || (aggressor
          ? buttons.find((entry) => entry.textContent === 'Raise $4.00' || entry.textContent.startsWith('Bet ') || entry.textContent.startsWith('All in'))
          : buttons.find((entry) => entry.textContent === 'Check' || entry.textContent.startsWith('Call ')));
        if (!button) return false;
        button.click();
        return button.textContent;
      }, index === 0);
      if (clicked) { console.log('browser action', index, clicked); acted = true; break; }
    }
    if (!acted) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Browser hand did not settle');
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const pages = [];
const errors = [];
try {
  for (const [index, player] of players.entries()) await reserve(index, player.token);
  for (const [index, player] of players.entries()) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('ggpoker.token', token);
      localStorage.setItem('ggpoker.welcomeSeen', '1');
      localStorage.setItem('ggpoker.animations', '0');
      sessionStorage.setItem('ggpoker.entered', '1');
    }, player.token);
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${BASE}/#/table/${tableId}?buyin=4000&seat=${index}`, { waitUntil: 'domcontentloaded' });
    pages.push(page);
  }
  await Promise.all(pages.map((page) => page.waitForSelector('[data-hand-rank-open]:not([disabled])', { visible: true, timeout: 20000 })));
  await pages[0].click('[data-hand-rank-open]');
  await pages[0].waitForSelector('.own-hand-rank', { visible: true });
  await pages[0].screenshot({ path: path.join(OUT, 'preflop-hand-rank.png') });
  await pages[0].keyboard.press('Escape');
  await playHand(pages);
  await pages[0].waitForFunction(() => document.body.innerText.includes('wins'), { timeout: 15000 });
  await pages[0].click('[data-hand-rank-open]');
  await pages[0].waitForSelector('.own-hand-panel', { visible: true });
  await pages[0].click('[role="tab"][aria-selected="false"]');
  await pages[0].waitForFunction(() => document.body.innerText.includes('Flop continuation'));
  const hudText = await pages[0].evaluate(() => document.querySelector('.own-hand-panel').textContent);
  if (!hudText.includes('100%')) throw new Error(`Continuation HUD is not populated: ${hudText}`);
  await pages[0].screenshot({ path: path.join(OUT, 'hud-390.png'), fullPage: true });
  await pages[0].keyboard.press('ArrowRight');
  await pages[0].waitForFunction(() => document.body.innerText.includes('Pots won at showdown'));
  const statsText = await pages[0].evaluate(() => document.querySelector('.own-hand-panel').textContent);
  if (!/[01] of 1 \((?:0|100)%\)/.test(statsText)) throw new Error(`Session stats are incorrect: ${statsText}`);

  const geometry = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await pages[0].setViewport({ width, height: width < 600 ? 844 : 900, isMobile: true, hasTouch: true });
    try { await pages[0].waitForSelector('.own-hand-stats', { timeout: 3000 }); }
    catch (error) { console.log('stats viewport state', width, await pages[0].evaluate(() => ({ text: document.body.innerText.slice(0, 1600), panel: document.querySelector('.own-hand-panel')?.outerHTML.slice(0, 1000) }))); throw error; }
    geometry.push(await pages[0].evaluate((width) => ({ width, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, panel: document.querySelector('.own-hand-panel').getBoundingClientRect().toJSON() }), width));
    await pages[0].screenshot({ path: path.join(OUT, `stats-${width}.png`), fullPage: true });
  }
  await pages[0].keyboard.press('Escape');
  await pages[0].waitForFunction(() => document.activeElement?.hasAttribute('data-hand-rank-open'), { timeout: 3000 });
  const focused = await pages[0].evaluate(() => document.activeElement?.hasAttribute('data-hand-rank-open'));
  const hudResponse = await fetch(`${BASE}/api/tables/${tableId}/hud?id=${players[0].user.id}&nick=${encodeURIComponent(players[0].user.nick)}`, { headers: { authorization: `Bearer ${players[0].token}` } }).then((response) => response.json());
  const continuation = hudResponse.hud.continuation;
  const callerResponse = await fetch(`${BASE}/api/tables/${tableId}/hud?id=${players[1].user.id}&nick=${encodeURIComponent(players[1].user.nick)}`, { headers: { authorization: `Bearer ${players[1].token}` } }).then((response) => response.json());
  const responses = callerResponse.hud.continuation;
  for (const street of ['flop', 'turn']) {
    if (continuation[`${street}CbOpportunities`] !== 1 || continuation[`${street}CbBets`] !== 1 || responses[`${street}CbResponses`] !== 1 || responses[`${street}CbCalls`] !== 1) throw new Error(JSON.stringify({ continuation, responses }));
  }
  const result = { completed: true, tableId, continuation, responses, session: hudResponse.hud.session, focusReturned: focused, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (!focused || errors.length || geometry.some((row) => row.overflowX > 1 || row.panel.left < -1 || row.panel.right > row.width + 1)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} catch (error) {
  console.log('browser errors', errors);
  for (const [index, page] of pages.entries()) console.log('page', index, await page.evaluate(() => document.body.innerText.slice(0, 2000)));
  throw error;
} finally { await browser.close(); }
