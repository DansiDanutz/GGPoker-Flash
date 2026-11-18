#!/usr/bin/env node
// Populated table reference capture. Always uses a disposable loopback sandbox.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import WebSocket from 'ws';
import { startSandbox } from './contributor-sandbox.mjs';

assert.equal(process.argv.length, 2, 'No URL or command-line arguments are accepted.');

const artifacts = path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/table-reference');
await mkdir(artifacts, { recursive: true });
await rm(path.join(artifacts, 'failure.png'), { force: true });

const sandbox = await startSandbox();
const sockets = [];
const pageErrors = [];
const checks = [];
let browser;
let page;

function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(mac)) return mac;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { /* try next */ }
  }
  throw new Error('Chrome/Chromium is required; set CHROME_PATH if needed.');
}

async function api(endpoint, { token, method = 'GET', body } = {}) {
  assert.ok(endpoint.startsWith('/api/'));
  const response = await fetch(sandbox.api + endpoint, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.ok(response.ok, `${method} ${endpoint}: ${response.status} ${result.error || ''}`);
  return result;
}

function openSocket(token) {
  const socket = new WebSocket(`${sandbox.api.replace('http:', 'ws:')}/ws?token=${encodeURIComponent(token)}`);
  const inbox = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    const index = waiters.findIndex(({ match }) => match(message));
    if (index >= 0) waiters.splice(index, 1)[0].resolve(message);
    else inbox.push(message);
  });
  const next = (match, timeout = 10000) => {
    const index = inbox.findIndex(match);
    if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for table socket state.')), timeout);
      waiters.push({ match, resolve: (message) => { clearTimeout(timer); resolve(message); } });
    });
  };
  const client = {
    socket,
    opened: new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); }),
    send: (message) => socket.send(JSON.stringify(message)),
    next,
    close: () => new Promise((resolve) => {
      if (socket.readyState >= WebSocket.CLOSING) return resolve();
      socket.once('close', resolve); socket.close();
    }),
  };
  sockets.push(client);
  return client;
}

async function seatCash(players, tableId, buyin, firstSeat = 0) {
  const clients = players.map((player) => openSocket(player.token));
  await Promise.all(clients.map((client) => client.opened));
  for (const client of clients) {
    client.send({ type: 'join_table', tableId, observe: true });
    await client.next((message) => message.type === 'joined' && message.tableId === tableId);
  }
  for (const [index, client] of clients.entries()) {
    const seat = firstSeat + index;
    client.send({ type: 'reserve_seat', tableId, seat });
    await client.next((message) => message.type === 'seat_reserved' && message.tableId === tableId);
  }
  for (const [index, client] of clients.entries()) {
    const seat = firstSeat + index;
    client.send({ type: 'join_table', tableId, buyin, seat });
    await client.next((message) => message.type === 'joined' && message.tableId === tableId && message.seat != null);
  }
  await clients[0].next((message) => message.type === 'state' && message.state?.players?.filter((player) => !player.empty).length >= players.length);
  return clients;
}

async function prepareTournament(hero, players, tournamentId) {
  const entries = [];
  for (const player of [hero, ...players]) {
    await api(`/api/tournaments/${tournamentId}/register`, { token: player.token, method: 'POST', body: {} });
    entries.push(await api(`/api/tournaments/${tournamentId}/play`, { token: player.token, method: 'POST', body: {} }));
  }
  const tableId = entries[0].tableId;
  assert.ok(tableId && entries.every((entry) => entry.tableId === tableId), 'Players were not assigned to one tournament table.');
  const clients = players.map((player) => openSocket(player.token));
  await Promise.all(clients.map((client) => client.opened));
  for (const client of clients) {
    client.send({ type: 'join_table', tableId });
    await client.next((message) => message.type === 'joined' && message.tableId === tableId && message.seat != null);
  }
  await clients[0].next((message) => message.type === 'state' && message.state?.players?.filter((player) => !player.empty).length >= players.length);
  return { tableId, clients };
}

