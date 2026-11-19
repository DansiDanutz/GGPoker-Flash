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
let viewports = [[390, 844], [320, 700]];
const phone = process.env.PHONE_DEVICE_SERIAL;
const phonePorts = [new URL(sandbox.url).port,new URL(sandbox.api).port];

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

async function drag(x1, y1, x2, y2) {
  if (phone) {
    const session = await page.createCDPSession();
    await session.send('Input.dispatchTouchEvent', {type:'touchStart', touchPoints:[{x:x1,y:y1}]});
    for (let step=1;step<=8;step++) {
      await session.send('Input.dispatchTouchEvent', {type:'touchMove', touchPoints:[{x:x1+(x2-x1)*step/8,y:y1+(y2-y1)*step/8}]});
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    await session.send('Input.dispatchTouchEvent', {type:'touchEnd', touchPoints:[]});
    await session.detach();
  } else {
    await page.mouse.move(x1,y1); await page.mouse.down();
    await page.mouse.move(x2,y2,{steps:8}); await page.mouse.up();
  }
}

async function driveBrowserHeroToFlop(clients, tableId, untilReveal = false) {
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
      if (untilReveal && await page.$('.cardSqueeze')) return;
      const ready = await page.evaluate(() => document.querySelectorAll('.board > .pcard').length >= 3
        && Boolean(document.querySelector('.action-bar .act-btn:not(:disabled)')));
      if (ready && !untilReveal) return;
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
  if (!phone) await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForSelector('.table-screen .table-stage.stage-portrait', { visible: true });
  await page.waitForFunction((expectedWidth) => {
    const screen = document.querySelector('.table-screen')?.getBoundingClientRect();
    const stage = document.querySelector('.table-stage.stage-portrait')?.getBoundingClientRect();
    return innerWidth === expectedWidth && Math.abs((screen?.width ?? 0) - expectedWidth) < 1 && Math.abs((stage?.width ?? 0) - expectedWidth) < 1;
  }, {}, width);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => document.querySelectorAll('.table-stage .seat:not(.seat-take)').length >= 6 && document.querySelectorAll('.board > .pcard').length >= 3 && document.querySelector('.seat.me'));
  await page.waitForFunction(() => [...document.querySelectorAll('.board > .pcard')].every((card) => {
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    return rect.width > 0 && rect.height > 0 && Number(style.opacity) >= 0.95 && style.visibility !== 'hidden';
  }));
  // Wait for entry motion, not ongoing countdown transitions elsewhere on the table.
  await page.waitForFunction(() => document.getAnimations().filter(animation =>
    animation.effect?.target?.matches?.('.board > .pcard, .main-actions, .quick-bets, .reserved-actions')
  ).every((animation) => {
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
      heroCardLeft: Math.min(...[...document.querySelectorAll('.seat.me .pcard')].map(n => n.getBoundingClientRect().left)),
      timerMasks: [...document.querySelectorAll('.seat.active .timer')].filter(visible).map((node) => getComputedStyle(node).maskImage),
      clipped: [...outside('.table-stage .seat:not(.seat-take)'), ...outside('.table-stage .seat .cards .pcard'), ...outside('.action-bar button')],
    };
  });
  assert.ok(await page.$$eval('.seat .plate', nodes => nodes.every(n => {
    const style = getComputedStyle(n);
    return style.backgroundColor !== 'rgba(0, 0, 0, 0)' && Number(style.opacity) === 1;
  })), 'Identity plates have solid readable backing');
  assert.equal(await page.$eval('.main-actions', n => getComputedStyle(n, '::after').display), 'none', 'Slider has no decorative backing panel');
  assert.ok(await page.$$eval('.table-topbar, .action-bar', nodes => nodes.every(n => getComputedStyle(n).backdropFilter === 'none')), 'Header and footer have no rectangular blur panels');
  if (width === viewports[0][0] && !await page.$('.tchat-dock.betting-active')) {
  assert.ok(await page.$eval('.tchat-swipe-handle', n => {
    const r = n.getBoundingClientRect();
    return r.height <= 28 && r.bottom >= innerHeight - 2;
  }), 'Closed chat is a small bottom-edge handle, not a panel over the hero');
  const stageBeforeDrawer = await page.$eval('.table-stage', n => n.getBoundingClientRect().top);
  if (await page.$eval('.tchat-swipe-handle', n => n.getAttribute('aria-expanded')) !== 'true') {
    const box=await (await page.$('.tchat-swipe-handle')).boundingBox();
    await drag(box.x+box.width/2,box.y+box.height/2,box.x+box.width/2,box.y-55);
  }
  await page.waitForSelector('.tchat-dock.tools-open .tchat-buttons', {visible:true});
  await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.querySelector('.action-bar')).bottom) - 132) < .1);
  await page.waitForFunction(() => document.querySelector('.tchat-dock').getBoundingClientRect().bottom >= innerHeight - 10);
  assert.ok(await page.$eval('.table-stage', n => n.getBoundingClientRect().top) < stageBeforeDrawer - 50, 'Opening the footer raises the table');
  assert.equal(await page.$eval('.tchat-buttons', n => n.querySelectorAll('button').length), 3);
  assert.equal(await page.evaluate(() => {
    const dock=document.querySelector('.tchat-dock').getBoundingClientRect();
    return [...document.querySelectorAll('.action-bar button')].every(n=>{const r=n.getBoundingClientRect();return !r.width || dock.bottom<=r.top || dock.top>=r.bottom || dock.right<=r.left || dock.left>=r.right;});
  }),true,'Expanded chat must not cover betting buttons');
  await page.click('[aria-label="Emoticons"]');
  assert.ok(await page.$eval('.reaction-picker',n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),'Reaction picker must stay inside viewport');
  await page.screenshot({path:path.join(artifacts, `${kind}-emoticons-${width}.png`)});
  const handle = await (await page.$('.tchat-swipe-handle')).boundingBox();
  await drag(handle.x+handle.width/2,handle.y+handle.height/2,handle.x+handle.width/2,handle.y+handle.height+50);
  assert.equal(await page.$eval('.tchat-swipe-handle', n => n.getAttribute('aria-expanded')), 'false');
  assert.equal(await page.$('.reaction-picker'), null, 'Closing the drawer also closes emoticons');
  await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.querySelector('.action-bar')).bottom)) < .1);
  // Horizontal drags must not accidentally toggle the drawer.
  const closedHandle = await (await page.$('.tchat-swipe-handle')).boundingBox();
  await drag(closedHandle.x+20,closedHandle.y+closedHandle.height/2,closedHandle.x+120,closedHandle.y+closedHandle.height/2);
  assert.equal(await page.$eval('.tchat-swipe-handle', n => n.getAttribute('aria-expanded')), 'false');
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('openpoker.squeeze3d:')) localStorage.setItem(key, '0'); });
  assert.equal(await page.$('.cardSqueeze'), null, 'Reveal stays disabled during geometry checks');
  assert.equal(await page.$eval('.reveal-toggle', n => n.getAttribute('aria-pressed')), 'false');
  }
  if (await page.$('.tchat-dock.betting-active')) {
    assert.equal(await page.$eval('.tchat-dock', n=>getComputedStyle(n).visibility), 'hidden', 'Betting replaces the table tools during our turn');
    await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.querySelector('.action-bar')).bottom))<1);
  }
  await page.screenshot({ path: path.join(artifacts, `${kind}-${width}x${height}.png`) });
  assert.equal(layout.documentWidth <= width + 1, true, `${kind} document overflows at ${width}px.`);
  assert.equal(layout.seats, 6, `${kind} does not show six populated seats.`);
  assert.ok(layout.board >= 3, `${kind} has not reached a populated flop.`);
  assert.ok(layout.heroCardLeft >= 4, `${kind}: hero cards need a visible inset at ${width}px (got ${layout.heroCardLeft})`);
  assert.ok(layout.cards >= 2, `${kind} does not render the authenticated player's dealt hand.`);
  assert.ok(layout.actions >= 3, `${kind} does not show the seated hero action row.`);
  assert.ok(layout.timerMasks.length > 0, `${kind} has no visible countdown.`);
  assert.ok(layout.timerMasks.every((mask) => mask === 'none'), `${kind} countdown is clipped by a circular mask.`);
  assert.deepEqual(layout.clipped, [], `${kind} clips seats/cards/actions at ${width}x${height}: ${JSON.stringify(layout.clipped)}`);
  return layout;
}

