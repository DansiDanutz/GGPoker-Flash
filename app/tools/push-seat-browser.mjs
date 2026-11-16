#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { startServer, seatHumans } from '../server/test-helpers.js';

const OUT = process.env.PUSH_SEAT_AUDIT_OUT || '../docs/audits/2026-11-16-systematic-egm/push-seat-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tableId = 'nlh-silver-07';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const server = await startServer();
const vite = await createServer({ root: process.cwd(), configFile: false, plugins: [react()], define: { __APP_VERSION__: JSON.stringify('audit'), __APP_BUILD__: JSON.stringify('push-seat'), __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()) }, server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: server.base, changeOrigin: true, headers: { Origin: server.base } }, '/ws': { target: server.base.replace('http:', 'ws:'), ws: true, changeOrigin: true, headers: { Origin: server.base } } } } });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
const players = [];
const pages = [];
let browser;
let observer;
const errors = [];
try {
  const adminToken = await server.login('admin', 'admin123');
  for (const [index, name] of ['push_browser_a', 'push_browser_b'].entries()) {
    const response = await server.post('/api/auth/register', { body: { login: name, nick: `Push ${index + 1}`, password: 'secret12' } });
    if (response.status !== 200) throw new Error(JSON.stringify(response.data));
    players.push({ ...response.data, socket: server.socket(response.data.token) });
  }
  for (const player of players) await player.socket.opened;
  await seatHumans(players.map((player) => player.socket), tableId, 4000);
  for (const [index, player] of players.entries()) {
    const granted = await server.post(`/api/admin/rooms/${tableId}/push-seat-grant`, { token: adminToken, body: { accountId: player.user.id, uses: 1, expectedRevision: 0, operationId: `push-browser-grant-${index}` } });
    if (granted.status !== 200) throw new Error(JSON.stringify(granted.data));
  }
  observer = server.socket(players[0].token);
  await observer.opened;
  observer.send({ type: 'join_table', tableId, observe: true });
  let current;
  let movementState;
  observer.ws.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === 'state' && message.state.id === tableId) {
      current = message.state;
      if (current.pushSeat?.remaining === 0 && !movementState) movementState = structuredClone(current);
    }
  });
  for (let attempt = 0; attempt < 100 && !current?.pushSeat?.remaining; attempt++) await sleep(50);
  if (!current) throw new Error('No initial table state');
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  for (const [index, player] of players.entries()) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: index ? 390 : 320, height: 900, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument((token) => { localStorage.setItem('ggpoker.token', token); localStorage.setItem('ggpoker.welcomeSeen', '1'); localStorage.setItem('ggpoker.animations', '0'); sessionStorage.setItem('ggpoker.entered', '1'); }, player.token);
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(`${base}/#/table/${tableId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.table-screen', { visible: true, timeout: 20000 });
    pages.push(page);
  }
  const page = pages[0];
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Menu')?.click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.startsWith('Push Seat'))?.click());
  await page.waitForSelector('.push-seat-panel', { visible: true, timeout: 10000 });
  await page.keyboard.press('Tab');
  const focusedSeat = await page.evaluate(() => document.activeElement?.textContent);
  await sleep(500);
  const keyboardFocusStable = focusedSeat?.includes('Seat 2') && await page.evaluate(() => document.activeElement?.textContent.includes('Seat 2'));
  if (!keyboardFocusStable) throw new Error(`Dialog focus was not stable: ${focusedSeat}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.push-seat-panel'), { timeout: 5000 });
  const escapeClosed = true;
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Menu')?.click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.startsWith('Push Seat'))?.click());
  await page.waitForSelector('.push-seat-panel', { visible: true, timeout: 10000 });
  const handBeforeIsolation = current.handNo;
  await page.keyboard.press('F1');
  await sleep(150);
  const hotkeysIsolated = current.handNo === handBeforeIsolation && !current.pushSeat?.reservation;
  if (!hotkeysIsolated) throw new Error('Push Seat dialog leaked a table hotkey');
  const geometry = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900, isMobile: true, hasTouch: true });
    try {
      await page.waitForSelector('.push-seat-panel', { visible: true, timeout: 10000 });
    } catch (error) {
      throw new Error(`Push Seat panel lost at ${width}px: ${JSON.stringify({ pushSeat: current.pushSeat, me: current.players.find((player) => player?.isMe), body: await page.evaluate(() => document.body.innerText.slice(0, 500)) })}`);
    }
    geometry.push(await page.evaluate((width) => {
      const element = document.querySelector('.push-seat-panel');
      if (!element) return { width, missing: true, text: document.body.innerText.slice(0, 700) };
      const panel = element.getBoundingClientRect();
      return { width, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, viewportHeight: innerHeight };
    }, width));
    await page.screenshot({ path: path.join(OUT, `panel-${width}.png`) });
  }
  await page.setViewport({ width: 320, height: 900, isMobile: true, hasTouch: true });
  const before = structuredClone(current);
  await page.evaluate(() => [...document.querySelectorAll('.push-seat-grid button')].find((button) => button.textContent.includes('Seat 2'))?.click());
  let observedReservation = false;
  for (let attempt = 0; attempt < 100 && !observedReservation && !movementState; attempt++) {
    observedReservation = !!current.pushSeat?.reservation;
    await sleep(20);
  }
  observedReservation = observedReservation || !!current.pushSeat?.reservation;
  if (!observedReservation && !movementState) throw new Error('No server reservation after UI selection');
  if (!observedReservation) throw new Error('The intermediate reservation was not independently observed');
  for (let iteration = 0; iteration < 400 && !movementState; iteration++) {
    for (const activePage of pages) {
      await activePage.bringToFront();
      await activePage.keyboard.press('F1');
    }
    await sleep(120);
  }
  if (!movementState) throw new Error(`Move did not complete: ${JSON.stringify(current.pushSeat)}`);
  const beforePlayers = Object.fromEntries(before.players.filter((player) => players.some((account) => account.user.id === player?.id)).map((player) => [player.id, player]));
  const afterPlayers = Object.fromEntries(movementState.players.filter((player) => players.some((account) => account.user.id === player?.id)).map((player) => [player.id, player]));
  for (const [id, previous] of Object.entries(beforePlayers)) {
    if (!afterPlayers[id] || previous.seat === afterPlayers[id].seat || previous.stack !== afterPlayers[id].stack || previous.sessionId !== afterPlayers[id].sessionId) throw new Error(`Seat/session conservation failed for ${id}: ${JSON.stringify({ previous, after: afterPlayers[id] })}`);
  }
  await pages[0].bringToFront();
  await pages[0].screenshot({ path: path.join(OUT, 'moved-320.png') });
  const result = { completed: true, physicalSwap: true, reservationBeforeMove: observedReservation, keyboardFocusStable, escapeClosed, hotkeysIsolated, beforeSeats: Object.fromEntries(Object.entries(beforePlayers).map(([id, player]) => [id, player.seat])), afterSeats: Object.fromEntries(Object.entries(afterPlayers).map(([id, player]) => [id, player.seat])), remaining: movementState.pushSeat.remaining, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (errors.length || geometry.some((row) => row.missing || row.overflowX > 1 || row.left < 0 || row.right > row.width + 1 || row.top < 0 || row.bottom > row.viewportHeight + 1)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
  observer.ws.terminate();
} catch (error) {
  for (const [index, page] of pages.entries()) {
    try { await page.screenshot({ path: path.join(OUT, `failure-${index}.png`) }); } catch { }
  }
  throw error;
} finally {
  observer?.ws.terminate();
  for (const player of players) player.socket.ws.terminate();
  await Promise.race([
    Promise.allSettled([browser ? browser.close() : Promise.resolve(), vite.close(), server.stop()]),
    sleep(5000),
  ]);
}
