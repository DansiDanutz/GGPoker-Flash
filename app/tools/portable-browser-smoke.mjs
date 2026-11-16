#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Real Chrome clients against a disposable native server, or the CI-only Docker room.
// External mode requires the installer's private, run-specific loopback configuration.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const mode = process.argv[2] || 'native';
assert.ok(['native', 'seed', 'verify'].includes(mode) && process.argv.length <= 3, 'Use native, seed or verify.');
const appDir = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'openpoker-portable-smoke-'));
const artifacts = path.join(appDir, 'artifacts', 'portable-browser');
await mkdir(artifacts, { recursive: true });
const stateFile = process.env.E2E_STATE_FILE || path.join(temporary, 'fixture.json');
const expectedName = process.env.E2E_EXPECT_NAME || 'OpenPoker';
const expectedCommit = process.env.E2E_EXPECT_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appDir, encoding: 'utf8' }).trim();
assert.match(expectedCommit, /^[a-f0-9]{40}$/);
let base;
let password;
let server;
let serverExited;
let browser;
let currentPage;
const browserErrors = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(check, description, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await pause(80); }
  throw new Error(description);
}

function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { /* Try the next installed browser. */ }
  }
  throw new Error('Chrome/Chromium is required; CHROME_PATH may select the executable.');
}

async function configureFixture() {
  if (mode === 'native') {
    assert.ok(!process.env.E2E_BASE_URL, 'Native mode starts its own disposable server.');
    const profile = JSON.parse(await readFile(path.join(appDir, 'dist/site.json'), 'utf8'));
    assert.equal(profile.profile, 'portable', 'Build with OPENPOKER_PROFILE=portable first.');
    assert.equal(profile.name, expectedName);
    password = randomBytes(32).toString('hex');
    return;
  }
  assert.ok(path.isAbsolute(process.env.OPENPOKER_ENV_FILE || ''), 'An absolute installer env path is required.');
  assert.ok(path.isAbsolute(process.env.E2E_STATE_FILE || ''), 'An absolute private fixture state path is required.');
  const fields = Object.fromEntries((await readFile(process.env.OPENPOKER_ENV_FILE, 'utf8')).split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
      const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
    }));
  // This is deliberately not a generic URL/credential-based production test runner.
  assert.match(fields.OPENPOKER_PROJECT || '', /^openpoker-ci-[a-z0-9_-]+$/);
  const url = new URL(process.env.E2E_BASE_URL);
  assert.equal(url.protocol, 'http:'); assert.equal(url.hostname, 'localhost');
  assert.equal(url.port, fields.OPENPOKER_PORT);
  assert.equal(url.href, `${url.origin}/`);
  assert.equal(url.username + url.password, '');
  assert.equal(fields.OPENPOKER_SITE_ORIGIN, url.origin);
  assert.equal(fields.GIT_SHA, expectedCommit);
  assert.match(fields.GGPOKER_ADMIN_PASSWORD || '', /^[a-f0-9]{64}$/);
  assert.equal((await stat(process.env.OPENPOKER_ENV_FILE)).mode & 0o077, 0, 'The installer env must be private.');
  base = url.origin;
  password = fields.GGPOKER_ADMIN_PASSWORD;
}