async function verifyAutomaticReveal(clients, tableId, kind) {
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const purchases = [];
  const watch = request => { if (request.method() === 'POST' && request.url().includes('/api/marketplace/')) purchases.push(request.url()); };
  page.on('request', watch);
  await page.click('.reveal-toggle');
  assert.equal(await page.$eval('.reveal-toggle', n => n.getAttribute('aria-pressed')), 'true');
  await driveBrowserHeroToFlop(clients, tableId, true);
  await page.waitForSelector('.cardSqueeze[aria-busy="false"]');
  assert.equal(await page.$eval('.cardSqueeze', n => n.dataset.renderer), 'webgl');
  assert.equal(await page.$eval('.cardSqueeze > img', n => getComputedStyle(n).display), 'none');
  await page.screenshot({path:path.join(artifacts, `${kind}-automatic-reveal.png`)});
  await Promise.all([
    page.waitForSelector('.squeeze-particles'),
    phone ? page.$eval('.squeezeOpen', n => { const r=n.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; }).then(({x,y})=>page.touchscreen.tap(x,y)) : page.click('.squeezeOpen'),
  ]);
  await page.waitForSelector('.cardSqueeze', {hidden:true});
  assert.equal(await page.$('.squeeze-particles'), null);
  assert.equal(await page.$eval('.seat.me .cards', n => getComputedStyle(n).visibility), 'visible');
  await page.click('.reveal-toggle');
  assert.equal(await page.$eval('.reveal-toggle', n => n.getAttribute('aria-pressed')), 'false');
  await driveBrowserHeroToFlop(clients, tableId);
  assert.equal(await page.$('.cardSqueeze'), null);
  page.off('request', watch);
  assert.deepEqual(purchases, []);
  checks.push(`${kind}: fresh-hand automatic 3D reveal, particles, hand restoration and disable without purchases.`);
}

