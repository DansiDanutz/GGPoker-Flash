#!/usr/bin/env node
// Isolated browser smoke: always starts its own loopback server and disposable DB.
// This script deliberately has no base-URL argument and cannot target production.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

assert.equal(process.argv.length, 2, 'No URL or other command-line arguments are accepted.');
const appDir = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(appDir, 'artifacts', 'marketplace-browser');
const temporary = await mkdtemp(path.join(tmpdir(), 'dangg-marketplace-browser-'));
await mkdir(artifacts, { recursive: true });

let server;
let browser;
let currentPage;
let serverLog = '';
let base;
const pageErrors = [];
const completed = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { /* try the next installed browser */ }
  }
  throw new Error('An installed Chrome/Chromium is required (or set CHROME_PATH to its executable).');
}

async function waitUntil(check, message, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await pause(80); }
  throw new Error(message);
}

async function startServer() {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: appDir,
    env: {
      ...process.env, NODE_ENV: 'development', PORT: '0', GGPOKER_BIND: '127.0.0.1',
      GGPOKER_DATA: path.join(temporary, 'data'), GGPOKER_SEED_DEMO: '1',
      GGPOKER_ADMIN_PASSWORD: 'admin123', GGPOKER_ADMIN_ALLOW: '127.0.0.1/32',
      GGPOKER_PUBLIC_ORIGIN: '', GGPOKER_ADMIN_ORIGIN: '', GGPOKER_ALLOWED_HOSTS: '',
      GGPOKER_MARKETPLACE_ENFORCEMENT: 'enforce',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-100000); });
  server.stderr.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-100000); });
  await waitUntil(() => {
    if (server.exitCode !== null) throw new Error(`Fixture server exited (${server.exitCode}).`);
    const match = serverLog.match(/LISTENING (\d+)/);
    if (!match) return false;
    base = `http://127.0.0.1:${Number(match[1])}`;
    return true;
  }, 'Fixture server did not start.', 25000);
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const response = await fetch(`${base}/healthz`);
  assert.equal(response.status, 200);
}

async function api(endpoint, { token, method = 'GET', body } = {}) {
  assert.ok(endpoint.startsWith('/api/'), 'Only local fixture API paths are permitted.');
  const response = await fetch(base + endpoint, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.ok(response.ok, `${method} ${endpoint}: ${response.status} ${result.error || ''}`);
  return result;
}

async function newPage(context = browser) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  currentPage = page;
  return page;
}

async function clickText(page, selector, text) {
  const handle = await page.evaluateHandle((selector, text) => Array.from(document.querySelectorAll(selector)).find((node) => node.textContent.trim() === text), selector, text);
  const element = handle.asElement();
  assert.ok(element, `Missing control: ${selector} / ${text}`);
  await centerClick(element);
  await handle.dispose();
}

async function centerClick(element) {
  await element.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await element.click();
}

async function clickSelector(page, selector) {
  const element = await page.waitForSelector(selector, { visible: true });
  await centerClick(element);
  await element.dispose();
}

async function replaceInputValue(page, input, value, label) {
  await input.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await input.focus();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  if (value) await input.type(value);
  assert.equal(await input.evaluate((node) => node.value), value, `Field was not filled correctly: ${label}`);
}

async function fill(page, selector, value) {
  const input = await page.waitForSelector(selector, { visible: true });
  await replaceInputValue(page, input, value, selector);
  await input.dispose();
}

async function labeledField(page, label, selector = 'input,textarea,select', labelSelector = 'label.ma-field') {
  const handle = await page.evaluateHandle((label, selector, labelSelector) => Array.from(document.querySelectorAll(labelSelector)).find((node) => node.querySelector('span')?.textContent === label)?.querySelector(selector), label, selector, labelSelector);
  const element = handle.asElement();
  assert.ok(element, `Missing field: ${label}`);
  return element;
}

async function fillField(page, label, value, labelSelector = 'label.ma-field') {
  const input = await labeledField(page, label, 'input,textarea,select', labelSelector);
  await replaceInputValue(page, input, value, label);
  await input.dispose();
}

async function selectField(page, label, value, labelSelector = 'label.ma-field') {
  const input = await labeledField(page, label, 'select', labelSelector);
  await input.select(value);
  await input.dispose();
}

