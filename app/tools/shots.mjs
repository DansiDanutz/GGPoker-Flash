#!/usr/bin/env node
/**
 * Deterministic screenshot harness for DanGG.
 *
 * Logs in through the real API, seeds the session token into localStorage, then
 * captures the SPA at exact CSS widths so desktop and mobile can be reviewed
 * against the Paper/GGPoker references without a human driving the browser.
 *
 * Usage:
 *   node tools/shots.mjs                         # curated set at 1440 + 390
 *   node tools/shots.mjs --widths 320,390,768,1024,1440
 *   node tools/shots.mjs --routes /,/tournaments --widths 390
 *   node tools/shots.mjs --out docs/screenshots --base http://127.0.0.1:5198
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', 'http://127.0.0.1:5198');
const OUT = path.resolve(arg('out', '../docs/screenshots'));
const widths = arg('widths', '1440,390').split(',').map((w) => Number(w.trim())).filter(Boolean);
const routes = arg('routes', '').split(',').map((r) => r.trim()).filter(Boolean);
const fullPage = process.argv.includes('--full');
const login = arg('login', 'DansiDanutz');
const password = arg('password', 'ggpoker');

const ROUTES = routes.length
  ? routes
  : ['/', '/tournaments', '/casino', '/slots', '/my-page', '/cashier', '/rewards'];

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tokenFor() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login failed: ${res.status} ${JSON.stringify(body)}`);
  return body.token;
}

function slug(route) {
  return route === '/' ? 'lobby' : route.replace(/^\//, '').replace(/[/?=&]+/g, '-');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await tokenFor();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--font-render-hinting=none'],
  });
  const results = [];
  try {
    for (const width of widths) {
      const height = width <= 480 ? 844 : width <= 1024 ? 1024 : 900;
      const mobile = width <= 900;
      const page = await browser.newPage();
      await page.setUserAgent(mobile ? MOBILE_UA : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');
      await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
      await page.evaluateOnNewDocument((t) => {
        localStorage.setItem('ggpoker.token', t);
        localStorage.setItem('ggpoker.welcomeSeen', '1');
        localStorage.removeItem('ggpoker.guest');
        localStorage.setItem('ggpoker.animations', '0');
        sessionStorage.setItem('ggpoker.entered', '1');
      }, token);

      for (const route of ROUTES) {
        const url = `${BASE}/#${route}`;
        const pageErrors = [];
        page.on('pageerror', (e) => { const text = String(e).slice(0, 300); pageErrors.push(text); console.error(`[pageerror ${width}${route}]`, text); });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        try {
          await page.waitForFunction(() => !document.querySelector('.splash') && (document.querySelector('.pshell') || document.querySelector('.app-header') || document.querySelector('.login2')), { timeout: 25000, polling: 150 });
          await page.waitForFunction(
            () => !/Loading lobby|Loading…/.test(document.body.innerText),
            { timeout: 15000, polling: 150 },
          );
        } catch { /* surface stayed busy; capture anyway for the record */ }
        await sleep(800);
        await page.evaluate(() => document.querySelectorAll('.toasts .toast').forEach((n) => { n.style.visibility = 'hidden'; }));
        const name = `${String(width).padStart(4, '0')}-${slug(route)}.png`;
        await page.screenshot({ path: path.join(OUT, name), fullPage });
        const info = await page.evaluate(() => ({
          text: (document.body.innerText || '').slice(0, 80).replace(/\s+/g, ' '),
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          scrollH: document.documentElement.scrollHeight,
        }));
        results.push({ width, route, file: name, pageErrors, ...info });
        console.log(`${name}  overflowX=${info.overflowX}  scrollH=${info.scrollH}  "${info.text}"`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  const overflow = results.filter((r) => r.overflowX > 1);
  const pageErrors = results.filter((r) => r.pageErrors.length);
  console.log(`\n${results.length} shots in ${OUT}`);
  if (pageErrors.length) process.exitCode = 1;
  if (overflow.length) {
    console.log('HORIZONTAL OVERFLOW:');
    for (const r of overflow) console.log(`  ${r.width}px ${r.route} +${r.overflowX}px`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