async function captureTournamentWaiting(width, height) {
  if (!phone) await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction((expectedWidth) => Math.abs((document.querySelector('.table-stage.stage-portrait')?.getBoundingClientRect().width ?? 0) - expectedWidth) < 1, {}, width);
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
  const admin = await api('/api/auth/login', { method: 'POST', body: { login: 'admin', password: sandbox.password } });
  const allowInspectionTime = async (id, seconds = 300) => {
    const { tables } = await api('/api/admin/tables', { token: admin.token });
    // Tournament rooms are in-memory; the admin clock update also reaches their live table.
    const table = tables.find(t => t.id === id) || { id, name: 'Reference tournament clock', game: 'holdem', seats: 6 };
    // Only the disposable fixture gets a long clock; production timeouts stay unchanged.
    await api('/api/admin/tables', { token: admin.token, method: 'POST', body: { ...table, action_seconds: seconds } });
  };
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
  await allowInspectionTime(cash.id);
  await heroReservation.opened;
  heroReservation.send({ type: 'join_table', tableId: cash.id, observe: true });
  await heroReservation.next((message) => message.type === 'joined' && message.tableId === cash.id);
  heroReservation.send({ type: 'reserve_seat', tableId: cash.id, seat: 0 });
  await heroReservation.next((message) => message.type === 'seat_reserved' && message.tableId === cash.id);
  const cashClients = await seatCash(players.slice(1), cash.id, 5000, 1);


  if (phone) for (const port of phonePorts) execFileSync('adb',['-s',phone,'reverse',`tcp:${port}`,`tcp:${port}`]);
  browser = phone ? await puppeteer.connect({browserURL:'http://127.0.0.1:9223',defaultViewport:null}) : await puppeteer.launch({
    executablePath: chromePath(), headless: true, pipe: true,
    userDataDir: path.join(sandbox.directory, 'reference-browser'),
    args: ['--disable-dev-shm-usage', '--no-first-run', ...(process.env.CI ? ['--no-sandbox'] : [])],
  });
  page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: phone ? 'no-preference' : 'reduce' }]);
  await page.evaluateOnNewDocument((token, userId) => {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    sessionStorage.setItem('ggpoker.entered', '1');
    localStorage.setItem('ggpoker.welcomeSeen', '1');
    localStorage.setItem('ggpoker.squeeze', '0');
    localStorage.setItem('openpoker.revealAnimation', '0');
    localStorage.setItem(`openpoker.squeeze3d:${userId}`, '1');
    localStorage.setItem('ggpoker.token', token);
  }, players[0].token, players[0].user.id);

  const layouts = {};
  if (!phone) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${sandbox.url}/#/table/${encodeURIComponent(cash.id)}?buyin=5000&seat=0`, { waitUntil: 'domcontentloaded' });
  if (phone) viewports = [await page.evaluate(() => [innerWidth, innerHeight])];
  await page.waitForSelector('.seat.me', { visible: true });
  await page.waitForSelector('.ls-content:not([inert])');
  await driveBrowserHeroToFlop(cashClients, cash.id);
  for (const [width, height] of viewports) {
    layouts[`cash-${width}`] = await capture('cash', width, height);
  }
  await verifyAutomaticReveal(cashClients, cash.id, 'cash');
  if (!phone) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction(width => Math.abs(document.querySelector('.table-stage').getBoundingClientRect().width - width) < 1, {}, viewports[0][0]);
  await allowInspectionTime(cash.id, 10);
  await page.click('.action-bar .act-check:not(:disabled)');
  await page.waitForSelector('.action-bar .act-check:not(:disabled)', { hidden: true });
  await driveBrowserHeroToFlop(cashClients, cash.id);
  await page.waitForSelector('.action-bar.sitting-out', { timeout: 15000 });
  assert.equal(await page.$('.cardSqueeze'), null, 'Timed-out player has no reveal overlay');
  assert.equal(await page.$('.reserved-actions'), null, 'A sitting-out player sees no queued betting controls');
  assert.ok(await page.$eval('.action-bar', n => n.getBoundingClientRect().height <= 100), 'Sit-out recovery remains a compact footer');
  await page.screenshot({ path: path.join(artifacts, 'cash-timeout.png') });
  checks.push('An actual disposable action timeout clears pre-actions.');

  const tournaments = await api('/api/tournaments');
  const freeroll = tournaments.tournaments.find((entry) => entry.buyin === 0);
  assert.ok(freeroll, 'The disposable sandbox has no freeroll tournament fixture.');
  const tournament = await prepareTournament(players[0], players.slice(1), freeroll.id);
  await allowInspectionTime(tournament.tableId);

  await page.goto(`${sandbox.url}/#/table/${encodeURIComponent(tournament.tableId)}`, { waitUntil: 'domcontentloaded' });
  // Hash navigation can retain the cash DOM until the tournament snapshot arrives.
  await page.waitForSelector('.table-screen.table-tournament');
  await page.waitForSelector('.seat.me', { visible: true });
  await driveBrowserHeroToFlop(tournament.clients, tournament.tableId);
  for (const [width, height] of viewports) {
    layouts[`tournament-${width}`] = await capture('tournament', width, height);
  }
  await verifyAutomaticReveal(tournament.clients, tournament.tableId, 'tournament');
  if (!phone) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction(() => Boolean(document.querySelector('.action-bar .act-check:not(:disabled)')));
  await page.click('.action-bar .act-check:not(:disabled)');
  for (const [width, height] of viewports) layouts[`tournament-waiting-${width}`] = await captureTournamentWaiting(width, height);
  assert.deepEqual(pageErrors, []);
  checks.push('Six real disposable players populated the cash and tournament tables.');
  checks.push(`Seats, dealt cards and visible actions fit at ${viewports.map(v => v.join('x')).join(' and ')} without page errors${phone ? ' on the physical phone without viewport emulation' : ''}.`);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ checks, page_errors: pageErrors, layouts }, null, 2));
  console.log(JSON.stringify({ ok: true, checks, artifacts }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => undefined);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ checks, page_errors: pageErrors, error: error.message }, null, 2));
  throw error;
} finally {
  if (phone) { await page?.close(); await browser?.disconnect(); for (const port of phonePorts) execFileSync('adb',['-s',phone,'reverse','--remove',`tcp:${port}`]); } else await browser?.close();
  await Promise.allSettled(sockets.map((client) => client.close()));
  await sandbox.close();
}