async function clickInside(page, container, heading, text) {
  await page.waitForFunction((container, heading, text) => {
    const card = Array.from(document.querySelectorAll(container)).find((node) => node.querySelector('h3,h4')?.textContent.trim() === heading);
    const button = card && Array.from(card.querySelectorAll('button')).find((node) => node.textContent.trim() === text);
    return button && !button.disabled;
  }, {}, container, heading, text);
  const handle = await page.evaluateHandle((container, heading, text) => {
    const card = Array.from(document.querySelectorAll(container)).find((node) => node.querySelector('h3,h4')?.textContent.trim() === heading);
    return card && Array.from(card.querySelectorAll('button')).find((node) => node.textContent.trim() === text);
  }, container, heading, text);
  const element = handle.asElement();
  assert.ok(element, `Missing ${text} in ${heading}`);
  await centerClick(element); await handle.dispose();
}

async function waitText(page, selector, text) {
  await page.waitForFunction((selector, text) => Array.from(document.querySelectorAll(selector)).some((node) => node.textContent.includes(text)), {}, selector, text);
}

async function commerceStep(page, label) {
  const handle = await page.evaluateHandle((label) => Array.from(document.querySelectorAll('.mf-steps button')).find((node) => node.textContent.trim().endsWith(label)), label);
  const element = handle.asElement();
  assert.ok(element, `Missing commerce step: ${label}`);
  await centerClick(element); await handle.dispose();
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
}

async function assertPublicLayout(page, width) {
  const result = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('.mp-header-inner,.mp-hero-copy,.mp-product,.mp-search,.mp-filters,.mg-plugin,.mg-publisher-account'));
    return {
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      overflow: blocks.filter((node) => { const r = node.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map((node) => node.className),
      heading: document.querySelector('#marketplace-title')?.getBoundingClientRect().width || 0,
    };
  });
  assert.equal(result.viewport, width);
  assert.ok(result.document <= width + 1, `Document overflows at ${width}px.`);
  assert.deepEqual(result.overflow, [], `Content overflows at ${width}px.`);
  assert.ok(result.heading > 200, 'Main heading is not visible.');
}

