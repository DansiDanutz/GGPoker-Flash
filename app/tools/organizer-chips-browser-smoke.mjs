// SPDX-License-Identifier: AGPL-3.0-only
// The browser and API operate exclusively on this disposable loopback fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
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
async function input(page, selector, value) {
  const field = await page.waitForSelector(selector);
  await field.focus();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.down(modifier); await page.keyboard.press('KeyA'); await page.keyboard.up(modifier);
  await field.type(String(value));
  assert.equal(await field.evaluate((el) => el.value), String(value));
}
async function pageFor(token) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(15000);
  await page.setViewport({ width: 1280, height: 1000 });
  page.on('dialog', (dialog) => dialog.accept()); page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument((token) => {
    localStorage.setItem('ggpoker.token', token); sessionStorage.setItem('ggpoker.entered', '1');
    window.__externalCheckoutAttempts = [];
    window.open = (url, target, features) => { window.__externalCheckoutAttempts.push({ url: String(url), target, features }); return null; };
  }, token);
  await page.goto(`${srv.base}/marketplace`);
  await page.waitForSelector(panel); return page;
}
try {
  await fs.mkdir(artifacts, { recursive: true });
  srv = await startServer({ env: { GGPOKER_USAGE_BILLING: 'enforce', GGPOKER_ORGANIZER_CHIPS: 'enforce', GGPOKER_NERVIXPAY_MANUAL_FUNDING: 'on' } });
  const admin = await srv.login('admin', 'admin123');
  const owner = await post('/api/auth/register', null, { login: 'chips_browser_owner', nick: 'ChipBrowserOwner', password: 'browser-chip-password' });
  const recipient = await post('/api/auth/register', null, { login: 'chips_browser_player', nick: 'ChipBrowserPlayer', password: 'browser-chip-password' });
  await post('/api/admin/marketplace/billing/credits', admin, { userId: owner.user.id, amountCents: 10000, reference: 'browser-chip-funding' });
  const executablePath = process.env.CHROME_PATH || execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim();
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage', '--no-first-run'] });
  const ownerPage = await pageFor(owner.token);
  const billing = 'section[aria-label="Credite și servicii pentru organizatori"]';
  const funding = 'section[aria-label="Finanțare manuală credite servicii"]';
  await ownerPage.waitForSelector(funding);
  assert.deepEqual(await ownerPage.evaluate(() => window.__externalCheckoutAttempts), [], 'Funding UI navigated before an explicit click.');
  const fundingButtons = await ownerPage.$$(`${funding} button`);
  assert.equal(fundingButtons.length, 2);
  await fundingButtons[0].click();
  const checkoutAttempt = await ownerPage.evaluate(() => window.__externalCheckoutAttempts[0]);
  const checkoutUrl = new URL(checkoutAttempt.url);
  assert.equal(checkoutUrl.origin + checkoutUrl.pathname, 'https://nervixpay.live/l/b0afce77-773a-48a0-9a73-72274791313d');
  assert.equal(checkoutUrl.searchParams.get('ref'), `openpoker:user:${owner.user.id}`);
  assert.equal(checkoutUrl.searchParams.has('reference'), false);
  assert.equal(checkoutAttempt.target, '_blank');
  assert.match(await ownerPage.$eval(funding, (node) => node.textContent), /verificată manual|verificării operatorului/);
  assert.equal(new URL(ownerPage.url()).origin, srv.base);
  assert.equal((await ownerPage.browser().pages()).some((page) => page.url().startsWith('https://nervixpay.live/')), false, 'Smoke must not open an external payment page.');
  await ownerPage.waitForFunction((scope) => [...document.querySelectorAll(`${scope} article`)].some((a) => a.querySelector('strong')?.textContent === 'Organizator' && a.querySelector('button') && !a.querySelector('button').disabled), {}, billing);
  const subscribe = await ownerPage.evaluateHandle((scope) => [...document.querySelectorAll(`${scope} article`)].find((a) => a.querySelector('strong')?.textContent === 'Organizator').querySelector('button'), billing);
  await subscribe.asElement().evaluate((button) => button.scrollIntoView({ block: 'center' }));
  await subscribe.asElement().click(); await subscribe.dispose();
  await ownerPage.waitForFunction((scope) => document.querySelector(scope)?.textContent.includes('Abonamentul a fost actualizat.'), {}, billing);
  await click(ownerPage, panel, 'Actualizează'); await text(ownerPage, '100,000 Cash Chips');
  await ownerPage.goto(`${srv.base}/#/?game=holdem`);
  await ownerPage.waitForSelector('.host-table-btn'); await ownerPage.click('.host-table-btn');
  await ownerPage.waitForSelector('#host-economy');
  await ownerPage.select('#host-economy', 'organizer');
  await ownerPage.waitForSelector('#host-rake-percent');
  assert.deepEqual(await ownerPage.$$eval('#host-rake-percent option', (options) => options.map((option) => option.value)), ['2', '3', '4', '5']);
  await input(ownerPage, '.modal input[maxlength="40"]', 'Browser Rake Cash');
  await ownerPage.select('#host-rake-percent', '3');
  await input(ownerPage, '#host-rake-cap', '25');
  await click(ownerPage, '.modal-foot', 'Create table');
  await ownerPage.waitForSelector('.mp-rake-form');
  let cash = check(await srv.get('/api/marketplace/billing/me', { token: owner.token })).tables.find((table) => table.name === 'Browser Rake Cash');
  assert.equal(cash.rakePercent, 3); assert.equal(cash.rakeCap, 25);
  await ownerPage.select('.mp-rake-form select', '2');
  await input(ownerPage, '.mp-rake-form input', '7');
  await click(ownerPage, '.mp-rake-form', 'Salvează rake');
  await ownerPage.waitForFunction((scope) => document.querySelector(scope)?.textContent.includes('Rake-ul a fost salvat.'), {}, billing);
  await ownerPage.reload(); await ownerPage.waitForSelector('.mp-rake-form');
  assert.equal(await ownerPage.$eval('.mp-rake-form select', (el) => el.value), '2');
  assert.equal(await ownerPage.$eval('.mp-rake-form input', (el) => el.value), '7');
  // Fixture-only legacy hours: real payment and checkout services are never contacted.
  const fixtureDb = new DatabaseSync(path.join(srv.dataDir, 'ggpoker.db'));
  try {
    for (let i = 1; i <= 50; i++) fixtureDb.prepare("INSERT INTO organizer_billing_ledger(user_id,kind,amount_cents,reference,resource_id,created_at) VALUES (?,'cash_hour',-500,?,'historical-fixture',datetime('now'))").run(owner.user.id, `browser-historical-hour-${i}`);
  } finally { fixtureDb.close(); }
  await ownerPage.reload(); await ownerPage.waitForSelector('[aria-label="Tarif orar Cash"]');
  const formattedFour = new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'USD' }).format(4);
  assert.match(await ownerPage.$eval('[aria-label="Tarif orar Cash"]', (el) => el.textContent), /Ore plătite: 50/);
  await click(ownerPage, billing, `Pornește (${formattedFour})`);
  await ownerPage.waitForFunction(() => document.querySelector('.mp-rake-form select')?.disabled);
  let billingAccount = check(await srv.get('/api/marketplace/billing/me', { token: owner.token }));
  assert.equal(billingAccount.cash_usage.paid_hours, 51);
  assert.equal(billingAccount.ledger.find((entry) => entry.kind === 'cash_hour').amount_cents, -400);
  await click(ownerPage, billing, 'Oprește');
  await ownerPage.waitForFunction(() => document.querySelector('.mp-rake-form select')?.disabled === false);
  await ownerPage.setViewport({ width: 390, height: 844 });
  await ownerPage.$eval('.mp-rake-form', (form) => form.scrollIntoView({ block: 'center' }));
  assert.ok(await ownerPage.$$eval('.mp-rake-form input, .mp-rake-form select, .mp-rake-form button', (controls) => controls.every((control) => { const bounds = control.getBoundingClientRect(); return bounds.left >= 0 && bounds.right <= innerWidth; })), 'Rake inputs overflow mobile width');
  assert.ok(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Rake controls overflow mobile width');
  await ownerPage.screenshot({ path: path.join(artifacts, 'organizer-rake-mobile.png'), fullPage: true });
  await ownerPage.setViewport({ width: 1280, height: 1000 });
  await ownerPage.goto(`${srv.base}/#/table/${cash.id}?observe=1`);
  await ownerPage.waitForFunction(() => [...document.querySelectorAll('.table-topbar .pill')].some((el) => el.textContent.includes('Rake 2%') && el.textContent.includes('7 Cash Chips/hand')));
  await ownerPage.screenshot({ path: path.join(artifacts, 'organizer-rake-table.png'), fullPage: true });
  await ownerPage.goto(`${srv.base}/marketplace`); await ownerPage.waitForSelector(panel);
  console.log('PASS Cash rake creation/edit/persistence, table disclosure, mobile layout and discounted hour 51 at $4 in Chrome');
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
