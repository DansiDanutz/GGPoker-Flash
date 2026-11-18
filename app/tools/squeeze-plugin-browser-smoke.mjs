// Disposable UI rehearsal. Billing responses are fixtures; ledger/authorization use server tests.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { startSandbox } from './contributor-sandbox.mjs';
const artifacts = path.resolve(process.env.ARTIFACTS_DIR || 'artifacts/squeeze-plugin');
await mkdir(artifacts, { recursive: true });
const sandbox = await startSandbox();
let browser;
try {
  const registration = await fetch(sandbox.api + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'squeeze_ui_test', nick: 'Squeeze UI', password: 'Disposable123!' }) });
  assert.equal(registration.status, 200);
  const player = await registration.json();
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome'), headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [], purchases = [];
  let active = false, failFirstResponse = true, rejectAuthOnce = true, otherToken = '', activePlan = 'monthly', loseLifetimeResponse = true;
  const account = () => ({ product: { id: 'squeeze-3d', prices: { monthly_cents: 100, lifetime_cents: 1000 } }, entitlement: { active, plan: active ? activePlan : null, expires_at: active && activePlan === 'monthly' ? '2099-12-01T00:00:00Z' : null }, purchases_enabled: true, service_credit_balance_cents: active ? 900 : 1000 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname === '/api/marketplace/squeeze-3d/account') return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(req.headers().authorization === `Bearer ${otherToken}` ? { ...account(), entitlement: { active: false, plan: null, expires_at: null }, service_credit_balance_cents: 0 } : account()) });
    if (url.pathname === '/api/marketplace/squeeze-3d/purchase') {
      purchases.push(JSON.parse(req.postData())); active = true; activePlan = purchases.at(-1).plan;
      if (activePlan === 'lifetime' && loseLifetimeResponse) { loseLifetimeResponse = false; return req.abort('failed'); }
      if (failFirstResponse) { failFirstResponse = false; return req.abort('failed'); }
      if (rejectAuthOnce) { rejectAuthOnce = false; return req.respond({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication expired' }) }); }
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(account()) });
    }
    return req.continue();
  });
  const authScript = await page.evaluateOnNewDocument(token => {
    localStorage.setItem('ggpoker.token', token); localStorage.setItem('ggpoker.welcomeSeen', '1'); sessionStorage.setItem('ggpoker.entered', '1');
  }, player.token);
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(sandbox.url + '/#/marketplace');
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin')?.textContent.includes('Service credits: $10.00'));
  const click = text => page.evaluate(text => {
    const button = [...document.querySelectorAll('#squeeze-3d-plugin button')].find(b => b.textContent.includes(text));
    if (!button || button.disabled) throw Error(`Button unavailable: ${text}`);
    button.click();
  }, text);
  assert.equal(await page.$eval('#squeeze-3d-plugin button[aria-pressed="true"]', b => b.textContent), 'Use free default');
  await click('Enable free Play Money preview');
  assert.equal(purchases.length, 0, 'Preview never purchases');
  await click('Use free default');
  await click('Buy one month');
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin [role="alert"]'));
  assert.equal(purchases.length, 1);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin')?.textContent.includes('Service credits: $9.00'));
  await click('Renew one month');
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin [role="alert"]')?.textContent.includes('Authentication expired'));
  await click('Renew one month');
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin')?.textContent.includes('purchased and selected'));
  assert.equal(purchases.length, 3);
  assert.equal(purchases[1].idempotencyKey, purchases[2].idempotencyKey, 'Auth failure retains the ambiguous transaction key');
  assert.equal(purchases[0].idempotencyKey, purchases[1].idempotencyKey, 'Lost response and page reload retry the same transaction');
  assert.equal(await page.$eval('#squeeze-3d-plugin button[aria-pressed="true"]', b => b.textContent), 'Use 3D squeeze');
  await click('Use free default');
  assert.equal(purchases.length, 3, 'Switching to default never charges');
  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844 });
    await page.$eval('#squeeze-3d-plugin', n => n.scrollIntoView());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Marketplace must fit phone width');
    await page.screenshot({ path: path.join(artifacts, `marketplace-${width}.png`) });
  }
  await click('Buy lifetime');
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin [role="alert"]'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin')?.textContent.includes('Lifetime access active'));
  await click('Confirm lifetime purchase');
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin')?.textContent.includes('purchased and selected'));
  assert.equal(purchases.length, 5);
  assert.equal(purchases[3].idempotencyKey, purchases[4].idempotencyKey, 'Lifetime access after a lost response retains its confirmation control');
  const second = await fetch(sandbox.api + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'squeeze_ui_other', nick: 'Squeeze Other', password: 'Disposable123!' }) });
  const other = await second.json(); otherToken = other.token;
  await page.removeScriptToEvaluateOnNewDocument(authScript.identifier);
  await page.evaluate(token => { localStorage.setItem('ggpoker.token', token); }, otherToken);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#squeeze-3d-plugin')?.textContent.includes('Service credits: $0.00'));
  assert.equal(await page.$eval('#squeeze-3d-plugin button[aria-pressed="true"]', b => b.textContent), 'Use free default', 'Second account does not inherit paid selection');
  assert.ok(await page.$eval('#squeeze-3d-plugin', n => n.textContent.includes('No active paid access')));
  assert.equal(purchases.length, 5);
  assert.deepEqual(errors, []);
  const result = { ok: true, checks: ['free default', 'preview without charge', 'monthly purchase', 'lost response/reload preserves idempotency key', 'auth failure preserves retry key', 'lifetime lost-response confirmation', 'second account isolation', 'switch back without charge', '390/320px marketplace'], errors };
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify(result, null, 2));
  console.log(result);
} finally { await browser?.close(); await sandbox.close(); }
