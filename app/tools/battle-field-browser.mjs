#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const DB_PATH = process.env.BATTLE_AUDIT_DB;
if (!DB_PATH) throw new Error('BATTLE_AUDIT_DB must select the disposable audit database');
const OUT = process.env.BATTLE_AUDIT_OUT || '../docs/audits/2026-11-15-systematic-egm/battle-field-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const eventId = `battle-field-${Date.now().toString(36)}`;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(route, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${BASE}${route}`, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const config = { id: eventId, name: 'Eighteen Player Battle', capacity: 18, finalSeats: 6, startingChips: 1000, entry: 1000, rushMinutes: 10, tableSize: 6, smallBlind: 10, bigBlind: 20, rushStartLevel: 1, shootoutStartLevel: 1, finalStartLevel: 1, prizeShares: [30, 22, 18, 12, 10, 8], bountyItems: [{ id: 'b1', amount: 100, frequencyUnits: 18 }] };
const admin = await request('/api/auth/login', { method: 'POST', body: { login: 'admin', password: 'admin123' } });
await request('/api/admin/battle', { method: 'POST', token: admin.token, body: { operationId: `create-${eventId}`, config } });
const players = [];
for (let index = 0; index < 18; index++) {
  const account = await request('/api/auth/register', { method: 'POST', body: { login: `bf${Date.now().toString(36)}${index}`, nick: `F${eventId.slice(-5)}-${index + 1}`, password: 'secret12' } });
  players.push({ ...account.user, token: account.token });
  await request(`/api/battle/${eventId}/register`, { method: 'POST', token: account.token, body: { eventId, expectedRevision: index + 1, operationId: `register-${eventId}-${index}` } });
}
const state = async (viewer = players[0]) => (await request(`/api/battle/${eventId}`, { token: viewer.token })).state;
let sequence = 0;
async function act(room, action) {
  const actor = players.find((player) => player.id === room.table.actor);
  if (!actor) throw new Error('No actor for Battle action');
  await request(`/api/battle/${eventId}/action`, { method: 'POST', token: actor.token, body: { eventId, stage: room.stage, roomId: room.roomId, handId: room.table.handId, expectedRevision: room.revision, operationId: `field-${eventId}-${sequence++}`, action, amount: 0 } });
}
async function playRoom(roomId, preserve) {
  const initial = (await state()).rooms.find((room) => room.roomId === roomId);
  const handId = initial.table.handId;
  const allInIds = new Set(initial.table.players.filter((player) => !player.empty).slice(0, preserve).map((player) => player.id));
  for (let attempt = 0; attempt < 100; attempt++) {
    const current = await state();
    const room = current.rooms.find((entry) => entry.roomId === roomId);
    if (!room || room.table.handId !== handId || room.table.street === 'ended') return;
    if (room.table.actor) await act(room, allInIds.has(room.table.actor) ? 'allin' : 'fold');
    else await sleep();
  }
  throw new Error(`Hand did not settle in ${roomId}`);
}
async function waitFor(status) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const current = await state();
    if (current.status === status) return current;
    await sleep();
  }
  throw new Error(`Stage ${status} did not arrive`);
}

const rush = await waitFor('rush');
for (const room of rush.rooms) await playRoom(room.roomId, 2);
const database = new DatabaseSync(DB_PATH);
database.prepare("UPDATE battle_events SET deadline = datetime('now','-1 second') WHERE event_id = ?").run(eventId);
database.close();
const shootout = await waitFor('shootout');
if (shootout.playersRemaining !== 15) throw new Error(`Expected 15 Rush survivors, received ${shootout.playersRemaining}`);
let round = 1;
while ((await state()).status === 'shootout') {
  const current = await state();
  const room = current.rooms[0];
  if (!room?.table.actor) { await sleep(); continue; }
  for (const entry of current.rooms) await playRoom(entry.roomId, entry.table.players.filter((player) => !player.empty).length);
  round++;
  if (round > 12) throw new Error('Shootout did not terminate within the ten-round policy bound');
}
const final = await waitFor('final');
const finalRoom = final.rooms[0];
const finalists = finalRoom.table.players.filter((player) => !player.empty).map((player) => players.find((account) => account.id === player.id));
if (finalists.length !== 6) throw new Error(`Expected six finalists, received ${finalists.length}`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const pages = [];
const errors = [];
try {
  for (const [index, player] of finalists.entries()) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: [320, 390, 768, 1024, 1440, 390][index], height: 900 });
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('ggpoker.token', token);
      localStorage.setItem('ggpoker.welcomeSeen', '1');
      localStorage.setItem('ggpoker.animations', '0');
      sessionStorage.setItem('ggpoker.entered', '1');
    }, player.token);
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${BASE}/#/battle/${eventId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.battle-room', { visible: true, timeout: 15000 });
    const privacy = await page.evaluate(() => ({ own: document.querySelectorAll('.battle-player').length, hidden: document.body.innerText.includes('??') }));
    if (privacy.own !== 6 || !privacy.hidden) throw new Error(`Final privacy projection failed for player ${player.id}`);
    pages.push(page);
  }
  let keyboardAction = false;
  for (let attempt = 0; attempt < 160; attempt++) {
    const finished = await Promise.all(pages.map((page) => page.evaluate(() => document.body.innerText.includes('Final results'))));
    if (finished.every(Boolean)) break;
    let acted = false;
    for (const page of pages) {
      const button = await page.$('[data-battle-action="allin"]:not([disabled])');
      if (!button) continue;
      if (!keyboardAction) { await button.focus(); await page.keyboard.press('Enter'); keyboardAction = true; }
      else await button.click();
      acted = true;
      break;
    }
    if (!acted) await sleep(100);
  }
  for (const [index, page] of pages.entries()) {
    await page.waitForFunction(() => document.body.innerText.includes('Final results'), { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, `final-player-${index + 1}.png`), fullPage: true });
  }
  const resultState = await state();
  const startingWallet = players.reduce((sum, player) => sum + player.balance, 0);
  const balances = await Promise.all(players.map((player) => request('/api/me', { token: player.token }).then((result) => result.user.balance)));
  const geometry = await Promise.all(pages.map((page, index) => page.evaluate((index) => ({ player: index + 1, width: document.documentElement.clientWidth, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, results: document.body.innerText.includes('Final results') }), index)));
  const result = { completed: true, eventId, accounts: players.length, stages: ['rush', 'draining', 'shootout', 'final', 'finished'], shootoutRounds: round - 1, finalists: finalists.map((player) => player.id), keyboardAction, prizes: resultState.prizes, bounties: resultState.bounty.awards.length, walletTotal: balances.reduce((sum, balance) => sum + balance, 0), geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  const expectedWallet = startingWallet + resultState.bounty.awards.reduce((sum, award) => sum + award.amount, 0);
  if (resultState.prizes.length !== 6 || resultState.prizes.reduce((sum, prize) => sum + prize.amount, 0) !== 18000 || resultState.bounty.awards.length !== 17 || result.walletTotal !== expectedWallet || !keyboardAction || errors.length || geometry.some((row) => row.overflowX > 1 || !row.results)) throw new Error(JSON.stringify({ ...result, startingWallet, expectedWallet }));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