async function driveBrowserHeroToFlop(clients, tableId) {
  const acted = new Set();
  const handlers = clients.map((client) => (raw) => {
    const message = JSON.parse(String(raw));
    const state = message.type === 'state' ? message.state : null;
    if (!state || state.id !== tableId) return;
    const me = state.players?.find((player) => player.isMe);
    if (!me || state.actor !== me.id) return;
    const key = `${state.handNo}:${state.turnNo}:${me.id}`;
    if (acted.has(key)) return;
    acted.add(key);
    client.send({ type: 'action', tableId, action: state.currentBet > (me.bet || 0) ? 'call' : 'check', amount: 0, handNo: state.handNo, turnNo: state.turnNo });
  });
  clients.forEach((client, index) => client.socket.on('message', handlers[index]));
  clients.forEach((client) => client.send({ type: 'join_table', tableId }));
  try {
    const end = Date.now() + 25000;
    while (Date.now() < end) {
      const ready = await page.evaluate(() => document.querySelectorAll('.board > .pcard').length >= 3
        && Boolean(document.querySelector('.action-bar .act-btn:not(:disabled)')));
      if (ready) return;
      const selector = await page.evaluate(() => {
        if (document.querySelector('.action-bar .act-check:not(:disabled)')) return '.action-bar .act-check:not(:disabled)';
        if (document.querySelector('.action-bar .act-call:not(:disabled)')) return '.action-bar .act-call:not(:disabled)';
        return '';
      });
      if (selector) await page.click(selector);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error(`Timed out driving ${tableId} to the browser hero's flop action.`);
  } finally {
    clients.forEach((client, index) => client.socket.off('message', handlers[index]));
  }
}

async function capture(kind, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForSelector('.table-screen .table-stage.stage-portrait', { visible: true });
  await page.waitForFunction((expectedWidth) => {
    const screen = document.querySelector('.table-screen')?.getBoundingClientRect();
    const stage = document.querySelector('.table-stage.stage-portrait')?.getBoundingClientRect();
    return innerWidth === expectedWidth && screen?.width === expectedWidth && stage?.width === expectedWidth;
  }, {}, width);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => document.querySelectorAll('.table-stage .seat:not(.seat-take)').length >= 6 && document.querySelectorAll('.board > .pcard').length >= 3 && document.querySelector('.seat.me'));
  await page.waitForFunction(() => [...document.querySelectorAll('.board > .pcard')].every((card) => {
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    return rect.width > 0 && rect.height > 0 && Number(style.opacity) >= 0.95 && style.visibility !== 'hidden';
  }));
  await page.waitForFunction(() => document.getAnimations().every((animation) => {
    const iterations = animation.effect?.getTiming().iterations;
    return iterations === Infinity || animation.playState === 'finished' || animation.playState === 'idle';
  }));
  await page.$$eval('.toast', (nodes) => nodes.forEach((node) => node.click()));
  await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0);
  const layout = await page.evaluate(() => {
    const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
    const outside = (selector) => [...document.querySelectorAll(selector)].filter(visible).map((node) => {
      const rect = node.getBoundingClientRect();
      return { selector, className: node.className, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }).filter((rect) => rect.left < -1 || rect.right > innerWidth + 1 || rect.top < -1 || rect.bottom > innerHeight + 1);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      seats: document.querySelectorAll('.table-stage .seat:not(.seat-take)').length,
      board: document.querySelectorAll('.board > .pcard').length,
      cards: document.querySelectorAll('.table-stage .seat .cards .pcard').length,
      actions: [...document.querySelectorAll('.action-bar button')].filter(visible).length,
      timerMasks: [...document.querySelectorAll('.seat.active .timer')].filter(visible).map((node) => getComputedStyle(node).maskImage),
      clipped: [...outside('.table-stage .seat:not(.seat-take)'), ...outside('.table-stage .seat .cards .pcard'), ...outside('.action-bar button')],
    };
  });
  await page.screenshot({ path: path.join(artifacts, `${kind}-${width}x${height}.png`) });
  assert.equal(layout.documentWidth <= width + 1, true, `${kind} document overflows at ${width}px.`);
  assert.equal(layout.seats, 6, `${kind} does not show six populated seats.`);
  assert.ok(layout.board >= 3, `${kind} has not reached a populated flop.`);
  assert.ok(layout.cards >= 2, `${kind} does not render the authenticated player's dealt hand.`);
  assert.ok(layout.actions >= 3, `${kind} does not show the seated hero action row.`);
  assert.ok(layout.timerMasks.length > 0, `${kind} has no visible countdown.`);
  assert.ok(layout.timerMasks.every((mask) => mask === 'none'), `${kind} countdown is clipped by a circular mask.`);
  assert.deepEqual(layout.clipped, [], `${kind} clips seats/cards/actions at ${width}x${height}: ${JSON.stringify(layout.clipped)}`);
  return layout;
}

