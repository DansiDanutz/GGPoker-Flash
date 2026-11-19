#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { startServer } from '../server/test-helpers.js';

assert.equal(process.argv.length, 2, 'This smoke accepts no external URL.');
const appDir = path.resolve(import.meta.dirname, '..');
const checks = [], errors = [];
let srv, web, browser;
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
});

try {
  const webPort = await freePort();
  srv = await startServer({ env: { GGPOKER_SEED_DEMO: '0', GGPOKER_PUBLIC_ORIGIN: `http://127.0.0.1:${webPort}`, ORGANIZER_NERVIXPAY_CONNECTIONS: '{}', NERVIXPAY_API_KEY: '' } });
  const call = (method, route, token, body, key) => srv[method](route, { token, body, headers: key ? { 'idempotency-key': key } : undefined });
  const guest = (await call('post', '/api/auth/guest', null, {})).data;
  assert.equal((await call('get','/api/account/nervixpay',guest.token)).status,403);
  assert.equal((await call('post','/api/account/nervixpay/connect',guest.token,{merchantId:'11111111-1111-4111-8111-111111111111',mode:'live'})).status,403);
  checks.push('Actual guest sessions cannot access or start NervixPay connections');
  assert.ok(guest.token);
  const before = guest.user.balance;
  const cashChipsBefore = (await call('get', '/api/marketplace/chips/me', guest.token)).data.balances;
  const once = await call('post', '/api/cashier/deposit', guest.token, { amount: 5000, method: 'free-play-money' }, 'cashier-smoke');
  assert.equal(once.status, 200);
  const retry = await call('post', '/api/cashier/deposit', guest.token, { amount: 5000, method: 'free-play-money' }, 'cashier-smoke');
  assert.equal(retry.data.replayed, true);
  assert.equal(retry.data.balance, before + 5000);
  assert.equal((await call('post', '/api/cashier/deposit', guest.token, { amount: 100001 }, 'over-limit')).status, 400);
  assert.equal((await call('get', '/api/cashier', guest.token)).data.depositLimits.max, 100000);
  assert.deepEqual((await call('get', '/api/marketplace/chips/me', guest.token)).data.balances, cashChipsBefore);
  checks.push('Guest top-up succeeds once, replays safely, and enforces the 100,000 cap');

  web = await createServer({ root: appDir, configFile: path.join(appDir, 'vite.config.ts'), envDir: srv.dataDir, cacheDir: path.join(srv.dataDir, 'vite'),
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    server: { host: '127.0.0.1', port: webPort, strictPort: true, open: false, proxy: { '/api': { target: srv.base, changeOrigin: true }, '/ws': { target: srv.base.replace('http:', 'ws:'), ws: true, changeOrigin: true } } } });
  await web.listen();
  const url = web.resolvedUrls.local[0];
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.CHROME_PATH || (existsSync(mac) ? mac : execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim());
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  let page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(token => { localStorage.setItem('ggpoker.token', token); sessionStorage.setItem('ggpoker.entered', '1'); localStorage.setItem('ggpoker.welcomeSeen', '1'); }, guest.token);

  for (const width of [1440, 390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, isMobile: width < 500, hasTouch: width < 500 });
    await page.goto(`${url}#/cashier`);
    await page.waitForSelector('#play-money-title');
    const result = await page.evaluate(() => ({ text: document.querySelector('.cashier-win')?.textContent || '', overflow: document.documentElement.scrollWidth - innerWidth,
      withdraw: document.body.textContent?.includes('Withdraw'), fake: /Visa|Mastercard|Apple Pay|Bank Card/.test(document.body.textContent || '') }));
    assert.match(result.text, /Add Play Money/);
    assert.match(result.text, /no cash value/i);
    assert.match(result.text, /50\.00 Play Money/);
    assert.match(result.text, /Organizer Cash Chips/);
    assert.match(result.text, /DiamondsSign in to view/);
    assert.equal(result.withdraw, false);
    assert.equal(result.fake, false);
    assert.ok(result.overflow <= 1, `overflow at ${width}`);
    checks.push(`Current Cashier source fits ${width}px without fake payment choices`);
  }
  await page.evaluate(() => [...document.querySelectorAll('.cashier-tabs [role="tab"]')].find(button => button.textContent === 'History')?.click());
  await page.waitForSelector('.cashier-history');
  assert.doesNotMatch(await page.$eval('.cashier-history', node => node.textContent), /USD|Bank transfer|Instant bank/);
  assert.match(await page.$eval('.cashier-history', node => node.textContent), /Play Money/);
  checks.push('Legacy USD ledger entries display as Play Money without fake bank payment labels');
  await page.evaluate(() => [...document.querySelectorAll('.cashier-tabs [role="tab"]')].find(button => button.textContent === 'NervixPay')?.click());
  await page.waitForSelector('#cashier-nervixpay');
  const guestText = await page.$eval('#cashier-nervixpay', node => node.textContent);
  assert.match(guestText, /Sign in to a permanent DanGG account/);
  assert.match(guestText, /Free Play Money needs no payment account/);
  checks.push('Guest sees permanent-account guidance without losing free Play Money access');

  const registered = (await call('post', '/api/auth/register', null, { login: 'cashier_smoke', nick: 'Cashier Smoke', password: 'secret12' })).data;
  const registeredBefore = (await call('get', '/api/cashier', registered.token)).data.balance;
  await page.close();
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(token => { localStorage.setItem('ggpoker.token', token); sessionStorage.setItem('ggpoker.entered', '1'); localStorage.setItem('ggpoker.welcomeSeen', '1'); }, registered.token);
  const registeredCashier = (await call('get', '/api/cashier', registered.token)).data;
  let connectionStage = 'pending';
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/cashier') {
      request.respond({status:200,contentType:'application/json',body:JSON.stringify({...registeredCashier,transactions:[
        {id:1,kind:'satellite',currency:'TICKET',amount:1,balance_after:2,memo:'Ticket prize',created_at:'2026-11-19'},
        {id:2,kind:'award',currency:'GEM',amount:25,balance_after:40,memo:'Gem prize',created_at:'2026-11-19'},
        {id:3,kind:'deposit',currency:'USD',amount:5000,balance_after:7500,created_at:'2026-11-19'}
      ]})});
    } else if (new URL(request.url()).pathname.startsWith('/api/account/nervixpay')) {
      if (request.method() === 'POST') connectionStage = 'verified';
      const status = connectionStage;
      request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, hasRecord: true, status,
        merchantId: '00000000-0000-4000-8000-000000000001', mode: 'test', userCode: status === 'pending' ? 'TEST-CODE' : null,
        verificationUri: status === 'pending' ? 'https://nervixpay.live/integrations' : null, expiresAt: status === 'pending' ? '2099-01-01T00:00:00.000Z' : null,
        credentialExpiresAt: status === 'verified' ? '2099-01-01T00:00:00.000Z' : null, nextPollAt: null, lastError: null }) });
    } else request.continue();
  });
  await page.goto(`${url}#/cashier`);
  await page.waitForSelector('#play-money-title');
  await page.evaluate(() => [...document.querySelectorAll('.cashier-tabs [role="tab"]')].find(button => button.textContent === 'NervixPay')?.click());
  await page.waitForFunction(() => document.querySelector('#cashier-nervixpay')?.textContent?.includes('Waiting for your approval'));
  assert.match(await page.$eval('#cashier-nervixpay', node => node.textContent), /TEST-CODE/);
  await page.evaluate(() => [...document.querySelectorAll('#cashier-nervixpay button')].find(button => button.textContent === 'Check approval')?.click());
  await page.waitForFunction(() => document.querySelector('#cashier-nervixpay')?.textContent?.includes('Account connected'));
  assert.match(await page.$eval('#cashier-nervixpay', node => node.textContent), /Test connection only/);
  assert.equal((await call('get', '/api/cashier', registered.token)).data.balance, registeredBefore);
  checks.push('Mocked NervixPay approval advances pending to verified test mode without adding Play Money');
  await page.evaluate(() => [...document.querySelectorAll('.cashier-tabs [role="tab"]')].find(button => button.textContent === 'History')?.click());
  await page.waitForSelector('.cashier-history');
  const history = await page.$eval('.cashier-history',node=>node.textContent);
  assert.match(history,/1(?:\.00)? TICKET/); assert.doesNotMatch(history,/0\.01 TICKET/);
  assert.match(history,/25(?:\.00)? GEM/); assert.match(history,/50\.00 Play Money/);
  await page.evaluate(()=>{ URL.createObjectURL=blob=>{window.__exportBlob=blob;return 'blob:test-export';}; HTMLAnchorElement.prototype.click=()=>{};});
  await page.evaluate(()=>document.querySelector('.cashier-export').click());
  await page.waitForFunction(()=>!!window.__exportBlob);
  const csv=await page.evaluate(()=>window.__exportBlob.text());
  assert.match(csv,/"TICKET","1","2"/); assert.match(csv,/"GEM","25","40"/); assert.match(csv,/"Play Money","50","75"/);
  checks.push('History and CSV preserve whole tickets/gems and cent-based Play Money');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errors }));
} finally {
  await browser?.close();
  await web?.close();
  await srv?.stop();
  if (srv) await rm(srv.dataDir, { recursive: true, force: true });
}
