#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const WS = process.env.WS_URL || 'ws://127.0.0.1:56198/ws';
const OUT = process.env.AUTO_FOLD_AUDIT_OUT || '../docs/audits/2026-11-15-systematic-egm/auto-fold-browser';
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
const tableId = `auto-fold-browser-${suffix}`;
await json('/api/admin/tables', { id: tableId, name: 'Auto Fold Browser', game: 'rush', seats: 6, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000 }, admin.token);
const account = await json('/api/auth/register', { login: `af${suffix}`, nick: `AF${suffix}`, password: 'secret12' });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const geometry = [];
try {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((token) => {
    localStorage.setItem('ggpoker.token', token);
    localStorage.setItem('ggpoker.welcomeSeen', '1');
    localStorage.setItem('ggpoker.animations', '0');
    sessionStorage.setItem('ggpoker.entered', '1');
  }, account.token);
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${BASE}/#/table/${tableId}?buyin=4000&seat=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === 'Menu'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Menu')?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent === 'Auto Fold'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Auto Fold')?.click());
  await page.waitForSelector('.auto-fold-editor', { visible: true });
  const cells = await page.$$('.auto-fold-cell');
  if (cells.length !== 169) throw new Error(`Expected 169 cells, received ${cells.length}`);
  await page.evaluate(() => {
    const enable = [...document.querySelectorAll('.auto-fold-options input')][0];
    if (!enable.checked) enable.click();
    [...document.querySelectorAll('.auto-fold-cell')][0].click();
  });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Apply')?.click());
  await page.waitForFunction(() => !document.querySelector('.auto-fold-editor'));
  const saved = await json('/api/auto-fold', { expectedRevision: 1, operationId: `all-${suffix}`, config: { active: true, button: true, blinds: true, rate: 95, selected: Array.from({ length: 169 }, (_, index) => index) } }, account.token);
  if (saved.revision !== 2) throw new Error(`Unexpected preference revision ${saved.revision}`);

  const ws = new WebSocket(`${WS}?token=${encodeURIComponent(account.token)}`);
  const folded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed Auto Fold did not happen')), 15000);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join_table', tableId, observe: true })));
    ws.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type === 'state' && message.state.players.some((player) => player.isMe && player.folded)) { clearTimeout(timer); resolve(); }
    });
    ws.on('error', reject);
  });
  await folded;
  ws.close();

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: width < 600 ? 844 : 900, isMobile: true, hasTouch: true });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Menu')?.click());
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Auto Fold')?.click());
    await page.waitForSelector('.auto-fold-editor', { visible: true });
    geometry.push(await page.evaluate((width) => ({
      width, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      gridWidth: document.querySelector('.auto-fold-grid').getBoundingClientRect().width,
      scrollerWidth: document.querySelector('.auto-fold-grid-scroll').getBoundingClientRect().width,
      cells: document.querySelectorAll('.auto-fold-cell').length,
    }), width));
    await page.screenshot({ path: path.join(OUT, `editor-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
  }
  const result = { completed: true, tableId, preferenceRevision: saved.revision, folded: true, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (errors.length || geometry.some((row) => row.overflowX > 1 || row.cells !== 169 || row.gridWidth !== 620 || row.scrollerWidth > row.width + 1)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} catch (error) {
  console.log('auto-fold browser errors', errors);
  throw error;
} finally { await browser.close(); }
