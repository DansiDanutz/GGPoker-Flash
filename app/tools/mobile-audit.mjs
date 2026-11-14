#!/usr/bin/env node
/**
 * Acceptance audit for the owner's mobile checklist.
 * Checks hero height (<=30dvh), CTA visibility/size, dot hit areas, the
 * persistent balance bar, the For You rail (snap + peek + fade) and overflow.
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5198';
const WIDTHS = (process.argv[2] || '320,390,430').split(',').map(Number);
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }),
}).then((r) => r.json());

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
let failures = 0;
for (const width of WIDTHS) {
  const page = await browser.newPage();
  const height = width <= 360 ? 780 : 844;
  await page.setViewport({ width, height, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((t) => {
    localStorage.setItem('ggpoker.token', t);
    localStorage.setItem('ggpoker.welcomeSeen', '1');
    sessionStorage.setItem('ggpoker.entered', '1');
  }, login.token);
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction(() => !document.querySelector('.splash') && document.querySelector('.phome'), { timeout: 25000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const hero = document.querySelector('.p-hero');
    const cta = document.querySelector('.p-hero-cta');
    const dots = [...document.querySelectorAll('.p-hero-dots span')];
    const rail = document.querySelector('.p-rail');
    const cards = [...document.querySelectorAll('.p-rail-card')];
    const wallet = document.querySelector('.p-wallet');
    const nav = document.querySelector('.mobile-nav');
    const scroller = document.querySelector('.phome');
    const rect = (el) => el && el.getBoundingClientRect();
    const before = {
      heroH: rect(hero)?.height, vh: innerHeight,
      cta: rect(cta) && { top: rect(cta).top, bottom: rect(cta).bottom, left: rect(cta).left, right: rect(cta).right, h: rect(cta).height },
      dot: dots[0] && { w: rect(dots[0]).width, h: rect(dots[0]).height },
      dotButtons: document.querySelectorAll('.p-hero-dots button').length,
      rail: rail && { sw: rail.scrollWidth, cw: rail.clientWidth, snap: getComputedStyle(rail).scrollSnapType, mask: getComputedStyle(rail).maskImage || getComputedStyle(rail).webkitMaskImage },
      peek: cards[1] ? rect(cards[1]).left < innerWidth : false,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      walletTopBefore: rect(wallet)?.top,
      navBottom: rect(nav) ? innerHeight - rect(nav).bottom : null,
      safeBottom: getComputedStyle(nav).paddingBottom,
    };
    if (scroller) scroller.scrollTop = 500;
    return {
      ...before,
      walletTopAfter: rect(wallet)?.top,
      topbarTop: rect(document.querySelector('.p-topbar'))?.top,
    };
  });
  const checks = {
    'hero<=30dvh': r.heroH / r.vh <= 0.30 + 1e-9,
    'cta>=44': !!r.cta && r.cta.h >= 44,
    'cta-visible': !!r.cta && r.cta.left >= 0 && r.cta.right <= width && r.cta.top >= 0 && r.cta.bottom <= height,
    'dots-indicators': !!r.dot && r.dotButtons === 0 && r.dot.w <= 20,
    'rail-snap': !!r.rail && /mandatory/.test(r.rail.snap),
    'rail-peek': !!r.peek,
    'rail-fade': !!r.rail && /gradient/.test(r.rail.mask || ''),
    'no-overflow': r.overflowX === 0,
    'balance-persistent': r.walletTopBefore === r.walletTopAfter && r.walletTopAfter >= 0 && r.topbarTop === 0,
    'nav-safe-area': /px/.test(r.safeBottom || ''),
  };
  const bad = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (bad.length) failures++;
  console.log(`${width}x${height}  hero=${Math.round(r.heroH)}px (${((r.heroH / r.vh) * 100).toFixed(1)}%)  cta=${r.cta?.h}px  dots=${r.dot?.w}x${r.dot?.h} indicators  ${bad.length ? 'FAIL: ' + bad.join(', ') : 'PASS'}`);
  await page.close();
}
await browser.close();
process.exitCode = failures ? 1 : 0;