async function startNative() {
  let output = '';
  const env = { ...process.env };
  delete env.GGPOKER_DEV;
  for (const key of Object.keys(env)) if (key.startsWith('OPENPOKER_')) delete env[key];
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: appDir,
    env: { ...env, NODE_ENV: 'production', PORT: '0', GGPOKER_BIND: '127.0.0.1',
      GGPOKER_DATA: path.join(temporary, 'data'), GGPOKER_SEED_DEMO: '0',
      GGPOKER_ADMIN_PASSWORD: password, GGPOKER_ADMIN_ALLOW: '127.0.0.1/32',
      GGPOKER_PUBLIC_ORIGIN: '', GGPOKER_ADMIN_ORIGIN: '', GGPOKER_ALLOWED_HOSTS: '', GGPOKER_TRUST_PROXY: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverExited = new Promise((resolve) => server.once('exit', resolve));
  server.stdout.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  server.stderr.on('data', (chunk) => { output = (output + chunk).slice(-12000); });
  await waitUntil(() => {
    if (server.exitCode !== null) throw new Error(`Isolated server exited with code ${server.exitCode}.`);
    const listening = output.match(/LISTENING (\d+)/);
    if (!listening) return false;
    base = `http://127.0.0.1:${listening[1]}`;
    return true;
  }, 'Isolated production server did not start.');
}

async function stopNative() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  const timer = setTimeout(() => server.kill('SIGKILL'), 10000);
  await serverExited;
  clearTimeout(timer);
}

async function waitHealthy() {
  await waitUntil(async () => {
    try { return (await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(1000) })).ok; }
    catch { return false; }
  }, 'The isolated installation did not become healthy.', 60000);
}

