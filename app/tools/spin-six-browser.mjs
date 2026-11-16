#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from '../server/test-helpers.js';

const OUT = process.env.SPIN_SIX_AUDIT_OUT || '../docs/audits/2026-11-16-systematic-egm/spin-six-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-spin-six-browser-'));
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(page, predicate, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await sleep(100);
  }
  throw new Error(`DOM condition timeout: ${await page.evaluate(() => document.body.innerText.slice(0, 1400))}`);
}
async function call(server, method, route, { token, body } = {}) {
  const response = await server[method](route, { token, body });
  if (response.status >= 400) throw new Error(`${route}: ${response.status} ${JSON.stringify(response.data)}`);
  return response.data;
}
const config = {
  mode: 'local-practice', seats: 6, buyIn: 5000, smallBlinds: [10, 20, 40],
  clock: { actionSeconds: 15, freeTimeChipSecondsPerUnit: 10, maxTimeChipsPerAction: 3 },
  outcomes: [{ multiplier: 4, frequency: 100000000, prizeShares: [100], startingChips: 500, timeBankCards: 3, noDealing: false, unit: 'minutes', interval: 1 }],
};
let server = await startServer({ dataDir });
const makeVite = (target, port = 0) => createServer({
  root: process.cwd(), configFile: false, plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify('audit'), __APP_BUILD__: JSON.stringify('spin-six'), __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()) },
  server: { host: '127.0.0.1', port, proxy: { '/api': { target, changeOrigin: true, headers: { Origin: target } }, '/ws': { target: target.replace('http:', 'ws:'), ws: true, changeOrigin: true, headers: { Origin: target } } } },
});
let vite = await makeVite(server.base);
await vite.listen();
const vitePort = vite.httpServer.address().port;
const base = `http://127.0.0.1:${vitePort}`;
const players = [];
const pages = [];
const errors = [];
let browser;
let eventId;
try {
  const adminToken = await server.login('admin', 'admin123');
  await call(server, 'put', '/api/admin/spin/rules', { token: adminToken, body: { mode: '6max', stake: 5000, expectedRevision: 0, operationId: `six-rules-${run}`, config, insurance: { premium: 100, payout: 1000 } } });
  for (const scope of ['spin6:5000', 'spin6-insurance:5000']) await call(server, 'post', `/api/admin/house/${scope}/fund`, { token: adminToken, body: { amount: 200000000, reason: 'Six-browser audit', operationId: `six-fund-${scope}-${run}` } });
  const widths = [320, 390, 768, 1024, 1440, 390];
  for (const [index, width] of widths.entries()) {
    const account = await call(server, 'post', '/api/auth/register', { body: { login: `sixb${run}${index}`, nick: `Six${index + 1}`, password: 'secret12' } });
    players.push({ ...account, width });
  }
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  for (const [index, player] of players.entries()) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: player.width, height: index === 2 ? 1024 : 900, isMobile: player.width < 768, hasTouch: player.width < 768 });
    if (index === 4) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('ggpoker.token', token);
      localStorage.setItem('ggpoker.welcomeSeen', '1');
      localStorage.setItem('ggpoker.animations', '0');
      sessionStorage.setItem('ggpoker.entered', '1');
    }, player.token);
    page.on('pageerror', (error) => errors.push({ index, message: String(error) }));
    await page.goto(`${base}/#/?play=1&game=spin`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.spin-mode-choice', { visible: true, timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll('.spin-mode-choice button')].find((button) => button.textContent === '6-Max')?.click());
    await page.waitForSelector('.spin-register-button:not([disabled])', { visible: true, timeout: 20000 });
    pages.push(page);
  }
  for (const [index, page] of pages.entries()) {
    await page.bringToFront();
    if (index === 0) await page.click('.spin-insurance-choice input');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/spin/register') && response.status() === 200, { timeout: 20000 });
    await page.click('.spin-register-button');
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error(`Registration ${index}: ${response.status()} ${await response.text()}`);
    const payload = await response.json();
    eventId = payload.state.eventId || eventId;
  }
  for (const page of pages) {
    await page.bringToFront();
    if (await page.$('.spin-presentation')) continue;
    await until(page, () => [...document.querySelectorAll('.spin-active-row button')].some((button) => button.textContent === 'Open match'));
    await page.evaluate(() => [...document.querySelectorAll('.spin-active-row button')].find((button) => button.textContent === 'Open match')?.click());
    await page.waitForSelector('.spin-presentation', { visible: true, timeout: 20000 });
  }
  await until(pages[0], () => !!document.querySelector('.spin-presentation'));
  const committedMultiplier = await pages[0].$eval('[data-testid="spin-wheel"]', (element) => element.dataset.multiplier);
  await vite.close();
  await server.stop();
  server = await startServer({ dataDir });
  vite = await makeVite(server.base, vitePort);
  await vite.listen();
  for (const [index, page] of pages.entries()) {
    await page.bringToFront();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.spin-presentation', { visible: true, timeout: 25000 });
    if (await page.$eval('[data-testid="spin-wheel"]', (element) => element.dataset.multiplier) !== committedMultiplier) throw new Error('Restart changed the committed multiplier');
    await page.screenshot({ path: path.join(OUT, `wheel-${players[index].width}${index === 5 ? '-second' : ''}.png`) });
  }
  const modalFocusContained = await pages[0].evaluate(() => document.querySelector('.spin-presentation')?.contains(document.activeElement));
  const isolationDb = new DatabaseSync(path.join(dataDir, 'ggpoker.db'), { readOnly: true });
  const actionsBefore = isolationDb.prepare("SELECT json_array_length(json_extract(state_json,'$.properties.log')) AS count FROM game_checkpoints WHERE room_id = ? AND kind = 'spin' AND status = 'active'").get(`spin:${eventId}`)?.count;
  await pages[0].keyboard.press('F1');
  const actionsAfter = isolationDb.prepare("SELECT json_array_length(json_extract(state_json,'$.properties.log')) AS count FROM game_checkpoints WHERE room_id = ? AND kind = 'spin' AND status = 'active'").get(`spin:${eventId}`)?.count;
  isolationDb.close();
  const hotkeysIsolated = modalFocusContained && actionsBefore === actionsAfter;
  if (!hotkeysIsolated) throw new Error(`Presentation isolation failed: ${JSON.stringify({ modalFocusContained, actionsBefore, actionsAfter })}`);
  const wheelAligned = await pages[0].evaluate(() => {
    const rotor = document.querySelector('.spin-wheel-rotor');
    const selected = document.querySelector('[data-testid="spin-wheel"]').dataset.multiplier;
    const segments = [...document.querySelectorAll('.spin-wheel-segment')];
    const index = segments.findIndex((segment) => segment.textContent === `${selected}x`);
    return (index * (360 / segments.length) + Number(rotor.dataset.rotation)) % 360 === 0;
  });
  if (!wheelAligned) throw new Error('Committed wheel result is not aligned to the pointer');
  const customSectorsMatch = await pages[0].evaluate(() => {
    const labels = document.querySelectorAll('.spin-wheel-segment').length;
    const background = getComputedStyle(document.querySelector('.spin-wheel')).backgroundImage;
    return labels === 1 && !background.includes('45deg');
  });
  if (!customSectorsMatch) throw new Error('Custom wheel sector count does not match its labels');
  await Promise.all(pages.map(async (page, index) => {
    await until(page, () => [...document.querySelectorAll('.spin-presentation-actions button')].some((button) => button.textContent === 'Confirm result' && !button.disabled), 15000);
    await page.evaluate(() => [...document.querySelectorAll('.spin-presentation-actions button')].find((button) => button.textContent === 'Confirm result')?.click());
    if (index === 0) {
      await page.waitForSelector('.spin-insurance-panel', { visible: true, timeout: 15000 });
      if (!await page.evaluate(() => document.body.innerText.includes('insured x4'))) throw new Error('6-Max insurance did not settle on x4');
      await page.evaluate(() => [...document.querySelectorAll('.spin-presentation-actions button')].find((button) => button.textContent === 'Continue')?.click());
    }
    await until(page, () => document.body.innerText.includes('Join the other 5 players'));
  }));
  await Promise.all(pages.map(async (page) => {
    await page.evaluate(() => [...document.querySelectorAll('.spin-presentation-actions button')].find((button) => button.textContent === 'Ready to play')?.click());
    await until(page, () => !document.querySelector('.spin-presentation'));
  }));
  if (await Promise.all(pages.map((page) => page.$('.spin-presentation-error'))).then((values) => values.some(Boolean))) throw new Error('Concurrent presentation produced an acknowledgement error');
  for (const [index, page] of pages.entries()) {
    await page.bringToFront();
    await until(page, () => document.body.innerText.includes('PRE-FLOP'));
    await page.screenshot({ path: path.join(OUT, `hand-${players[index].width}${index === 5 ? '-second' : ''}.png`) });
  }
  let settled = false;
  for (let iteration = 0; iteration < 140 && !settled; iteration++) {
    for (const page of pages) {
      await page.bringToFront();
      await page.keyboard.press('F4');
      await page.keyboard.press('Enter');
    }
    await sleep(120);
    const db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'), { readOnly: true });
    settled = db.prepare('SELECT status FROM spin_events WHERE event_id = ?').get(eventId)?.status === 'finished';
    db.close();
  }
  if (!settled) throw new Error('Six-player game did not settle');
  const db = new DatabaseSync(path.join(dataDir, 'ggpoker.db'), { readOnly: true });
  const database = {
    entrants: db.prepare('SELECT COUNT(*) AS count FROM spin_event_entrants WHERE event_id = ?').get(eventId).count,
    settled: db.prepare("SELECT COUNT(*) AS count FROM spin_registrations WHERE event_id = ? AND status = 'settled'").get(eventId).count,
    payouts: db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE kind = 'spin_payout'").get().count,
    payoutTotal: db.prepare("SELECT COALESCE(SUM(amount),0) AS amount FROM transactions WHERE kind = 'spin_payout'").get().amount,
    insurance: db.prepare('SELECT payout FROM spin_insurance_settlements WHERE event_id = ?').all(eventId),
    reserved: db.prepare("SELECT COALESCE(SUM(amount),0) AS amount FROM house_reservations WHERE scope LIKE 'spin6%' AND status = 'active'").get().amount,
  };
  db.close();
  const geometry = [];
  for (const [index, page] of pages.entries()) {
    geometry.push(await page.evaluate((width) => ({
      width,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
      handVisible: !!document.querySelector('.table-screen'),
      url: location.hash,
    }), players[index].width));
  }
  const result = { completed: true, restartedDuringPresentation: true, wheelAligned, customSectorsMatch, modalFocusContained, hotkeysIsolated, concurrentAcknowledgements: true, eventId, committedMultiplier, players: players.map((player) => player.user.id), database, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (errors.length || database.entrants !== 6 || database.settled !== 6 || database.payouts !== 1 || database.payoutTotal !== 20000 || database.reserved !== 0 || database.insurance.some((row) => row.payout !== 1000) || geometry.some((row) => row.overflowX > 1 || row.bodyOverflowX > 1 || !row.handVisible)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} catch (error) {
  for (const [index, page] of pages.entries()) {
    try { await page.screenshot({ path: path.join(OUT, `failure-${index}.png`) }); } catch { }
  }
  throw error;
} finally {
  await Promise.race([
    Promise.allSettled([browser ? browser.close() : Promise.resolve(), vite.close(), server.stop()]),
    sleep(5000),
  ]);
}