async function run() {
  assert.ok(existsSync(path.join(appDir, 'dist', 'index.html')), 'Build the web client before running the browser smoke.');
  await startServer();
  browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true, pipe: true,
    userDataDir: path.join(temporary, 'browser'), args: ['--disable-dev-shm-usage', '--no-first-run'],
  });
  const owner = await newPage();
  await owner.goto(`${base}/marketplace`, { waitUntil: 'domcontentloaded' });
  await owner.waitForSelector('.mp-product', { visible: true });
  assert.equal(await owner.$('#login-id'), null, 'Public marketplace unexpectedly requires login.');
  await owner.reload({ waitUntil: 'domcontentloaded' });
  await owner.waitForSelector('.mp-product', { visible: true });
  const initial = await api('/api/marketplace');
  const management = await api('/api/marketplace/management');
  assert.equal(management.mode, 'enforce');
  const managementIds = management.plugins.map((plugin) => plugin.id);
  for (const id of ['cash-games-manager', 'tournaments-manager', 'spin-and-go-manager']) {
    const plugin = management.plugins.find((entry) => entry.id === id);
    assert.ok(plugin?.implemented, `Expected an implemented organizer plugin: ${id}`);
    assert.equal(initial.products.find((entry) => entry.id === id)?.status, 'available');
    await waitText(owner, '.mg-plugin h4', plugin.name);
  }
  for (const id of ['sit-and-go-manager', 'social-casino-manager']) {
    const plugin = management.plugins.find((entry) => entry.id === id);
    assert.equal(plugin?.implemented, false, 'Planned management must not be advertised as implemented.');
    assert.equal(initial.products.find((entry) => entry.id === id)?.status, 'coming_soon');
    await waitText(owner, '.mg-plugin-planned', plugin.name);
  }
  assert.equal(await owner.$('.mg-publisher-fields'), null, 'Publisher registration unexpectedly accepts an anonymous account.');
  await waitText(owner, '.mg-publisher-account button', 'Intră în cont');
  completed.push('Implemented/planned organizer offers and authenticated publisher onboarding');
  await assertPublicLayout(owner, 1440);
  await screenshot(owner, 'desktop');
  for (const width of [390, 320]) {
    await owner.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await owner.waitForSelector('.mp-product', { visible: true });
    await owner.evaluate(() => { document.querySelector('.marketplace').scrollTop = 0; });
    await assertPublicLayout(owner, width);
    await screenshot(owner, `mobile-${width}`);
    await owner.evaluate(() => document.querySelector('#marketplace-catalog').scrollIntoView());
    await screenshot(owner, `mobile-${width}-catalog`);
  }
  completed.push('Public clean route, refresh and desktop/390px/320px layouts');

  await owner.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  const sample = initial.products[0];
  assert.ok(sample, 'Fixture catalog has no products.');
  await fill(owner, '.mp-search input', sample.name);
  await owner.waitForFunction(() => document.querySelectorAll('.mp-product').length === 1);
  await clickText(owner, '.mp-product h3 button', sample.name);
  await owner.waitForSelector('[role="dialog"]', { visible: true });
  await waitText(owner, '.mp-modal h2', sample.name);
  assert.ok(await owner.$('.mp-modal-signin'), 'Unauthenticated product request should offer login.');
  await owner.keyboard.press('Escape');
  await owner.waitForSelector('[role="dialog"]', { hidden: true });
  assert.equal(await owner.evaluate(() => document.activeElement.textContent.trim()), sample.name, 'Dialog did not restore trigger focus.');
  await fill(owner, '.mp-search input', '');
  await clickText(owner, '.mp-filters button', 'Extensii');
  await owner.waitForFunction(() => Array.from(document.querySelectorAll('.mp-filters button')).some((button) => button.textContent.trim() === 'Extensii' && button.getAttribute('aria-pressed') === 'true'));
  await owner.waitForFunction((expected) => document.querySelectorAll('.mp-product').length === expected, {}, initial.products.filter((p) => p.category === 'extensions').length);
  await clickSelector(owner, '.mp-filters button:first-child');
  completed.push('Search, category filter, product dialog and focus restoration');

  await clickText(owner, '.mp-header-actions button', 'Intră în cont');
  await fill(owner, '#login-id', 'admin');
  await fill(owner, '#login-password', 'admin123');
  await clickSelector(owner, '.login2-cta');
  await owner.waitForSelector('.mp-header-admin', { visible: true });
  assert.match(owner.url(), /marketplace/);
  const adminToken = await owner.evaluate(() => localStorage.getItem('ggpoker.token'));
  assert.ok(adminToken);
  await clickSelector(owner, '.mp-header-admin');
  await owner.waitForSelector('.market-admin .ma-product', { visible: true });
  await screenshot(owner, 'admin');
  await owner.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await owner.waitForSelector('.market-admin .ma-product', { visible: true });
  await screenshot(owner, 'admin-mobile');
  await owner.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await owner.waitForSelector('.market-admin .ma-product', { visible: true });
  completed.push('UI admin login and return to the marketplace');

  const productName = 'CI Marketplace Offer';
  await clickText(owner, '.ma-toolbar button', '＋ Adaugă produs');
  await fillField(owner, 'Numele produsului', productName);
  await fillField(owner, 'Descriere scurtă', 'Isolated browser fixture for the DanGG organizer catalog.');
  await fillField(owner, 'Descriere completă', 'This fixture exists only in a temporary local database during CI.');
  await selectField(owner, 'Categorie', 'tools');
  await clickSelector(owner, '.ma-editor button[type="submit"]');
  await owner.waitForSelector('.ma-editor', { hidden: true });
  await waitText(owner, '.ma-product h3', productName);
  let adminData = await api('/api/admin/marketplace', { token: adminToken });
  let product = adminData.products.find((entry) => entry.name === productName);
  assert.equal(product.status, 'draft');
  assert.ok(!(await api('/api/marketplace')).products.some((entry) => entry.id === product.id));
  await clickInside(owner, '.ma-product', productName, 'Editează');
  await selectField(owner, 'Vizibilitate', 'available');
  await clickSelector(owner, '.ma-editor button[type="submit"]');
  await owner.waitForSelector('.ma-editor', { hidden: true });
  await waitUntil(async () => (await api('/api/marketplace')).products.some((entry) => entry.id === product.id), 'Published product is missing from the public catalog.');
  completed.push('UI product creation, draft isolation and publication persistence');

  await clickSelector(owner, '#ma-tab-content');
  await fillField(owner, 'Titlul paginii', 'CI verified marketplace');
  await clickSelector(owner, '.ma-content-form button[type="submit"]');
  await waitText(owner, '.ma-notice-success', 'Conținutul public a fost salvat.');
  assert.equal((await api('/api/marketplace')).settings.title, 'CI verified marketplace');
  await owner.reload({ waitUntil: 'domcontentloaded' });
  await owner.waitForSelector('#ma-tab-content', { visible: true });
  await clickSelector(owner, '#ma-tab-content');
  const title = await labeledField(owner, 'Titlul paginii');
  assert.equal(await title.evaluate((element) => element.value), 'CI verified marketplace');
  await title.dispose();
  await fillField(owner, 'Titlul paginii', 'Unsaved browser draft');

  // The preview intentionally uses noreferrer/noopener; match its local URL,
  // rather than requiring an opener relationship the browser may suppress.
  const newTarget = browser.waitForTarget((target) => target !== owner.target() && target.type() === 'page' && target.url() === `${base}/marketplace`, { timeout: 15000 });
  await clickSelector(owner, '.ma-header-actions a[target="_blank"]');
  const preview = await (await newTarget).page();
  await preview.waitForSelector('.marketplace', { visible: true });
  assert.equal(await owner.evaluate(() => localStorage.getItem('ggpoker.token')), adminToken, 'Public preview deleted the owner session token.');
  assert.equal(await owner.$eval('.ma-content-form input', (element) => element.value), 'Unsaved browser draft');
  await preview.close(); await owner.bringToFront();
  const backDialog = new Promise((resolve) => owner.once('dialog', async (dialog) => { const text = dialog.message(); await dialog.dismiss(); resolve(text); }));
  await owner.evaluate(() => history.back());
  assert.match(await Promise.race([backDialog, pause(10000).then(() => { throw new Error('Dirty Back guard did not ask before navigation.'); })]), /nesalvate/i);
  await owner.waitForSelector('.ma-content-form', { visible: true });
  assert.equal(await owner.$eval('.ma-content-form input', (element) => element.value), 'Unsaved browser draft');
  await fillField(owner, 'Titlul paginii', 'CI verified marketplace');
  completed.push('Content persistence, new-tab preview and dirty Back protection');

  const memberAuth = await api('/api/auth/register', { method: 'POST', body: { login: 'ci_market_member', nick: 'CI Market Member', password: 'ci-market-fixture-only' } });
  const memberContext = await browser.createBrowserContext();
  const member = await newPage(memberContext);
  await member.evaluateOnNewDocument((token) => {
    localStorage.setItem('ggpoker.token', token);
    sessionStorage.setItem('ggpoker.entered', '1');
  }, memberAuth.token);
  await member.goto(`${base}/marketplace`, { waitUntil: 'domcontentloaded' });
  await member.waitForSelector('#marketplace-account', { visible: true });
  await member.waitForSelector('.mg-publisher-fields', { visible: true });
  await fillField(member, 'Numele editorului', 'CI Publisher Company', '.mg-publisher-fields label');
  await selectField(member, 'Tipul profilului', 'company', '.mg-publisher-fields label');
  await fillField(member, 'Merchant ID NervixPay', 'ci-fixture-merchant', '.mg-publisher-fields label');
  await clickSelector(member, '.mg-publisher-fields button[type="submit"]');
  await waitText(member, '.mg-publisher-account .mg-status', 'Cont în evaluare');
  const publisherAccount = await api('/api/marketplace/publisher', { token: memberAuth.token });
  const publisherId = publisherAccount.publisher.id;
  assert.equal(publisherAccount.publisher.owner_user_id, memberAuth.user.id);
  assert.equal(publisherAccount.publisher.kind, 'company');
  assert.equal(publisherAccount.publisher.status, 'pending');
  assert.equal(publisherAccount.balance.available_cents, 0);
  assert.equal(publisherAccount.submission_enabled, false);
  assert.equal(publisherAccount.checkout_enabled, false);
  await member.reload({ waitUntil: 'domcontentloaded' });
  await waitText(member, '.mg-publisher-account h4', 'CI Publisher Company');
  completed.push('UI publisher registration persists with pending review and isolated commission balance');
  await waitText(member, '.mp-product h3 button', productName);
  await clickText(member, '.mp-product h3 button', productName);
  await fill(member, '.mp-request-form textarea', 'Browser request, held briefly to test dialog ownership.');
  let intercepted;
  await member.setRequestInterception(true);
  member.on('request', (request) => {
    if (request.url() === `${base}/api/marketplace/requests` && request.method() === 'POST') intercepted = request;
    else void request.continue().catch(() => {});
  });
  await clickSelector(member, '.mp-request-form button[type="submit"]');
  await waitUntil(() => Boolean(intercepted), 'Request was not intercepted.');
  await member.keyboard.press('Escape');
  await clickText(member, '.mp-product h3 button', sample.name);
  await fill(member, '.mp-request-form textarea', 'Keep this separate draft');
  await intercepted.continue();
  await waitText(member, '.mp-notice-success', productName);
  assert.equal(await member.$eval('.mp-modal h2', (element) => element.textContent), sample.name);
  assert.equal(await member.$eval('.mp-request-form textarea', (element) => element.value), 'Keep this separate draft');
  await member.keyboard.press('Escape');
  await member.setRequestInterception(false);
  member.removeAllListeners('request');
  await member.reload({ waitUntil: 'domcontentloaded' });
  await waitText(member, '.mp-account-list', productName);
  completed.push('Persistent member request and delayed-response dialog regression');

  currentPage = owner;
  await owner.goto(`${base}/marketplace/admin`, { waitUntil: 'domcontentloaded' });
  await owner.waitForSelector('#ma-tab-requests', { visible: true });
  await clickSelector(owner, '#ma-tab-requests');
  await owner.waitForSelector('.ma-request textarea', { visible: true });
  await fill(owner, '.ma-request textarea', 'Fixture approved for browser verification.');
  await clickInside(owner, '.ma-request', productName, 'Aprobă cererea');
  await owner.select('select[aria-label="Filtrează starea solicitării"]', 'approved');
  await waitText(owner, '.ma-request h3', productName);
  await clickInside(owner, '.ma-request', productName, 'Pregătește accesul ↗');
  await owner.waitForSelector('.ma-grant', { visible: true });
  await clickSelector(owner, '.ma-grant button[type="submit"]');
  await waitText(owner, '.ma-access-entry', productName);
  await waitUntil(async () => (await api('/api/marketplace/me', { token: memberAuth.token })).entitlements.some((entry) => entry.product_id === product.id && entry.status === 'active'), 'Granted access was not persisted.');
  await member.reload({ waitUntil: 'domcontentloaded' });
  await waitText(member, '.mp-account-list .mp-account-status', 'Acordat');
  owner.once('dialog', (dialog) => void dialog.accept());
  await clickInside(owner, '.ma-access-entry', productName, 'Revocă accesul');
  await waitText(owner, '.ma-access-entry .ma-badge', 'Revocat');
  await member.reload({ waitUntil: 'domcontentloaded' });
  await waitText(member, '.mp-account-list .mp-account-status', 'Revocat');
  await screenshot(owner, 'admin-access');
  completed.push('UI approval, grant/revoke and member-visible persisted status');

  const manualProducts = await owner.$$eval('.ma-grant select option', (options) => options.map((option) => option.value));
  assert.ok(manualProducts.includes(product.id), 'The existing manual service grant flow disappeared.');
  assert.ok(managementIds.every((id) => !manualProducts.includes(id)), 'Manual access offers a bypass for paid management plugins.');
  await clickSelector(owner, '#ma-tab-plugins');
  await waitText(owner, '.mg-policy strong', 'Acces plătit obligatoriu');
  await waitText(owner, '.mg-plugin h4', 'Spin & Go Manager');
  await clickSelector(owner, '#ma-tab-finance');
  await waitText(owner, '.mf-list-item', 'CI Publisher Company');
  await selectField(owner, 'Decizia evaluării', 'approved', 'label.mf-field');
  await fillField(owner, 'Motivul deciziei', 'Disposable browser fixture approval.', 'label.mf-field');
  await clickText(owner, '.mf-main button', 'Înregistrează decizia');
  await waitText(owner, '.mf-panel-title .mf-status', 'Aprobat');
  await owner.waitForFunction(() => !document.querySelector('.mf-fieldset')?.disabled);
  await fillField(owner, 'Suma în USD', '20.00', 'label.mf-field');
  await fillField(owner, 'Referința unică a încasării sau ajustării', 'ci-browser-credit-proof', 'label.mf-field');
  await clickSelector(owner, '.mf-check input');
  await clickText(owner, '.mf-main button', 'Înregistrează creditele');
  await waitUntil(async () => (await api('/api/marketplace/publisher', { token: memberAuth.token })).balance.available_cents === 2000, 'UI credit recording did not persist.');
  await owner.waitForFunction(() => !document.querySelector('.mf-fieldset')?.disabled);
  completed.push('Owner plugin enforcement display and UI publisher approval/verified credit recording');

  const spinProduct = initial.products.find((entry) => entry.id === 'spin-and-go-manager');
  await clickSelector(owner, '#ma-tab-catalog');
  await clickInside(owner, '.ma-product', spinProduct.name, 'Editează');
  const pricing = await labeledField(owner, 'Modalitate de tarifare', 'select');
  assert.equal(await pricing.evaluate((element) => Array.from(element.options).some((option) => option.value === 'free')), false);
  await pricing.dispose();
  const currency = await labeledField(owner, 'Monedă', 'select');
  assert.equal(await currency.evaluate((element) => element.value), 'USD');
  assert.equal(await currency.evaluate((element) => element.disabled), true);
  await currency.dispose();
  await selectField(owner, 'Modalitate de tarifare', 'one_time');
  await fillField(owner, 'Preț afișat', '100');
  await clickSelector(owner, '.ma-editor button[type="submit"]');
  await owner.waitForSelector('.ma-editor', { hidden: true });
  await clickSelector(owner, '#ma-tab-finance');
  await waitText(owner, '.mf-list-item', 'CI Publisher Company');
  await commerceStep(owner, 'Oferte');
  await selectField(owner, 'Produsul', spinProduct.id, 'label.mf-field');
  await selectField(owner, 'Editorul aprobat', publisherId, 'label.mf-field');
  await clickText(owner, '.mf-main button', 'Asociază oferta');
  await waitText(owner, '.mf-side .mf-list-item', spinProduct.name);
  await owner.waitForFunction(() => !document.querySelector('.mf-fieldset')?.disabled);
  await commerceStep(owner, 'Comenzi și activări');
  await fillField(owner, 'ID-ul utilizatorului cumpărător', String(memberAuth.user.id), 'label.mf-field');
  await selectField(owner, 'Produsul', spinProduct.id, 'label.mf-field');
  await clickText(owner, '.mf-main button', 'Rezervă comisionul și comanda');
  await waitText(owner, '.mf-panel-title .mf-status', 'Așteaptă plata');
  const commerceData = await api('/api/admin/marketplace/commerce', { token: adminToken });
  const order = commerceData.orders.find((entry) => entry.product_id === spinProduct.id && entry.buyer_user_id === memberAuth.user.id);
  assert.ok(order, 'UI did not create the intended management order.');
  assert.equal(order.price_cents, 10000);
  assert.equal(order.commission_cents, 2000);
  assert.equal(order.status, 'awaiting_payment');
  assert.equal(commerceData.publishers.find((entry) => entry.id === publisherId).balance.available_cents, 0);
  assert.equal(commerceData.publishers.find((entry) => entry.id === publisherId).balance.reserved_cents, 2000);
  completed.push('Management pricing restrictions and UI offer/order reservation with a 20% credit hold');

  currentPage = member;
  await member.goto(`${base}/#/?game=holdem`, { waitUntil: 'domcontentloaded' });
  await clickSelector(member, '.host-table-btn');
  await clickText(member, '.modal .tabs-line button', 'Spin & Go');
  await waitText(member, '.mg-host-access', 'An active paid plugin is required');
  assert.equal(await member.$eval('.modal-foot .btn-gold', (button) => button.disabled), true, 'An unpaid organizer can create Spin & Go.');
  assert.equal(await member.$eval('#host-spin-stake', (select) => select.value), '5000');
  assert.deepEqual(await member.$$eval('#host-spin-stake option', (options) => options.map((option) => option.value)), ['5000', '10000']);
  await member.keyboard.press('Escape');
  await member.waitForSelector('#host-dialog-title', { hidden: true });

  // Fixture-only evidence: these local API calls do not contact NervixPay or move funds.
  const paymentProof = { providerOrderId: 'ci-browser-payment-order', merchantId: 'ci-fixture-merchant', network: 'polygon', token: 'USDC', amountBaseUnits: '100000000' };
  await api(`/api/admin/marketplace/commerce/orders/${order.id}/payment-binding`, { token: adminToken, method: 'POST', body: paymentProof });
  await api('/api/admin/marketplace/commerce/payments/confirm', { token: adminToken, method: 'POST', body: { ...paymentProof, paymentId: 'ci-browser-payment-receipt', paidAt: new Date().toISOString() } });
  assert.equal((await api('/api/marketplace/publisher', { token: memberAuth.token })).balance.available_cents, 0, 'Commission should consume the reserved credits.');
  await clickSelector(member, '.host-table-btn');
  await clickText(member, '.modal .tabs-line button', 'Spin & Go');
  await waitText(member, '.mg-host-access', 'Paid management access active');
  await member.waitForFunction(() => !document.querySelector('.modal-foot .btn-gold')?.disabled);
  await fill(member, '#host-spin-name', 'CI Paid Private Spin');
  await clickText(member, '.modal-foot button', 'Create Spin & Go');
  await waitUntil(async () => (await api('/api/tables/host', { token: memberAuth.token })).tables.some((table) => table.name === 'CI Paid Private Spin'), 'Paid Spin & Go host creation failed.');
  const createdSpin = (await api('/api/tables/host', { token: memberAuth.token })).tables.find((table) => table.name === 'CI Paid Private Spin');
  assert.equal(createdSpin.game, 'spingold');
  assert.equal(createdSpin.seats, 3);
  assert.equal(createdSpin.min_buyin, 5000);
  assert.equal(createdSpin.max_buyin, 5000);
  assert.equal(Boolean((await api('/api/lobby', { token: memberAuth.token })).user.is_admin), false, 'Paid management promoted the organizer to administrator.');
  await member.goto(`${base}/marketplace`, { waitUntil: 'domcontentloaded' });
  await waitText(member, '.mg-plugin .mg-status-active', 'Acces plătit activ');
  await waitText(member, '.mg-publisher-account .mg-status', 'Editor aprobat');
  await screenshot(member, 'organizer-paid-access');
  completed.push('Unpaid host creation is blocked; paid Spin & Go works with zero publisher credits and no admin promotion');

  currentPage = owner;
  await clickText(owner, '.mf-heading button', 'Actualizează');
  await waitText(owner, '.mf-panel-title .mf-status', 'Plătită');
  await screenshot(owner, 'admin-finance');
  assert.deepEqual(pageErrors, [], 'Browser raised uncaught JavaScript errors.');
}