async function api(endpoint, { token, method = 'GET', body } = {}) {
  assert.ok(endpoint.startsWith('/api/'));
  const response = await fetch(base + endpoint, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  assert.ok(response.ok, `${method} ${endpoint} failed (${response.status}): ${result.error || 'request rejected'}`);
  return result;
}

async function newClient() {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.on('pageerror', (error) => browserErrors.push(error.message));
  const client = { context, page, state: null, ended: null };
  // Observe the application's real socket traffic; all player actions use visible UI.
  const protocol = await page.createCDPSession();
  await protocol.send('Network.enable');
  protocol.on('Network.webSocketFrameReceived', ({ response }) => {
    try {
      const message = JSON.parse(response.payloadData);
      if (message.type === 'state') {
        client.state = message.state;
        if (message.state.street === 'ended') client.ended = message.state;
      }
    } catch { /* Non-JSON protocol traffic is not an application state. */ }
  });
  currentPage = page;
  return client;
}

async function click(page, selector) {
  const element = await page.waitForSelector(selector, { visible: true });
  await element.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await element.click();
  await element.dispose();
}

async function authenticate(client, account, register = false) {
  const { page } = client;
  await page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-id', { visible: true });
  if (register) await click(page, '.login2-tabs button:last-child');
  await page.type('#login-id', account.login);
  if (register) await page.type('#login-nick', account.nick);
  await page.type('#login-password', account.password);
  await click(page, '.login2-cta');
  await page.waitForFunction(() => localStorage.getItem('ggpoker.token') && sessionStorage.getItem('ggpoker.entered') === '1');
  client.token = await page.evaluate(() => localStorage.getItem('ggpoker.token'));
  const { user } = await api('/api/me', { token: client.token });
  assert.equal(user.login, account.login);
  assert.equal(user.nick, account.nick);
  client.id = user.id;
  return user;
}

async function verifyIdentity(page) {
  const brand = await api('/api/brand');
  assert.equal(brand.profile, 'portable'); assert.equal(brand.name, expectedName);
  assert.equal(brand.supportEmail, '');
  const version = await (await fetch(`${base}/version.json`)).json();
  assert.equal(version.commit, expectedCommit);
  assert.equal(version.source, `https://github.com/OpenPoker4all/OpenPoker/tree/${expectedCommit}`);
  const health = await (await fetch(`${base}/healthz`)).json();
  assert.equal(health.commit, expectedCommit);
  assert.equal(await page.title(), expectedName);
  const offer = await page.$eval('a[href*="/tree/"]', (node) => node.href);
  assert.equal(offer, version.source);
  for (const [source, output] of [['../LICENSE', 'LICENSE'], ['../LICENSES/MIT-legacy.txt', 'MIT-legacy.txt'], ['../THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.txt']]) {
    const response = await fetch(`${base}/legal/${output}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), await readFile(path.resolve(appDir, source), 'utf8'));
  }
  const manifestPath = await page.$eval('link[rel="manifest"]', (node) => node.getAttribute('href'));
  const manifest = await (await fetch(new URL(manifestPath, base))).json();
  assert.equal(manifest.name, expectedName); assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const size = await page.evaluate(async (src) => {
      const image = new Image(); image.src = src; await image.decode();
      return `${image.naturalWidth}x${image.naturalHeight}`;
    }, icon.src);
    assert.equal(size, icon.sizes);
  }
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  const publicCatalog = await api('/api/marketplace');
  assert.equal(publicCatalog.products.length, 0, 'A new independent room must not inherit the operator marketplace catalog.');
}

async function seed() {
  const admin = (await api('/api/auth/login', { method: 'POST', body: { login: 'admin', password } })).token;
  assert.ok(admin, 'Configured administrator can log in.');
  const suffix = randomBytes(5).toString('hex');
  const tableId = `portable-${suffix}`;
  await api('/api/admin/tables', { token: admin, method: 'POST', body: {
    id: tableId, name: 'OpenPoker installation test', game: 'holdem', sb: 50, bb: 100,
    min_buyin: 2000, max_buyin: 4000, seats: 2, action_seconds: 60,
  } });
  const accounts = [0, 1].map((i) => ({ login: `portable${i}_${suffix}`, nick: `Player ${i + 1}`, password: randomBytes(20).toString('hex') }));
  const clients = [await newClient(), await newClient()];
  try {
    await clients[0].page.goto(`${base}/#/login`, { waitUntil: 'domcontentloaded' });
    await clients[0].page.waitForSelector('#login-id', { visible: true });
    await verifyIdentity(clients[0].page);
    await clients[0].page.screenshot({ path: path.join(artifacts, 'portable-login.png'), fullPage: true });
    for (const [index, client] of clients.entries()) {
      await authenticate(client, accounts[index], true);
      accounts[index].id = client.id;
      await client.page.goto(`${base}/#/table/${tableId}?observe=1`, { waitUntil: 'domcontentloaded' });
      await client.page.waitForSelector('button[aria-label="Take seat"]', { visible: true });
    }
    // Reserve both chairs before buying in, so an automatic bot cannot take one.
    await click(clients[0].page, 'button[aria-label="Take seat"]');
    await clients[0].page.waitForSelector('.buyin-dialog', { visible: true });
    await clients[1].page.waitForFunction(() => document.querySelectorAll('button[aria-label="Take seat"]').length === 1);
    await click(clients[1].page, 'button[aria-label="Take seat"]');
    await clients[1].page.waitForSelector('.buyin-dialog', { visible: true });
    for (const client of clients) await click(client.page, '.buyin-dialog .modal-foot .btn-red:not([disabled])');
    await waitUntil(() => clients.every((c) => c.state?.street === 'preflop' && c.state.players.filter((p) => !p.empty && !p.isBot && p.inHand).length === 2), 'The two human clients were not dealt into one hand.');
    const handNo = clients[0].state.handNo;
    for (const [index, client] of clients.entries()) {
      await client.page.screenshot({ path: path.join(artifacts, `portable-player-${index + 1}.png`), fullPage: true });
      await click(client.page, '[aria-label="Table menu"]');
      await click(client.page, '[title="Cash out automatically when this hand ends"]');
      await waitUntil(() => client.state?.players.find((p) => p.isMe)?.leaveAfterHand === true, 'Cash-out after the hand was not acknowledged.');
    }
    // Check/call all streets through the application's action buttons to showdown.
    let actions = 0;
    while (!clients[0].ended && actions < 16) {
      const state = clients[0].state;
      assert.equal(state.handNo, handNo);
      const acting = clients.find((c) => c.id === state.actor);
      assert.ok(acting, 'A human client must hold the turn.');
      await waitUntil(() => acting.state?.handNo === handNo && acting.state?.turnNo === state.turnNo && acting.state?.actor === acting.id, 'The acting browser did not receive its current turn.');
      await acting.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await click(acting.page, '.act-call:not([disabled]),.act-check:not([disabled])');
      actions += 1;
      await waitUntil(() => clients[0].ended || clients[0].state?.turnNo !== state.turnNo || clients[0].state?.street !== state.street, 'A UI action did not advance the hand.');
    }
    assert.ok(clients[0].ended, 'The full hand must finish.');
    assert.equal(clients[0].ended.handNo, handNo);
    assert.equal(clients[0].ended.board.length, 5, 'A complete board must reach showdown.');
    const hands = [];
    for (const [index, client] of clients.entries()) {
      await waitUntil(() => !client.state?.players.some((p) => p.isMe), 'Leaving after the hand did not cash out.');
      const history = (await api('/api/hands', { token: client.token })).hands;
      const hand = history.find((h) => h.tableId === tableId && h.handNo === handNo);
      assert.ok(hand, 'Both players must receive the completed hand history.');
      assert.equal(hand.players.length, 2);
      hands.push(hand.id);
      accounts[index].balance = (await api('/api/me', { token: client.token })).user.balance;
      await client.page.goto(`${base}/#/hand-history`, { waitUntil: 'domcontentloaded' });
      await client.page.waitForFunction(() => document.body.innerText.includes('OpenPoker installation test'));
    }
    assert.equal(hands[0], hands[1], 'Both clients must refer to the same persisted hand.');
    await clients[0].page.screenshot({ path: path.join(artifacts, 'portable-hand-history.png'), fullPage: true });
    await writeFile(stateFile, JSON.stringify({ accounts, handId: hands[0], tableId, expectedCommit, expectedName }), { flag: 'wx', mode: 0o600 });
    console.log(`Portable smoke: two UI registrations, two reserved seats, ${actions} UI actions, complete showdown and cash-out verified.`);
  } catch (error) {
    for (const [index, client] of clients.entries()) {
      await client.page.screenshot({ path: path.join(artifacts, `portable-failure-${index + 1}.png`), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally { for (const client of clients) await client.context.close(); }
}

async function verify() {
  assert.equal((await stat(stateFile)).mode & 0o077, 0, 'Fixture credentials must stay private.');
  const saved = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(saved.expectedCommit, expectedCommit); assert.equal(saved.expectedName, expectedName);
  for (const [index, account] of saved.accounts.entries()) {
    const client = await newClient();
    try {
      const user = await authenticate(client, account);
      assert.equal(user.id, account.id); assert.equal(user.balance, account.balance);
      const history = (await api('/api/hands', { token: client.token })).hands;
      assert.ok(history.some((hand) => hand.id === saved.handId && hand.tableId === saved.tableId));
      await client.page.goto(`${base}/#/hand-history`, { waitUntil: 'domcontentloaded' });
      await client.page.waitForFunction(() => document.body.innerText.includes('OpenPoker installation test'));
      if (index === 0) await client.page.screenshot({ path: path.join(artifacts, 'portable-after-restart.png'), fullPage: true });
    } finally { await client.context.close(); }
  }
  const brand = await api('/api/brand'); assert.equal(brand.name, expectedName);
  const health = await (await fetch(`${base}/healthz`)).json(); assert.equal(health.commit, expectedCommit);
  console.log('Portable smoke: fresh browser logins after restart preserve both player IDs, balances, hand history, branding and source revision.');
}

try {
  await configureFixture();
  if (mode === 'native') await startNative();
  await waitHealthy();
  browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, pipe: true,
    userDataDir: path.join(temporary, 'browser'), args: ['--disable-dev-shm-usage', '--no-first-run'] });
  if (mode !== 'verify') await seed();
  if (mode === 'native') { await stopNative(); await startNative(); await waitHealthy(); }
  if (mode !== 'seed') await verify();
  assert.deepEqual(browserErrors, [], 'Browser runtime errors must be resolved.');
} catch (error) {
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(artifacts, 'portable-failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await stopNative();
  await rm(temporary, { recursive: true, force: true });
}
