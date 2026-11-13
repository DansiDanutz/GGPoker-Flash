#!/usr/bin/env node
/**
 * Keyboard + reflow probe.
 *
 * Walks the tab order on a route at phone and desktop widths, then re-checks the
 * page at 200% zoom (the WCAG 1.4.10 reflow case) and reports overflow.
 *
 * Usage: node tools/a11y-probe.mjs [--routes /slots,/casino] [--widths 390,1440]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5198';
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const ROUTES = arg('routes', '/,/slots,/casino').split(',').map((s) => s.trim()).filter(Boolean);
const WIDTHS = arg('widths', '390,1440').split(',').map(Number);
const STOPS = Number(arg('stops', '16'));

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
}).then((r) => r.json());

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
let failures = 0;
try {
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: width < 700 ? 844 : 900, isMobile: width < 700, hasTouch: width < 700 });
      await page.evaluateOnNewDocument((t) => {
        localStorage.setItem('ggpoker.token', t);
        localStorage.setItem('ggpoker.welcomeSeen', '1');
        sessionStorage.setItem('ggpoker.entered', '1');
        localStorage.setItem('ggpoker.animations', '0');
      }, login.token);
      await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
      await page.waitForFunction(() => !document.querySelector('.splash'), { timeout: 20000 }).catch(() => {});
      const stops = [];
      for (let i = 0; i < STOPS; i++) {
        await page.keyboard.press('Tab');
        stops.push(await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return { tag: 'BODY', label: '', visible: true, outline: 'x' };
          const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 46),
            visible: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
            outline: `${cs.outlineStyle} ${cs.outlineWidth}`,
          };
        }));
      }
      const offscreen = stops.filter((x) => x.visible === false).length;
      const unlabelled = stops.filter((x) => x.tag !== 'BODY' && !x.label).length;
      const noOutline = stops.filter((x) => x.tag !== 'BODY' && x.outline === 'none 0px').length;
      const reflow = await page.evaluate(() => {
        const before = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        document.body.style.zoom = '2';
        const after = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        document.body.style.zoom = '';
        return { before, after };
      });
      const bad = offscreen + unlabelled + noOutline + (reflow.after > 1 ? 1 : 0);
      if (bad) failures++;
      console.log(`${route} @${width}px  stops=${STOPS} offscreen=${offscreen} unlabelled=${unlabelled} noOutline=${noOutline}  overflow=${reflow.before}px  zoom200%=+${reflow.after}px  ${bad ? 'FAIL' : 'ok'}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
process.exitCode = failures ? 1 : 0;
