#!/usr/bin/env node
// Isolated mobile launch smoke: accepts no URL and only uses a disposable loopback sandbox.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startSandbox } from './contributor-sandbox.mjs';

assert.equal(process.argv.length, 2, 'No URL or command-line arguments are accepted.');

const artifacts = path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/mobile-launch');
const widths = [320, 360, 390, 430];
const pageErrors = [];
const checks = [];
const skipped = [];
await mkdir(artifacts, { recursive: true });
await rm(path.join(artifacts, 'failure.png'), { force: true });

function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(mac)) return mac;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { /* try the next installed browser */ }
  }
  throw new Error('Chrome/Chromium is required; set CHROME_PATH when it is not installed in the default location.');
}

async function json(base, endpoint, init) {
  assert.ok(endpoint.startsWith('/'), 'Only sandbox-relative paths are permitted.');
  const response = await fetch(base + endpoint, init);
  const data = await response.json();
  assert.ok(response.ok, `${endpoint}: ${response.status} ${data.error || ''}`);
  return data;
}

async function waitForRoute(page, route) {
  await page.waitForFunction((expected) => location.hash.split('?')[0] === `#${expected}`, {}, route);
  await page.waitForFunction(() => !document.documentElement.matches(':active-view-transition'));
}

async function clickText(page, selector, label) {
  const handle = await page.evaluateHandle((selector, label) => [...document.querySelectorAll(selector)].find((node) => node.textContent.trim() === label), selector, label);
  const element = handle.asElement();
  assert.ok(element, `Missing ${label} in ${selector}`);
  await element.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await element.click();
  await handle.dispose();
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, `${label} overflows horizontally: ${JSON.stringify(dimensions)}`);
}

async function shot(page, name, fullPage = true) {
  await page.bringToFront();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage });
}

