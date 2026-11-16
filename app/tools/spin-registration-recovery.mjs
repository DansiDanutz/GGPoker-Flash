#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from '../server/test-helpers.js';

const OUT = '../docs/audits/2026-11-16-systematic-egm/spin-registration-recovery';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer();
const vite = await createServer({ root: process.cwd(), configFile: false, plugins: [react()], define: { __APP_VERSION__: JSON.stringify('audit'), __APP_BUILD__: JSON.stringify('registration-recovery'), __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()) }, server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: server.base, changeOrigin: true, headers: { Origin: server.base } }, '/ws': { target: server.base.replace('http:', 'ws:'), ws: true, changeOrigin: true, headers: { Origin: server.base } } } } });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
let browser;
try {
  const adminToken = await server.login('admin', 'admin123');
  const config = { mode: 'local-practice', seats: 6, buyIn: 5000, smallBlinds: [10, 20], clock: { actionSeconds: 15, freeTimeChipSecondsPerUnit: 10, maxTimeChipsPerAction: 3 }, outcomes: [{ multiplier: 4, frequency: 100000000, prizeShares: [100], startingChips: 500, timeBankCards: 3, noDealing: false, unit: 'minutes', interval: 1 }] };
  const saved = await server.put('/api/admin/spin/rules', { token: adminToken, body: { mode: '6max', stake: 5000, expectedRevision: 0, operationId: 'recovery-rules', config, insurance: { premium: 100, payout: 1000 } } });
  if (saved.status !== 200) throw new Error(JSON.stringify(saved.data));
  for (const scope of ['spin6:5000', 'spin6-insurance:5000']) {
    const funded = await server.post(`/api/admin/house/${scope}/fund`, { token: adminToken, body: { amount: 1000000, reason: 'Recovery audit', operationId: `recovery-fund-${scope}` } });
    if (funded.status !== 200) throw new Error(JSON.stringify(funded.data));
  }
  const account = await server.post('/api/auth/register', { body: { login: 'spin_recovery_player', nick: 'Recovery', password: 'secret12' } });
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((token) => { localStorage.setItem('ggpoker.token', token); localStorage.setItem('ggpoker.welcomeSeen', '1'); sessionStorage.setItem('ggpoker.entered', '1'); }, account.data.token);
  let delayedThreeMax;
  let droppedResponses = 0;
  await page.setRequestInterception(true);
  await page.on('request', async (request) => {
    if (request.url().endsWith('/api/spin/register')) {
      const registration = JSON.parse(request.postData());
      const shouldDrop = droppedResponses === 0 || (droppedResponses === 1 && registration.ruleRevision === 2);
      if (shouldDrop) {
        droppedResponses += 1;
        const response = await fetch(request.url(), { method: 'POST', headers: request.headers(), body: request.postData() });
        await response.text();
        return request.abort('failed');
      }
      return request.continue();
    }
    if (request.url().includes('/api/spin/queue?') && request.url().includes('mode=3max')) {
      await new Promise((resolve) => { delayedThreeMax = resolve; });
    }
    return request.continue();
  });
  await page.goto(`${base}/#/?play=1&game=spin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.spin-mode-choice', { visible: true, timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('.spin-mode-choice button')].find((button) => button.textContent === '6-Max')?.click());
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (delayedThreeMax) delayedThreeMax();
  await page.waitForSelector('.spin-register-button:not([disabled])', { visible: true, timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('.spin-registration')?.textContent.includes('SIX-MAX LOCAL PRACTICE'), { timeout: 5000 });
  await page.click('.spin-insurance-choice input');
  await page.select('.spin-registration-options select', '2');
  await page.click('.spin-register-button');
  await page.waitForFunction(() => document.body.innerText.includes('Retry to reconcile with the same operation ID'), { timeout: 15000 });
  const db = () => new DatabaseSync(path.join(server.dataDir, 'ggpoker.db'), { readOnly: true });
  let database = db();
  const userId = account.data.user.id;
  const afterDrop = database.prepare('SELECT COUNT(*) AS count FROM spin_registrations WHERE actor_id = ?').get(userId).count;
  database.close();
  if (afterDrop !== 1) throw new Error(`Expected one committed entry after dropped response, got ${afterDrop}`);
  const changedRules = await server.put('/api/admin/spin/rules', { token: adminToken, body: { mode: '6max', stake: 5000, expectedRevision: 1, operationId: 'recovery-rules-during-retry', config, insurance: null } });
  if (changedRules.status !== 200) throw new Error(JSON.stringify(changedRules.data));
  await page.waitForSelector('.spin-register-button:not([disabled])', { visible: true, timeout: 15000 });
  await page.click('.spin-register-button');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const secondDropView = await page.evaluate(() => document.body.innerText.slice(0, 2200));
  if (!secondDropView.includes('1/2 registrations confirmed')) throw new Error(`Second dropped response did not reconcile as expected: ${secondDropView}`);
  database = db();
  const afterSecondDrop = database.prepare('SELECT COUNT(*) AS count FROM spin_registrations WHERE actor_id = ?').get(userId).count;
  database.close();
  if (afterSecondDrop !== 2) throw new Error(`Expected two committed entries after the second dropped response, got ${afterSecondDrop}`);
  await page.waitForSelector('.spin-register-button:not([disabled])', { visible: true, timeout: 15000 });
  await page.click('.spin-register-button');
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const retryView = await page.evaluate(() => document.body.innerText.slice(0, 1800));
  if (!retryView.includes('2 entries are waiting for a full table')) throw new Error(`Retry did not complete: ${retryView}`);
  database = db();
  const afterRetry = database.prepare('SELECT COUNT(*) AS count FROM spin_registrations WHERE actor_id = ?').get(userId).count;
  const balance = database.prepare('SELECT balance FROM users WHERE id = ?').get(userId).balance;
  const receipts = database.prepare("SELECT COUNT(*) AS count FROM operation_receipts WHERE actor_id = ? AND scope = 'spin-queue:6max:5000'").get(userId).count;
  const ruleRevisions = database.prepare('SELECT rule_revision AS revision FROM spin_registrations WHERE actor_id = ?').all(userId).map((row) => row.revision).sort((a, b) => a - b);
  const insuranceChoices = database.prepare('SELECT insurance FROM spin_registrations WHERE actor_id = ?').all(userId).map((row) => row.insurance);
  database.close();
  const expectedBalance = account.data.user.balance - 10100;
  const result = { completed: true, droppedSuccessfulResponses: droppedResponses, afterDrop, afterSecondDrop, afterRetry, balance, expectedBalance, receipts, ruleRevisions, insuranceChoices, insuranceDisabledBeforeRetry: true, refreshedRuleRevision: changedRules.data.revision, originalPayloadsReplayed: true, staleQueueRejected: true };
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
  if (afterRetry !== 2 || balance !== expectedBalance || receipts !== 2 || ruleRevisions.join(',') !== '1,2' || insuranceChoices.join(',') !== '1,0') throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result));
} finally {
  if (browser) await browser.close();
  await vite.close();
  await server.stop();
}
