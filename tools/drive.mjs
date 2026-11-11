import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://localhost:5199';
const OUT = 'research/screens';
fs.mkdirSync(OUT, { recursive: true });

const login = await fetch('http://127.0.0.1:5198/api/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
}).then((r) => r.json());

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1240,1000', '--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1240, height: 1000 },
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()); });
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message));

await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await page.evaluate((token, user) => {
  localStorage.setItem('ggpoker.token', token);
  localStorage.setItem('ggpoker.user', JSON.stringify(user));
}, login.token, login.user);
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/clone_lobby_logged.png` });
console.log('lobby shot');

// open the first table
await page.evaluate(() => {
  const row = document.querySelector('.table-row');
  row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));
const join = await page.$('.mini-actions .btn-red');
await join?.click();
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/clone_buyin.png` });
const confirm = await page.$('.modal-foot .btn-red');
await confirm?.click();
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${OUT}/clone_table.png` });
console.log('table shot, url:', page.url());

// wait for my turn and act
for (let i = 0; i < 30; i++) {
  const turn = await page.evaluate(() => document.querySelector('.act-check:not(:disabled), .act-call:not(:disabled)') != null);
  if (turn) break;
  await new Promise((r) => setTimeout(r, 700));
}
await page.screenshot({ path: `${OUT}/clone_table_turn.png` });
const checkBtn = await page.$('.act-check:not(:disabled)');
if (checkBtn) await checkBtn.click();
else {
  const callBtn = await page.$('.act-call:not(:disabled)');
  if (callBtn) await callBtn.click();
}
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}/clone_table_after.png` });
console.log('acted');

await browser.close();