const sandbox = await startSandbox();
let browser;
let page;
try {
  assert.equal(new URL(sandbox.url).hostname, '127.0.0.1');
  assert.equal(new URL(sandbox.api).hostname, '127.0.0.1');
  browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, pipe: true,
    userDataDir: path.join(sandbox.directory, 'browser'),
    args: ['--disable-dev-shm-usage', '--no-first-run'],
  });
  page = await browser.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    sessionStorage.setItem('ggpoker.entered', '1');
    localStorage.setItem('ggpoker.welcomeSeen', '1');
  });

  const login = `ml_${Date.now()}`;
  const password = 'mobile-launch-browser-password';
  await json(sandbox.api, '/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, nick: 'Mobile Launch', password }),
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${sandbox.url}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-id,.login2-splash-login', { visible: true });
  if (!await page.$('#login-id')) await page.click('.login2-splash-login');
  await page.waitForSelector('#login-id', { visible: true });
  await page.type('#login-id', login);
  await page.type('#login-password', password);
  assert.deepEqual(await page.$$eval('#login-id,#login-password', (nodes) => nodes.map((node) => node.value)), [login, password]);
  const [loginRequest, loginResponse] = await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/auth/login') && request.method() === 'POST'),
    page.waitForResponse((response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST'),
    page.click('.login2-cta'),
  ]);
  assert.deepEqual(JSON.parse(loginRequest.postData()), { login, password });
  assert.equal(loginResponse.status(), 200);
  const browserLogin = await loginResponse.json();
  assert.ok(browserLogin.token);
  await page.waitForFunction((token) => localStorage.getItem('ggpoker.token') === token, {}, browserLogin.token);
  checks.push('Disposable registered user logged in through the browser UI.');

  const manifest = await json(sandbox.url, '/manifest.webmanifest');
  assert.equal(manifest.name, 'DanGG');
  assert.equal(manifest.short_name, 'DanGG');
  const appleTitle = await page.evaluate(async (url) => {
    const html = await (await fetch(url)).text();
    return new DOMParser().parseFromString(html, 'text/html').querySelector('meta[name="apple-mobile-web-app-title"]')?.content;
  }, sandbox.url + '/');
  assert.equal(appleTitle, 'DanGG');
  checks.push('PWA manifest and Apple web-app title identify DanGG.');

  const directory = await json(sandbox.api, '/api/marketplace/contributors');
  assert.deepEqual(directory, { contributors: [] });
  checks.push('Public contributor directory reports an honest empty state in the fresh sandbox.');

  const database = new DatabaseSync(path.join(sandbox.directory, 'data', 'ggpoker.db'));
  try {
    const owner = database.prepare("SELECT id FROM users WHERE nick='DansiDanutz' LIMIT 1").get();
    assert.ok(owner, 'The local demo user DansiDanutz is missing.');
    const at = new Date().toISOString();
    database.prepare(`INSERT INTO marketplace_publishers
      (id,owner_user_id,display_name,kind,nervixpay_merchant_id,status,review_reason,created_at,updated_at)
      VALUES ('mobile-launch-creator',?,'DansiDanutz','individual','local-smoke-merchant','approved','local fixture',?,?)`).run(owner.id, at, at);
    const offer = database.prepare('INSERT INTO marketplace_commerce_offers VALUES (?,\'mobile-launch-creator\',?,?)');
    for (const product of ['cash-games-manager', 'tournaments-manager', 'spin-and-go-manager']) offer.run(product, at, at);
    database.prepare(`INSERT OR IGNORE INTO marketplace_products
      SELECT 'contrib-rake-lab','contrib-rake-lab','Rake Lab','Preview rake with virtual chips.','Free Play Money calculator.','extensions','open_source_extension','available','quote',NULL,'USD','[]',0,100,created_at,updated_at
      FROM marketplace_products LIMIT 1`).run();
    database.prepare("UPDATE marketplace_products SET status='available' WHERE id='contrib-rake-lab'").run();
    database.prepare(`INSERT INTO contributor_submissions
      (id,user_id,publisher_id,plugin_id,pr_number,head_sha,notes,proof_json,status,created_at,updated_at)
      VALUES ('mobile-launch-rake-lab',?,'mobile-launch-creator','rake-lab',224,'local-smoke','Local fixture','{}','published',?,?)`).run(owner.id, at, at);
  } finally { database.close(); }

  const populatedDirectory = await json(sandbox.api, '/api/marketplace/contributors');
  assert.equal(populatedDirectory.contributors.length, 1);
  assert.equal(populatedDirectory.contributors[0].display_name, 'DansiDanutz');
  assert.deepEqual(populatedDirectory.contributors[0].products.map((product) => product.id).sort(), [
    'cash-games-manager', 'contrib-rake-lab', 'spin-and-go-manager', 'tournaments-manager',
  ]);
  checks.push('Temporary fixture exposes DansiDanutz with three manager offers and the published Rake Lab plugin.');

  for (const width of widths) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.goto(`${sandbox.url}/#/my-page`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.ma .profile-workspace-tabs', { visible: true });
    assert.deepEqual(await page.$$eval('.profile-workspace-tabs button', (nodes) => nodes.map((node) => node.textContent.trim())), ['Contributor', 'Organizer', 'Marketplace']);
    assert.ok(await page.$$eval('.ma .profile-workspace-tabs button', nodes => nodes.every(node => {
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      return parseFloat(style.borderTopWidth) >= 1 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth;
    })), `Workspace tabs must remain visibly bounded and tappable at ${width}px`);
    const chrome = await page.evaluate(() => {
      const avatar = document.querySelector('.p-topbar .p-avatar-btn')?.getBoundingClientRect();
      const controls = [...document.querySelectorAll('.p-topbar button')].map((node) => node.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
      const wallet = document.querySelector('.p-topbar .p-wallet')?.getBoundingClientRect();
      return { avatarRight: avatar?.right, rightmost: Math.max(...controls.map((rect) => rect.right)), walletVisible: Boolean(wallet?.width && wallet?.height) };
    });
    assert.equal(chrome.avatarRight, chrome.rightmost, `Profile avatar is not rightmost at ${width}px.`);
    assert.equal(chrome.walletVisible, true, `Wallet is not visible at ${width}px.`);
    await assertNoOverflow(page, `Profile at ${width}px`);
    if (width === 390) await shot(page, 'profile-390');

    for (const [label, route] of [['Contributor', '/contributor'], ['Organizer', '/organiser'], ['Marketplace', '/marketplace']]) {
      await clickText(page, '.profile-workspace-tabs button', label);
      await waitForRoute(page, route);
      await page.waitForSelector(`.profile-workspace-tabs button[aria-current="page"]`, { visible: true });
      assert.equal(await page.$eval('.profile-workspace-tabs button[aria-current="page"]', (node) => node.textContent.trim()), label);
      await assertNoOverflow(page, `${label} at ${width}px`);
      if (width === 390 && route !== '/marketplace') await shot(page, `${route.slice(1)}-390`);
      if (width === 390 && route === '/marketplace') {
        await page.waitForSelector('.mp-contributor', { visible: true });
        assert.equal(await page.$eval('.mp-contributor h3', (node) => node.textContent.trim()), 'DansiDanutz');
        assert.deepEqual(await page.$$eval('.mp-product h3', nodes => nodes.slice(0, 3).map(node => node.textContent.trim())), ['Cash Table', 'Tournaments', 'Spin & Go']);
        assert.deepEqual((await page.$$eval('.mp-contributor li button', (nodes) => nodes.map((node) => node.textContent.trim()))).sort(), ['Cash Table', 'Rake Lab', 'Spin & Go', 'Tournaments']);
        await page.$eval('#marketplace-catalog', (node) => node.scrollIntoView({ block: 'start' }));
        await shot(page, 'launch-catalog-390', false);
        await clickText(page, '.mp-product-creator', 'By DansiDanutz');
        assert.equal(locationHash(await page.evaluate(() => location.hash)), '#/marketplace');
        await page.waitForFunction(() => document.querySelector('.mp-contributor')?.getBoundingClientRect().top < innerHeight);
        await shot(page, 'contributor-directory-390', false);
        for (const plugin of ['Cash Table', 'Tournaments', 'Spin & Go', 'Rake Lab']) {
          await clickText(page, '.mp-contributor li button', plugin);
          assert.equal(locationHash(await page.evaluate(() => location.hash)), '#/marketplace');
          await page.$eval('.mp-contributor', (node) => node.scrollIntoView({ block: 'center' }));
        }
      }
      if (route !== '/marketplace') {
        assert.ok(await page.$('.p-topbar .p-icon-btn[aria-label="Back"]'), `${label} has no Back control.`);
        assert.ok(await page.$('.p-topbar .p-wallet'), `${label} has no Wallet control.`);
      }
      await page.goto(`${sandbox.url}/#/my-page`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.profile-workspace-tabs', { visible: true });
    }
  }
  checks.push('Profile chrome, workspace tabs, active states, Back/Wallet and horizontal fit passed at 320/360/390/430px.');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${sandbox.url}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.p-topbar', { visible: true });
  await assertNoOverflow(page, 'Lobby');
  await shot(page, 'lobby-390');

  const lobby = await json(sandbox.api, '/api/lobby');
  const table = lobby.tables?.[0];
  if (table) {
    await page.goto(`${sandbox.url}/#/table/${table.id}?observe=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.table-screen', { visible: true });
    await assertNoOverflow(page, 'Cash table');
    await shot(page, 'cash-table-390');
  } else skipped.push('cash-table screenshot: sandbox had no seeded tables');

  const tournaments = await json(sandbox.api, '/api/tournaments');
  const tournament = tournaments.tournaments?.[0];
  await page.goto(`${sandbox.url}/#/tournaments${tournament ? `?id=${encodeURIComponent(tournament.id)}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.p-topbar', { visible: true });
  await assertNoOverflow(page, 'Tournament details');
  await shot(page, tournament ? 'tournament-details-390' : 'tournaments-390');
  if (!tournament) skipped.push('tournament detail selection: sandbox had no seeded tournaments; captured tournament listing');

  assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join(' | ')}`);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ checks, skipped, page_errors: pageErrors, widths }, null, 2));
  console.log(JSON.stringify({ ok: true, checks, skipped, artifacts }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => undefined);
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify({ checks, skipped, page_errors: pageErrors, error: error.message }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await sandbox.close();
}

function locationHash(hash) {
  return hash.split('?')[0];
}
