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
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
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
  await page.goto(sandbox.url + '/#/my-page?tab=overview');
  await page.waitForSelector('section[aria-label="Choose how you use OpenPoker"]');
  assert.deepEqual(await page.$$eval('.profile-role-guide h3', nodes => nodes.map(node => node.textContent)), ['Player for fun', 'Organiser', 'Contributor']);
  await page.waitForSelector('.mpp input[type=file]');
  const upload = await page.$('.mpp input[type=file]');
  await upload.uploadFile(path.resolve('public/assets/avatars/gg-02.jpg'));
  await page.waitForFunction(() => document.querySelector('.mpp-portrait img')?.getAttribute('src')?.startsWith('data:image/png;'));
  await button(page, '.mpp-foot', 'Apply');
  await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some(node => node.textContent.includes('Profile saved')));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.mpp-portrait img')?.getAttribute('src')?.startsWith('data:image/png;'));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 1000 });
    await page.waitForSelector('.profile-role-guide');
    assert.ok(await page.$eval('.profile-role-guide', node => node.scrollWidth <= node.clientWidth + 1), `Profile guide overflow at ${width}`);
    if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(artifacts, `profile-${width}.png`), fullPage: true });
  }
  await page.setViewport({ width: 390, height: 1000 });
  await page.goto(sandbox.url + '/#/my-page');
  await page.reload();
  await page.waitForSelector('.ma .profile-role-guide');
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
  await page.click('button[aria-label="Edit game profile"]');
  await page.waitForSelector('.mpp-portrait');
  await page.setViewport({ width: 1440, height: 1000 });
  await page.waitForFunction(() => !document.querySelector('.pshell'));
  await button(page, '.profile-role-guide', 'Open Contributor');
  await page.waitForSelector('section[aria-label="Contributor membership and credits"]');
  assert.equal(await page.$('section[aria-label="Contributor membership and credits"] [aria-label="Tarif orar Cash"]'), null);
  await page.goto(sandbox.url + '/#/organiser');
  await page.waitForSelector('section[aria-label="Organiser management"]');
  await button(page, 'section[aria-label="Organiser management"]', 'Create tournament');
  await page.waitForSelector('#host-economy');
  assert.equal(await page.$eval('#host-economy', node => node.value), 'organizer');
  assert.match(await page.$eval('#host-dialog-title', node => node.textContent), /tournament/);
  await page.goto(sandbox.url + '/#/contributor');
  checks.push('Profile guides all three roles, uploaded avatar previews and persists, and management stays inside each workspace.');
  await page.waitForSelector('section[aria-label="Contributor workspace"] form');
  assert.equal(await page.$('.platform-tabs'), null, 'Workspace tabs must not sit above the app chrome');
  await page.evaluate(() => window.dispatchEvent(new Event('gg:quickmenu')));
  await page.waitForSelector('.quick-workspace');
  assert.deepEqual(await page.$$eval('.quick-workspace b', (nodes) => nodes.map((n) => n.textContent)), ['Marketplace', 'Contributor', 'Organiser']);
  await page.evaluate(() => document.querySelector('.quick-close')?.click());
  await page.waitForFunction(() => !document.querySelector('.quick-menu'));
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
    // Phones hide the desktop account menu; their entry point is the My Page hub,
    // checked below. Only desktop widths owe an account-menu layout.
    if (width >= 768) {
      await page.evaluate(() => window.dispatchEvent(new Event('gg:quickmenu')));
      await page.waitForSelector('.quick-workspace');
      assert.ok(await page.$$eval('.quick-workspace', (nodes) => {
        const panel = document.querySelector('.quick-menu').getBoundingClientRect();
        return panel.width > 0 && nodes.every((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0
            && rect.x >= panel.x - 1 && rect.x + rect.width <= panel.x + panel.width + 1
            && rect.y >= panel.y - 1 && rect.y + rect.height <= panel.y + panel.height + 1;
        });
      }), `Workspace links mislaid at ${width}`);
      await page.evaluate(() => document.querySelector('.quick-close')?.click());
      await page.waitForFunction(() => !document.querySelector('.quick-menu'));
    }
    if ([375, 1440].includes(width)) await page.screenshot({ path: path.join(artifacts, `contributor-${width}.png`), fullPage: true });
  }
  await page.setViewport({ width: 390, height: 1000 });
  await page.goto(sandbox.url + '/#/my-page');
  await page.waitForSelector('.ma .profile-workspace-tabs button');
  assert.equal(await page.$('.platform-tabs'), null);
  assert.deepEqual(await page.$$eval('.ma .profile-workspace-tabs button', nodes => nodes.map(node => node.textContent)), ['Contributor', 'Organizer', 'Marketplace']);
  checks.push('Phones reach all three workspaces from the prominent Profile tabs.');
  await page.setViewport({ width: 1440, height: 1000 });
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
