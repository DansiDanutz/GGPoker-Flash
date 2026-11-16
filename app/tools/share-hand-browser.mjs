#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const DB_PATH = process.env.SHARE_AUDIT_DB;
if (!DB_PATH) throw new Error('SHARE_AUDIT_DB must select the disposable audit database');
const OUT = process.env.SHARE_AUDIT_OUT || '../docs/audits/2026-11-15-systematic-egm/share-hand-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });
async function request(route, body, token) {
  const response = await fetch(`${BASE}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const suffix = Date.now().toString(36);
const account = await request('/api/auth/register', { login: `sh${suffix}`, nick: `Share${suffix}`, password: 'secret12' });
const other = await request('/api/auth/register', { login: `so${suffix}`, nick: `Other${suffix}`, password: 'secret12' });
const handId = `browser-share-${suffix}`;
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA busy_timeout = 5000');
const rowPlayers = [
  { id: account.user.id, nick: account.user.nick, seat: 0, inHand: true, folded: true, stackBefore: 1000, stack: 900, contribution: 100, grossContribution: 100, award: 0, win: 0, totalBet: 100, cards: ['7s', '2d'], showed: true, shownIndices: [0] },
  { id: other.user.id, nick: other.user.nick, seat: 1, inHand: true, folded: false, stackBefore: 1000, stack: 1100, contribution: 100, grossContribution: 100, award: 200, win: 200, totalBet: 100, cards: ['Ac', 'Ad'], showed: true, shownIndices: [0, 1] },
];
db.prepare(`INSERT INTO hands (hand_id,hand_no,table_id,table_name,game,players,board,pot,result,hero_cards,actions,meta,created_at)
  VALUES (?,7,'browser-table','Browser Table','holdem',?,'As Kd 2c',200,?,'7s 2d',?,'{"button":0}',datetime('now'))`).run(handId, JSON.stringify(rowPlayers), JSON.stringify({ reason: 'showdown', winners: [{ id: other.user.id, nick: other.user.nick, seat: 1, amount: 200, cards: ['Ac', 'Ad'] }], hands: [{ seat: 0, nick: account.user.nick, cards: ['7s', '2d'] }, { seat: 1, nick: other.user.nick, cards: ['Ac', 'Ad'] }] }), JSON.stringify([{ street: 'river', seat: 1, nick: other.user.nick, action: 'raise', amount: 100 }]));
db.close();

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const errors = [];
const geometry = [];
try {
  const participantContext = await browser.createBrowserContext();
  const participant = await participantContext.newPage();
  await participant.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await participant.evaluateOnNewDocument((token) => {
    localStorage.setItem('ggpoker.token', token);
    localStorage.setItem('ggpoker.welcomeSeen', '1');
    localStorage.setItem('ggpoker.animations', '0');
    sessionStorage.setItem('ggpoker.entered', '1');
  }, account.token);
  participant.on('pageerror', (error) => errors.push(String(error)));
  await participant.goto(`${BASE}/#/hand-history`, { waitUntil: 'domcontentloaded' });
  await participant.waitForSelector('tr[role="button"]', { visible: true });
  await participant.evaluate(() => [...document.querySelectorAll('tr[role="button"]')].find((row) => row.cells[0]?.textContent === '7')?.click());
  await participant.waitForSelector('[data-share-action="create"]', { visible: true });
  await participant.click('[data-share-action="create"]');
  await participant.waitForFunction(() => [...document.querySelectorAll('a')].some((link) => link.textContent === 'Open shared hand'));
  const href = await participant.evaluate(() => [...document.querySelectorAll('a')].find((link) => link.textContent === 'Open shared hand').getAttribute('href'));
  const publicContext = await browser.createBrowserContext();
  const publicPage = await publicContext.newPage();
  await publicPage.evaluateOnNewDocument(() => {
    localStorage.setItem('ggpoker.welcomeSeen', '1');
    localStorage.setItem('ggpoker.animations', '0');
    sessionStorage.setItem('ggpoker.entered', '1');
  });
  publicPage.on('pageerror', (error) => errors.push(String(error)));
  publicPage.on('console', (message) => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text()); });
  publicPage.on('response', (response) => { if (response.status() >= 500) errors.push(`${response.url()} ${response.status()}`); });
  await publicPage.bringToFront();
  await publicPage.goto(`${BASE}/${href}`, { waitUntil: 'domcontentloaded' });
  try { await publicPage.waitForSelector('.shared-hand-players', { visible: true }); }
  catch (error) { console.log('shared page failure', errors, await publicPage.evaluate(() => ({ text: document.body.innerText, hash: location.hash }))); throw error; }
  const publicCards = await publicPage.evaluate(() => [...document.querySelectorAll('.shared-hand-players article')].map((article) => [...article.querySelectorAll('.shared-hand-cards [aria-label]')].map((card) => card.getAttribute('aria-label'))));
  if (JSON.stringify(publicCards) !== JSON.stringify([['7 of ♠'], ['A of ♣', 'A of ♦']])) throw new Error(`Public card projection is incorrect: ${JSON.stringify(publicCards)}`);

  const cdp = await publicPage.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(OUT) });
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: path.resolve(OUT) });
  cdp.on('Page.downloadWillBegin', (event) => console.log('shared PNG download', event.suggestedFilename));
  const beforeDownload = new Set(fs.readdirSync(OUT));
  await publicPage.click('.shared-hand-title button');
  let downloaded;
  for (let attempt = 0; attempt < 100; attempt++) {
    downloaded = fs.readdirSync(OUT).find((file) => !beforeDownload.has(file) && file.endsWith('.png'));
    if (downloaded) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!downloaded) throw new Error(`Shared-hand PNG was not downloaded: ${await publicPage.evaluate(() => document.body.innerText)} ${JSON.stringify(errors)}`);

  for (const width of [320, 390, 768, 1024, 1440]) {
    await publicPage.setViewport({ width, height: width < 600 ? 844 : 900 });
    await publicPage.waitForSelector('.shared-hand-players');
    geometry.push(await publicPage.evaluate((width) => ({ width, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }), width));
    await publicPage.screenshot({ path: path.join(OUT, `public-${width}.png`), fullPage: true });
  }
  await publicPage.setViewport({ width: 390, height: 844 });
  const reflow = await publicPage.evaluate(() => { document.body.style.zoom = '2'; const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth; document.body.style.zoom = ''; return overflow; });
  if (reflow > 1) throw new Error(`200% reflow overflow: ${reflow}`);

  await participant.click('[data-share-action="revoke"]');
  await participant.waitForSelector('[data-share-action="create"]', { visible: true });
  await publicPage.reload({ waitUntil: 'domcontentloaded' });
  await publicPage.waitForFunction(() => document.body.innerText.includes('Shared hand unavailable'));

  await participant.click('[data-share-action="create"]');
  await participant.waitForFunction(() => [...document.querySelectorAll('a')].some((link) => link.textContent === 'Open shared hand'));
  await participant.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Hide hand')?.click());
  await publicPage.reload({ waitUntil: 'domcontentloaded' });
  await publicPage.waitForFunction(() => document.body.innerText.includes('Shared hand unavailable'));

  const result = { completed: true, handId, publicValid: true, revoked: true, hidden: true, downloaded, reflowOverflow: reflow, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (errors.length || geometry.some((row) => row.overflowX > 1)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
