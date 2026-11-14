import puppeteer from 'puppeteer-core';
const BASE = process.argv[2] || 'https://dangg.live';
const OUT = process.argv[3] || '/Users/davidai/Projects/GGPoker-flash/docs/screenshots/live-audit';
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
for (const [w, h] of [[1200, 958], [390, 844]]) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700 });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('ggpoker.welcomeSeen', '1'); });
  await p.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  // Guest entry when the login screen is showing.
  const guest = await p.$('button ::-p-text(Play as guest)').catch(() => null);
  if (guest) { await guest.click().catch(() => {}); await new Promise(r => setTimeout(r, 2500)); }
  const text = (await p.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\n/g, ' | ');
  await p.screenshot({ path: `${OUT}/live-${w}.png` });
  console.log(w, '->', text);
  await p.close();
}
await b.close();
