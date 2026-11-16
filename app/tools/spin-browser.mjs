#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:56199';
const OUT = process.env.SPIN_AUDIT_OUT || '../docs/audits/2026-11-15-systematic-egm/spin-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
fs.mkdirSync(OUT, { recursive: true });

async function until(page, predicate, { timeout = 20000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`DOM condition timeout after ${timeout}ms`);
}

async function json(route, body, token) {
  const response = await fetch(`${BASE}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

const admin = await json('/api/auth/login', { login: 'admin', password: 'admin123' });
const rulesResponse = await fetch(`${BASE}/api/admin/spin/rules?mode=3max&stake=5000`, { headers: { authorization: `Bearer ${admin.token}` } });
const rules = await rulesResponse.json();
if (!rulesResponse.ok) throw new Error(JSON.stringify(rules));
if (process.env.SPIN_ADMIN_UI === '1') {
  const adminBrowser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await adminBrowser.newPage();
    await page.setViewport({ width: 1024, height: 900 });
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('ggpoker.token', token);
      localStorage.setItem('ggpoker.welcomeSeen', '1');
      sessionStorage.setItem('ggpoker.entered', '1');
    }, admin.token);
    await page.goto(`${BASE}/#/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.admin-nav', { visible: true, timeout: 20000 });
    await page.evaluate(() => [...document.querySelectorAll('.admin-nav button')].find((button) => button.textContent.includes('Game settings'))?.click());
    await page.waitForSelector('#spin-startingChips', { visible: true, timeout: 20000 });
    for (const [id, value] of Object.entries({ startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3, premium: 100, payout: 1000 })) {
      await page.evaluate(({ id, value }) => {
        const input = document.getElementById(`spin-${id}`);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, { id, value });
    }
    await page.evaluate(() => {
      const section = document.getElementById('spin-rules-title').closest('section');
      const checkbox = section.querySelector('input[type=checkbox]');
      if (!checkbox.checked) checkbox.click();
    });
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save Spin rules')?.click());
    await until(page, () => document.body.innerText.includes('is active for new registrations'), { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT, 'admin-rules-1024.png') });
  } finally {
    await adminBrowser.close();
  }
} else {
  const savedRules = await fetch(`${BASE}/api/admin/spin/rules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({
      mode: '3max', stake: 5000, expectedRevision: rules.state.ruleRevision, operationId: `browser-rules-${run}`,
      config: { rows: rules.state.config.rows.map((row) => ({ ...row, startingChips: 500, timeBankCards: 3, actionSeconds: 15, secondsPerCard: 10, maxCardsPerAction: 3 })) },
      insurance: { premium: 100, payout: 1000 },
    }),
  });
  const savedRulesBody = await savedRules.json();
  if (!savedRules.ok) throw new Error(JSON.stringify(savedRulesBody));
}
for (const scope of ['spin3:5000', 'spin3-insurance:5000']) {
  await json(`/api/admin/house/${scope}/fund`, { amount: 200000000, reason: 'Spin browser audit', operationId: `browser-fund-${scope}-${run}` }, admin.token);
}
const players = [];
for (const [index, width] of [320, 390, 768].entries()) {
  const account = await json('/api/auth/register', { login: `sb${run}${index}`, nick: `S${run}${index}`, password: 'secret12' });
  players.push({ ...account, width });
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const pages = [];
const errors = [];
try {
  for (const [index, player] of players.entries()) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: player.width, height: index === 2 ? 1024 : 844, isMobile: true, hasTouch: true });
    if (index === 2) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument((token) => {
      localStorage.setItem('ggpoker.token', token);
      localStorage.setItem('ggpoker.welcomeSeen', '1');
      localStorage.setItem('ggpoker.animations', '0');
      sessionStorage.setItem('ggpoker.entered', '1');
    }, player.token);
    page.on('pageerror', (error) => errors.push({ index, message: String(error) }));
    await page.goto(`${BASE}/#/?play=1&game=spin`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.spin-register-button', { visible: true, timeout: 20000 });
    pages.push(page);
  }

  for (const [index, page] of pages.entries()) {
    await page.bringToFront();
    if (index > 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.spin-register-button', { visible: true, timeout: 20000 });
    }
    if (index === 0) await page.click('.spin-insurance-choice input');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/spin/register'), { timeout: 20000 });
    await page.click('.spin-register-button');
    const response = await responsePromise;
    if (response.status() !== 200) throw new Error(`Registration ${index} returned ${response.status()}`);
    if (index === 2) await page.waitForSelector('.spin-presentation', { visible: true, timeout: 20000 });
  }
  for (const index of [0, 1]) {
    await pages[index].bringToFront();
    await until(pages[index], () => [...document.querySelectorAll('.spin-active-row button')].some((button) => button.textContent === 'Open match'), { timeout: 10000 });
    await pages[index].click('.spin-active-row button');
    await until(pages[index], () => location.hash.startsWith('#/table/spin:'), { timeout: 10000 });
    await pages[index].waitForSelector('.spin-presentation', { visible: true, timeout: 20000 });
  }
  await pages[0].screenshot({ path: path.join(OUT, 'wheel-320.png') });

  for (const [index, page] of pages.entries()) {
    await page.bringToFront();
    await until(page,() => [...document.querySelectorAll('.spin-presentation-actions button')].some((button) => button.textContent === 'Confirm result' && !button.disabled), { polling: 100, timeout: 15000 });
    await page.evaluate(() => [...document.querySelectorAll('.spin-presentation-actions button')].find((button) => button.textContent === 'Confirm result')?.click());
    if (index === 0) {
      await page.waitForSelector('.spin-insurance-panel', { visible: true, timeout: 15000 });
      await page.screenshot({ path: path.join(OUT, 'insurance-320.png') });
      await page.evaluate(() => [...document.querySelectorAll('.spin-presentation-actions button')].find((button) => button.textContent === 'Continue')?.click());
    }
    await until(page,() => document.body.innerText.includes('Ready to play'), { polling: 100, timeout: 15000 });
  }
  for (const page of pages) {
    await page.bringToFront();
    await page.evaluate(() => [...document.querySelectorAll('.spin-presentation-actions button')].find((button) => button.textContent === 'Ready to play')?.click());
    await until(page,() => !document.querySelector('.spin-presentation'), { polling: 100, timeout: 15000 });
  }
  for (const page of pages) {
    await page.bringToFront();
    await until(page, () => !document.querySelector('.spin-presentation') && !!document.querySelector('.table-screen') && document.body.innerText.includes('PRE-FLOP'), { polling: 100, timeout: 15000 });
  }
  await pages[1].screenshot({ path: path.join(OUT, 'hand-390.png') });
  await pages[2].screenshot({ path: path.join(OUT, 'hand-768-reduced.png') });
  const geometry = [];
  for (const [index, page] of pages.entries()) {
    geometry.push(await page.evaluate((width) => ({
      width,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hand: !document.querySelector('.spin-presentation') && !!document.querySelector('.table-screen') && document.body.innerText.includes('PRE-FLOP'),
      presentation: !!document.querySelector('.spin-presentation'),
      tableUrl: location.hash,
    }), players[index].width));
  }
  const result = { completed: true, players: players.map((player) => player.user.id), geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (errors.length || geometry.some((row) => row.overflowX > 1 || !row.hand || row.presentation)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} catch (error) {
  for (const [index, page] of pages.entries()) {
    console.log('page', index, await page.evaluate(() => document.body.innerText.slice(0, 1800)));
    await page.screenshot({ path: path.join(OUT, `failure-${index}.png`) });
  }
  throw error;
} finally {
  await browser.close();
}
