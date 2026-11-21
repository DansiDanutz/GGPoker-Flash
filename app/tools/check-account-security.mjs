// Run after building the app. All accounts and sessions belong to the temporary fixture.
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { startServer } from '../server/test-helpers.js';

const server = await startServer({ env: { GGPOKER_BIND: '127.0.0.1' } });
let browser;
try {
  const other = await server.login('admin', 'admin123');
  assert.ok(other);
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--disable-background-networking'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  await page.setViewport({ width: 1440, height: 900 });
  let rejectDelete = true;
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(server.base + '/')) return r.abort();
    if (rejectDelete && r.method() === 'DELETE' && r.url().startsWith(server.base + '/api/sessions')) {
      return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"Temporary failure"}' });
    }
    return r.continue();
  });
  await page.goto(server.base);
  await page.waitForSelector('.ls-content:not([inert]) #login-id');
  for (const [selector, value] of [['#login-id', 'admin'], ['#login-password', 'admin123']]) {
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(selector, value);
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.hash === '#/' && !document.querySelector('#login-id'));
  await page.evaluate(() => { location.hash = '/my-page?tab=security'; });
  const visible = text => page.waitForFunction(s => document.body.textContent.includes(s), {}, text);
  await visible('Account security');
  await page.waitForSelector('.ls-content:not([inert])');
  const fields = await page.$$('input[type=password]');
  await fields[0].type('wrong-password');
  await fields[1].type('fixture-password');
  const click = label => page.$$eval('button', (buttons, name) => buttons.find(b => b.textContent.trim() === name).click(), label);
  await click('Change password');
  await visible('Password change failed');
  assert.equal(await fields[1].evaluate(e => e.value), 'fixture-password');
  await click('Revoke');
  await visible('Could not revoke device');
  await click('Sign out others');
  await visible('Could not sign out other devices');
  assert.equal((await server.get('/api/sessions', { token: other })).status, 200);
  rejectDelete = false;
  await click('Sign out others');
  await visible('Signed out other devices');
  assert.equal((await server.get('/api/sessions', { token: other })).status, 401);
  await fields[0].evaluate(el => { el.focus(); el.select(); });
  await page.keyboard.press('Backspace');
  await fields[0].type('admin123');
  await click('Change password');
  await visible('Password updated');
  assert.ok(await server.login('admin', 'fixture-password'));
  console.log('PASS: failed password change, failed individual and bulk revocation, successful bulk revocation and password change');
} finally {
  await browser?.close();
  await server.stop();
  await rm(server.dataDir, { recursive: true, force: true });
}