async function captureTournamentWaiting(width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction((expectedWidth) => document.querySelector('.table-stage.stage-portrait')?.getBoundingClientRect().width === expectedWidth, {}, width);
  await page.waitForSelector('.tt-hud', { visible: true });
  const geometry = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const hud = rect('.tt-hud');
    const board = rect('.board');
    const actions = rect('.action-bar');
    const overlaps = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    return { hud: hud && { left: hud.left, right: hud.right, top: hud.top, bottom: hud.bottom }, boardOverlap: overlaps(hud, board), actionOverlap: overlaps(hud, actions) };
  });
  assert.ok(geometry.hud, 'Tournament waiting HUD is not visible.');
  assert.equal(geometry.boardOverlap, false, 'Tournament waiting HUD overlaps the board.');
  assert.equal(geometry.actionOverlap, false, 'Tournament waiting HUD overlaps the action controls.');
  await page.screenshot({ path: path.join(artifacts, `tournament-waiting-${width}x${height}.png`) });
  return geometry;
}

try {
  const players = [];
  for (let index = 0; index < 6; index += 1) {
    players.push(await api('/api/auth/register', {
      method: 'POST', body: { login: `ref${Date.now()}${index}`, nick: `Reference ${index + 1}`, password: 'reference-table-password' },
    }));
  }
  const cash = await api('/api/tables/host', {
    token: players[0].token, method: 'POST',
    body: { economy: 'play_money', name: 'Reference Cash 6', game: 'holdem', seats: 6, sb: 50, bb: 100, min_buyin: 5000, max_buyin: 5000 },
  });
  const heroReservation = openSocket(players[0].token);
  await heroReservation.opened;
  heroReservation.send({ type: 'join_table', tableId: cash.id, observe: true });
  await heroReservation.next((message) => message.type === 'joined' && message.tableId === cash.id);
  heroReservation.send({ type: 'reserve_seat', tableId: cash.id, seat: 0 });
  await heroReservation.next((message) => message.type === 'seat_reserved' && message.tableId === cash.id);
  const cashClients = await seatCash(players.slice(1), cash.id, 5000, 1);

  const tournaments = await api('/api/tournaments');
  const freeroll = tournaments.tournaments.find((entry) => entry.buyin === 0);
  assert.ok(freeroll, 'The disposable sandbox has no freeroll tournament fixture.');
  const tournament = await prepareTournament(players[0], players.slice(1), freeroll.id);

  browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, pipe: true,
    userDataDir: path.join(sandbox.directory, 'reference-browser'),
    args: ['--disable-dev-shm-usage', '--no-first-run'],
  });
  page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((token) => {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    sessionStorage.setItem('ggpoker.entered', '1');
    localStorage.setItem('ggpoker.welcomeSeen', '1');
    localStorage.setItem('ggpoker.token', token);
  }, players[0].token);

  const layouts = {};
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${sandbox.url}/#/table/${encodeURIComponent(cash.id)}?buyin=5000&seat=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.seat.me', { visible: true });
  await driveBrowserHeroToFlop(cashClients, cash.id);
  for (const [width, height] of [[390, 844], [320, 700]]) {
    layouts[`cash-${width}`] = await capture('cash', width, height);
  }

  await page.goto(`${sandbox.url}/#/table/${encodeURIComponent(tournament.tableId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.seat.me', { visible: true });
  await driveBrowserHeroToFlop(tournament.clients, tournament.tableId);
  for (const [width, height] of [[390, 844], [320, 700]]) {
    layouts[`tournament-${width}`] = await capture('tournament', width, height);
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction(() => Boolean(document.querySelector('.action-bar .act-check:not(:disabled)')));
  await page.click('.action-bar .act-check:not(:disabled)');
  layouts['tournament-waiting-390'] = await captureTournamentWaiting(390, 844);
  layouts['tournament-waiting-320'] = await captureTournamentWaiting(320, 700);
  assert.deepEqual(pageErrors, []);
  checks.push('Six real disposable players populated the cash and tournament tables.');
  checks.push('Seats, dealt cards and visible actions fit at 390x844 and 320x700 without page errors.');
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ checks, page_errors: pageErrors, layouts }, null, 2));
  console.log(JSON.stringify({ ok: true, checks, artifacts }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => undefined);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ checks, page_errors: pageErrors, error: error.message }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await Promise.allSettled(sockets.map((client) => client.close()));
  await sandbox.close();
}