let timeout;
try {
  await Promise.race([run(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Marketplace browser smoke exceeded 180 seconds.')), 180000); })]);
  for (const check of completed) console.log(`PASS ${check}`);
  console.log('Marketplace browser smoke passed against a disposable loopback fixture.');
} catch (error) {
  process.exitCode = 1;
  console.error(error.stack || error.message);
  if (currentPage && !currentPage.isClosed()) {
    const diagnostic = await Promise.race([
      currentPage.evaluate(() => ({
        url: location.href,
        query: document.querySelector('.mp-search input')?.value,
        activeFilter: Array.from(document.querySelectorAll('.mp-filters button')).filter((button) => button.getAttribute('aria-pressed') === 'true').map((button) => button.textContent.trim()),
        cards: Array.from(document.querySelectorAll('.mp-product h3')).map((heading) => heading.textContent.trim()),
        body: document.body.innerText.slice(0, 5000),
      })).catch((failure) => ({ error: failure.message })),
      pause(3000).then(() => ({ error: 'Diagnostic DOM read timed out.' })),
    ]);
    console.error('FIXTURE_DIAGNOSTIC', JSON.stringify({ completed, pageErrors, ...diagnostic }));
    await writeFile(path.join(artifacts, 'failure-diagnostic.json'), JSON.stringify({ completed, pageErrors, ...diagnostic }, null, 2));
  }
  if (currentPage && !currentPage.isClosed()) await screenshot(currentPage, 'failure').catch(() => {});
} finally {
  clearTimeout(timeout);
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ completed, pageErrors, ok: process.exitCode !== 1 }, null, 2));
  await writeFile(path.join(artifacts, 'fixture-server.log'), serverLog);
  if (browser) await browser.close().catch(() => {});
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => server.once('exit', resolve)), pause(3000)]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await rm(temporary, { recursive: true, force: true });
}
