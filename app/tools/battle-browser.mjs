#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const OUT = process.env.BATTLE_AUDIT_OUT || '../docs/audits/2026-11-15-systematic-egm/battle-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const eventId = `battle-browser-${Date.now().toString(36)}`;
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
const config = { id: eventId, name: 'Browser Battle', capacity: 2, finalSeats: 2, startingChips: 1000, entry: 1000, rushMinutes: 10, tableSize: 2, smallBlind: 10, bigBlind: 20, rushStartLevel: 1, shootoutStartLevel: 1, finalStartLevel: 1, prizeShares: [50, 50], bountyItems: [{ id: 'b1', amount: 500, frequencyUnits: 1 }] };
const admin = await json('/api/auth/login', { login: 'admin', password: 'admin123' });
await json('/api/admin/battle', { operationId: `create-${eventId}`, config }, admin.token);
const players = [];
for (const [index, width] of [390, 1440].entries()) {
  const account = await json('/api/auth/register', { login: `br${Date.now().toString(36)}${index}`, nick: `BR${Date.now().toString(36)}${index}`, password: 'secret12' });
  players.push({ ...account, width });
}
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const pages = [];
const errors = [];
try {
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
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${BASE}/#/battle`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.battle-card', { visible: true, timeout: 15000 });
    await page.click('.battle-card');
    await page.waitForSelector('.battle-actions button', { visible: true, timeout: 15000 });
    if (index) await page.reload({ waitUntil: 'domcontentloaded' });
    await until(page, () => [...document.querySelectorAll('.battle-actions button')].some((button) => button.textContent.startsWith('Register')));
    await page.evaluate(() => [...document.querySelectorAll('.battle-actions button')].find((button) => button.textContent.startsWith('Register'))?.click());
    if (!index) await until(page, () => document.body.innerText.includes('Cancel registration'));
    else await until(page, () => document.body.innerText.includes('The final table is active'));
    pages.push(page);
  }
  await Promise.all(pages.map((page, index) => page.screenshot({ path: path.join(OUT, `event-${players[index].width}.png`), fullPage: true })));

  let keyboardAction = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await Promise.all(pages.map((page) => page.evaluate(() => document.body.innerText.includes('Final results')))).then((values) => values.every(Boolean))) break;
    let acted = false;
    for (const page of pages) {
      const button = await page.$('[data-battle-action="allin"]:not([disabled])');
      if (!button) continue;
      if (!keyboardAction) {
        await button.focus();
        await page.keyboard.press('Enter');
        keyboardAction = true;
      } else await button.click();
      acted = true;
      break;
    }
    if (!acted) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await Promise.all(pages.map((page) => until(page, () => document.body.innerText.includes('Final results'))));
  await Promise.all(pages.map((page) => page.screenshot({ path: path.join(OUT, 'results-1440.png'), fullPage: true })));
  const geometry = [];
  for (const [index, page] of pages.entries()) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 900 });
      await until(page, () => !!document.querySelector('.battle-results'));
      geometry.push(await page.evaluate(({ width, player }) => ({
        width, player, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        results: document.body.innerText.includes('Final results'), bounty: document.body.innerText.includes('1 awarded'),
        buttons: [...document.querySelectorAll('.battle-event button')].filter((button) => button.getBoundingClientRect().width > 0).map((button) => ({ text: button.textContent.trim(), height: button.getBoundingClientRect().height })),
      }), { width, player: index }));
      if (index === 0) await page.screenshot({ path: path.join(OUT, `results-${width}.png`), fullPage: true });
    }
  }
  const result = { completed: true, eventId, keyboardAction, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (!keyboardAction || errors.length || geometry.some((row) => row.overflowX > 1 || !row.results || !row.bounty || row.buttons.some((button) => button.height < 43.5))) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} catch (error) {
  for (const [index, page] of pages.entries()) console.log('page', index, await page.evaluate(() => document.body.innerText.slice(0, 2200)));
  throw error;
} finally {
  await browser.close();
}
