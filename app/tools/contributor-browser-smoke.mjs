// SPDX-License-Identifier: AGPL-3.0-only
// Exercises only a new loopback sandbox and disposable browser profiles.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startSandbox } from './contributor-sandbox.mjs';

const artifacts = path.resolve('artifacts/marketplace-browser');
await mkdir(artifacts, { recursive: true });
const sandbox = await startSandbox();
let browser, currentPage;
const errors = [], checks = [];
const call = async (route, body) => {
  const result = await fetch(sandbox.api + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(result.status, 200); return result.json();
};
async function pageFor(token, route) {
  const context = await browser.createBrowserContext(), page = await context.newPage(); currentPage = page;
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument((value) => {
    sessionStorage.setItem('ggpoker.entered', '1');
    localStorage.setItem('ggpoker.welcomeSeen', '1');
    if (value) localStorage.setItem('ggpoker.token', value);
  }, token);
  await page.goto(sandbox.url + '/#' + route);
  return page;
}
async function button(page, scope, label) {
  const handle = await page.evaluateHandle((scope, label) => [...document.querySelectorAll(`${scope} button`)].find((node) => node.textContent.trim() === label), scope, label);
  const element = handle.asElement(); assert.ok(element, `Missing button ${label}`);
  await element.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await element.click(); await handle.dispose();
}
try {
  const executablePath = process.env.CHROME_PATH || execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim();
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--disable-dev-shm-usage', '--no-first-run'] });
  const guest = await call('/api/auth/guest', {});
  assert.equal(guest.user.is_guest, true);
  const guestPage = await pageFor(guest.token, '/?game=holdem');
  await guestPage.waitForSelector('.game-tabs,.mobile-shell');
  assert.equal(await guestPage.$('.platform-tabs'), null);
  checks.push('Guest Play Money session has no Contributor, Organiser or Marketplace tabs.');
  const member = await call('/api/auth/register', { login: 'contributor_browser', nick: 'Contributor Browser', password: 'browser-test-password' });
  const page = await pageFor(member.token, '/contributor');
  await page.waitForSelector('section[aria-label="Contributor workspace"] form');
  assert.deepEqual(await page.$$eval('.platform-tabs button', (nodes) => nodes.map((n) => n.textContent)), ['Contributor', 'Organiser', 'Marketplace']);
  assert.match(await page.$eval('.contributor-workspace', (node) => node.textContent), /pnpm sandbox/);
  for (const [selector, value] of [['input[pattern]', 'test-plugin'], ['input[type=url]', 'https://github.com/OpenPoker4all/OpenPoker/pull/219'], ['textarea', 'Tested both browser and server changes in Play Money.']]) await page.type(`section[aria-label="Contributor workspace"] ${selector}`, value);
  await button(page, 'section[aria-label="Contributor workspace"]', 'Submit for approval');
  await page.waitForFunction(() => [...document.querySelectorAll('[role=alert]')].some(node => node.textContent.includes('Contributor membership required')));
  checks.push('Registered account sees all three workspaces; free account submission is rejected without a charge.');
  const ax = await page.accessibility.snapshot();
  assert.match(JSON.stringify(ax), /Submit for approval/);
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 1000 });
    await page.waitForSelector('section[aria-label="Contributor workspace"]');
    assert.ok(await page.$eval('.contributor-workspace', (node) => node.scrollWidth <= node.clientWidth + 1), `Workspace overflow at ${width}`);
    assert.ok(await page.$$eval('.platform-tabs button', (nodes) => nodes.every((node) => {
      const rect = node.getBoundingClientRect(); return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node;
    })), `Workspace tabs obscured at ${width}`);
    if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(artifacts, `contributor-${width}.png`), fullPage: true });
  }
  await page.goto(sandbox.url + '/#/?host=cash');
  await page.waitForSelector('#host-economy');
  assert.equal(await page.$eval('#host-economy', (node) => node.value), 'play_money');
  await page.waitForSelector('.modal input[maxlength="40"]');
  await page.type('.modal input[maxlength="40"]', 'Contributor free test');
  await button(page, '.modal-foot', 'Create table');
  await page.waitForFunction(() => location.hash.includes('/table/'));
  const headers = { authorization: `Bearer ${member.token}` };
  const resources = await (await fetch(sandbox.api + '/api/tables/host', { headers })).json();
  assert.equal(resources.tables.find((table) => table.name === 'Contributor free test').chip_economy, 0);
  const account = await (await fetch(sandbox.api + '/api/marketplace/billing/me', { headers })).json();
  assert.equal(account.ledger.length, 0); assert.equal(account.balance_cents, 0);
  checks.push('Browser-created Play Money table is playable and leaves service-credit billing untouched.');
  await page.goto(sandbox.url + '/#/contributor');
  await page.waitForFunction(() => [...document.querySelectorAll('article h3')].some(node => node.textContent === 'Rake Lab'));
  const sampleHandle = await page.evaluateHandle(() => [...document.querySelectorAll('article')].find(node => node.querySelector('h3')?.textContent === 'Rake Lab')?.querySelector('button'));
  const sampleButton = sampleHandle.asElement(); assert.ok(sampleButton);
  await sampleButton.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await sampleButton.click(); await sampleHandle.dispose();
  await page.waitForFunction(() => location.hash === '#/rake-lab');
  await page.waitForSelector('#rake-lab-pot');
  // The app's view-transition overlay intercepts clicks until navigation finishes.
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
  await page.focus('.rake-lab button[type=submit]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('article[aria-label="Rake preview result"]');
  assert.match(await page.$eval('.rake-lab [role=status]', node => node.textContent), /Cap reached/);
  assert.deepEqual(await page.$$eval('.rake-lab dd', nodes => nodes.map(node => node.textContent)), ['6,000 chips', '300 chips', '5,700 chips']);
  await page.click('.rake-lab input[type=checkbox]');
  await page.locator('.rake-lab button[type=submit]').click();
  await page.waitForFunction(() => document.querySelector('.rake-lab [role=status]')?.textContent.includes('No flop, no rake'));
  assert.deepEqual(await page.$$eval('.rake-lab dd', nodes => nodes.map(node => node.textContent)), ['6,000 chips', '0 chips', '6,000 chips']);
  for (const toast of await page.$$('.toasts .toast')) await toast.click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 1000 });
    await page.waitForFunction(phone => !!document.querySelector('.pshell') === phone, {}, width <= 760);
    assert.ok(await page.$eval('.rake-lab', node => node.scrollWidth <= node.clientWidth + 1), `Rake Lab overflow at ${width}`);
    await page.$eval('.rake-lab a', node => node.scrollIntoView({ block: 'center' }));
    const footer = await page.$eval('.rake-lab a', node => { const rect = node.getBoundingClientRect(); const panel = node.closest('.rake-lab'); return { visible: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node, y: rect.y, panelHeight: panel.clientHeight, panelScroll: panel.scrollTop, panelContent: panel.scrollHeight, overflow: getComputedStyle(panel).overflowY }; });
    assert.ok(footer.visible, `Rake Lab footer unreachable at ${width}: ${JSON.stringify(footer)}`);
    if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(artifacts, `rake-lab-${width}.png`), fullPage: true });
  }
  const afterPreview = await (await fetch(sandbox.api + '/api/marketplace/billing/me', { headers })).json();
  assert.equal(afterPreview.ledger.length, 0); assert.equal(afterPreview.balance_cents, 0);
  checks.push('Registered Rake Lab renders cap/no-flop results at five widths without spending service credits.');
  const admin = await call('/api/auth/login', { login: 'admin', password: sandbox.password });
  const adminPage = await pageFor(admin.token, '/admin?section=marketplace');
  await adminPage.waitForSelector('.ma-tabs');
  await button(adminPage, '.ma-tabs', 'Pluginuri');
  await adminPage.waitForSelector('section[aria-label="Contributor review queue"]');
  checks.push('Admin marketplace exposes the separate contributor review queue.');
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, 'contributor-results.json'), JSON.stringify({ checks, page_errors: errors }, null, 2));
  console.log(checks.join('\n'));
} catch (error) {
  if (currentPage) { await currentPage.screenshot({ path: path.join(artifacts, 'contributor-failure.png'), fullPage: true }); console.error(await currentPage.$eval('body', node => node.innerText.slice(-6000))); }
  throw error;
} finally { await browser?.close(); await sandbox.close(); }
