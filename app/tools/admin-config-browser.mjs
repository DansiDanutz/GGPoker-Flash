#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { startServer } from '../server/test-helpers.js';

const OUT = '../docs/audits/2026-11-16-systematic-egm/admin-config-browser';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer();
const vite = await createServer({ root: process.cwd(), configFile: false, plugins: [react()], define: { __APP_VERSION__: JSON.stringify('audit'), __APP_BUILD__: JSON.stringify('admin-config'), __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()) }, server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: server.base, changeOrigin: true, headers: { Origin: server.base } }, '/ws': { target: server.base.replace('http:', 'ws:'), ws: true, changeOrigin: true, headers: { Origin: server.base } } } } });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
let browser;
const errors = [];
try {
  const token = await server.login('admin', 'admin123');
  const account = await server.post('/api/auth/register', { body: { login: 'admin_config_player', nick: 'Config Player', password: 'secret12' } });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setViewport({ width: 1024, height: 900 });
  await page.evaluateOnNewDocument((value) => { localStorage.setItem('ggpoker.token', value); localStorage.setItem('ggpoker.welcomeSeen', '1'); sessionStorage.setItem('ggpoker.entered', '1'); }, token);
  await page.goto(`${base}/#/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.admin-nav', { visible: true, timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('.admin-nav button')].find((button) => button.textContent.includes('Game settings'))?.click());
  await page.waitForSelector('#spin-rules-title', { visible: true, timeout: 20000 });
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('#spin-rules-title')][0].closest('section').querySelector('label.admin-label');
    const select = label.querySelector('select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, '6max');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForSelector('#spin-six-rules-title', { visible: true, timeout: 15000 });
  await page.evaluate(() => {
    const section = document.getElementById('spin-six-rules-title').closest('section');
    const checkbox = section.querySelector('input[type=checkbox]');
    if (!checkbox.checked) checkbox.click();
  });
  for (const [id, value] of [['premium', 100], ['payout', 1000]]) {
    await page.evaluate(({ id, value }) => {
      const input = document.getElementById(`spin-six-${id}`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id, value });
  }
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save 6-Max rules')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('is active for new six-player registrations'), { timeout: 15000 });
  await page.evaluate((accountId) => {
    const input = document.getElementById('push-account-id');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(accountId));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, account.data.user.id);
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === 'Load current grant');
    return button && !button.disabled;
  }, { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Load current grant')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('grant revision 0') || document.body.innerText.includes('Owner role required') || document.body.innerText.includes('Request failed'), { timeout: 10000 }).catch(async () => {
    throw new Error(`Grant load failed: ${await page.evaluate(() => document.body.innerText.slice(-1800))}`);
  });
  if (!await page.evaluate(() => document.body.innerText.includes('grant revision 0'))) throw new Error(`Grant load rejected: ${await page.evaluate(() => document.body.innerText.slice(-1800))}`);
  await page.select('#push-uses', '2');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save replacement grant')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('2 uses remain for account'), { timeout: 10000 });
  const state = await server.get('/api/admin/rooms/nlh-silver-07/push-seat-grant?accountId=' + account.data.user.id, { token });
  const queue = await server.get('/api/spin/queue?mode=6max&stake=5000', { token: account.data.token });
  const geometry = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewport({ width, height: 900 });
    geometry.push(await page.evaluate((width) => ({
      width,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clippedControls: [...document.querySelectorAll('.admin-main input, .admin-main select, .admin-main button')].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > width + 1);
      }).map((element) => element.id || element.textContent.trim().slice(0, 40)),
      overflowingCards: [...document.querySelectorAll('.admin-main .admin-card')].filter((element) => element.scrollWidth - element.clientWidth > 1).length,
    }), width));
    if ([320, 1024].includes(width)) await page.screenshot({ path: path.join(OUT, `admin-${width}.png`) });
  }
  const result = { completed: true, sixRuleRevision: queue.data.state.ruleRevision, sixComplete: queue.data.state.complete, insurance: queue.data.state.insurance, pushSeat: state.data.state, geometry, errors };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (!result.sixComplete || result.pushSeat.remaining !== 2 || errors.length || geometry.some((row) => row.overflowX > 1 || row.clippedControls.length || row.overflowingCards)) throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} finally {
  if (browser) await browser.close();
  await vite.close();
  await server.stop();
}
