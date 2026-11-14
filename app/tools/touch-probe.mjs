#!/usr/bin/env node
/** Reports phone tap-target sizes and the smallest body text on a route. */
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5198';
const ROUTES = (process.argv[2] || '/,/casino,/slots').split(',');
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }) }).then((r) => r.json());
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
for (const route of ROUTES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((t) => { localStorage.setItem('ggpoker.token', t); localStorage.setItem('ggpoker.welcomeSeen', '1'); sessionStorage.setItem('ggpoker.entered', '1'); }, login.token);
  await page.goto(`${BASE}/#${route}`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => !document.querySelector('.splash') && document.querySelector('.pshell'), { timeout: 25000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll('button, a[href], [role="button"], input, select')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (b.height < 44 || b.width < 24) small.push({ h: Math.round(b.height), w: Math.round(b.width), t: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 34), c: el.className });
    }
    let minText = 99; let minSel = '';
    for (const el of document.querySelectorAll('p, li, .page-sub, .pshell span, .phome small, .phome b')) {
      if (!el.textContent || !el.textContent.trim()) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < minText) { minText = fs; minSel = (el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 30); }
    }
    return { small: small.slice(0, 12), totalSmall: small.length, minText, minSel };
  });
  console.log(`${route}: ${r.totalSmall} targets under 44h/24w; min text ${r.minText}px (${r.minSel})`);
  for (const s of r.small) console.log(`   ${s.h}x${s.w} ${s.c || ''} "${s.t}"`);
  await page.close();
}
await browser.close();
