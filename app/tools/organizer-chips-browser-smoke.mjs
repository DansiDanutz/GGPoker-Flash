// SPDX-License-Identifier: AGPL-3.0-only
// The browser and API operate exclusively on this disposable loopback fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { startServer } from '../server/test-helpers.js';

const artifacts = path.resolve('artifacts/marketplace-browser');
const panel = 'section[aria-label="Cash Chips organizator"]';
const errors = [];
let srv, browser, currentPage;
const check = (r) => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const post = async (route, token, body) => check(await srv.post(route, { token, body }));
async function click(page, scope, text) {
  await page.waitForFunction((scope, text) => [...document.querySelectorAll(`${scope} button`)].some((b) => b.textContent.trim() === text && !b.disabled), {}, scope, text);
  const handle = await page.evaluateHandle((scope, text) => [...document.querySelectorAll(`${scope} button`)].find((b) => b.textContent.trim() === text && !b.disabled), scope, text);
  await handle.asElement().evaluate((b) => b.scrollIntoView({ block: 'center' }));
  await handle.asElement().click(); await handle.dispose();
}
async function text(page, value) { await page.waitForFunction((selector, value) => document.querySelector(selector)?.textContent.includes(value), {}, panel, value); }
async function input(page, selector, value) { const field = await page.waitForSelector(selector); await field.type(String(value)); }
async function pageFor(token) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(15000);
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('dialog', (dialog) => dialog.accept()); page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument((token) => { localStorage.setItem('ggpoker.token', token); sessionStorage.setItem('ggpoker.entered', '1'); }, token);
  await page.goto(`${srv.base}/marketplace`);
  await page.waitForSelector(panel); return page;
}
try {
  await fs.mkdir(artifacts, { recursive: true });
  srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce' } });
  const admin = await srv.login('admin', 'admin123');
  const owner = await post('/api/auth/register', null, { login: 'chips_browser_owner', nick: 'ChipBrowserOwner', password: 'browser-chip-password' });
  const recipient = await post('/api/auth/register', null, { login: 'chips_browser_player', nick: 'ChipBrowserPlayer', password: 'browser-chip-password' });
  await post('/api/admin/marketplace/billing/credits', admin, { userId: owner.user.id, amountCents: 10000, reference: 'browser-chip-funding' });
  const executablePath = process.env.CHROME_PATH || execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim();
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage', '--no-first-run'] });
  const ownerPage = await pageFor(owner.token);
  const billing = 'section[aria-label="Credite și servicii pentru organizatori"]';
  await ownerPage.waitForFunction((scope) => [...document.querySelectorAll(`${scope} article`)].some((a) => a.querySelector('strong')?.textContent === 'Organizator' && a.querySelector('button') && !a.querySelector('button').disabled), {}, billing);
  const subscribe = await ownerPage.evaluateHandle((scope) => [...document.querySelectorAll(`${scope} article`)].find((a) => a.querySelector('strong')?.textContent === 'Organizator').querySelector('button'), billing);
  await subscribe.asElement().evaluate((button) => button.scrollIntoView({ block: 'center' }));
  await subscribe.asElement().click(); await subscribe.dispose();
  await ownerPage.waitForFunction((scope) => document.querySelector(scope)?.textContent.includes('Abonamentul a fost actualizat.'), {}, billing);
  await click(ownerPage, panel, 'Actualizează'); await text(ownerPage, '100,000 Cash Chips');
  await click(ownerPage, panel, 'Cumpără pachete'); await text(ownerPage, '110,000 Cash Chips');
  await input(ownerPage, `${panel} form:nth-of-type(2) input[type=number]:first-of-type`, recipient.user.id);
  const transferInputs = await ownerPage.$$(`${panel} form:nth-of-type(2) input`);
  assert.equal(transferInputs.length, 2); await transferInputs[1].type('10000');
  await click(ownerPage, panel, 'Transferă'); await text(ownerPage, 'Cash Chips au fost transferate.');
  const recipientAccount = check(await srv.get('/api/marketplace/chips/me', { token: recipient.token }));
  assert.equal(recipientAccount.balances.find((b) => b.organizer_id === owner.user.id).balance, 10000);
  const event = await post('/api/tournaments/host', owner.token, { name: 'Browser Cash Chip Cup', format: 'NLH', buyin: 1000, fee: 100, starting_stack: 10000, mode: 'STANDARD', start_at: new Date(Date.now() + 3600000).toISOString(), idempotencyKey: 'browser-chip-event' });
  const playerPage = await pageFor(recipient.token);
  await text(playerPage, '10,000 Cash Chips'); await text(playerPage, 'Browser Cash Chip Cup');
  await click(playerPage, panel, 'Cumpără bilet'); await text(playerPage, 'Biletul a fost emis.');
  await click(playerPage, panel, 'Înscrie biletul'); await text(playerPage, 'Biletul a fost înscris în turneu.');
  assert.equal(check(await srv.get('/api/marketplace/chips/me', { token: recipient.token })).tickets.find((t) => t.tournament_id === event.id).state, 'redeemed');
  await playerPage.screenshot({ path: path.join(artifacts, 'organizer-chip-tickets.png'), fullPage: true });
  await playerPage.setViewport({ width: 390, height: 844 });
  await text(playerPage, 'Cash Chips');
  assert.ok(await playerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Cash Chip page overflows mobile width');
  await playerPage.screenshot({ path: path.join(artifacts, 'organizer-chip-mobile.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS Cash Chip membership grant, pack purchase, scoped transfer and ticket redemption in Chrome; mobile layout');
  await fs.writeFile(path.join(artifacts, 'organizer-chip-report.json'), JSON.stringify({ ok: true, errors }));
} catch (error) {
  process.exitCode = 1; console.error(error);
  if (currentPage) { console.error('CHIP_DIAGNOSTIC', await currentPage.evaluate(() => document.body.innerText.slice(-12000)).catch(String)); await currentPage.screenshot({ path: path.join(artifacts, 'organizer-chip-failure.png'), fullPage: true }).catch(() => {}); }
  await fs.writeFile(path.join(artifacts, 'organizer-chip-report.json'), JSON.stringify({ ok: false, errors, error: String(error) }));
} finally {
  await browser?.close();
  if (srv) { await srv.stop(); await fs.rm(srv.dataDir, { recursive: true, force: true }); }
}
