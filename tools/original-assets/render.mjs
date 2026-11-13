// Shared renderer for the original DanGG asset set: HTML/SVG in, PNG out, via local Chrome.
// No network access: pages must be self-contained (inline SVG/CSS, no external URLs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// puppeteer-core is an app dev dependency; resolve it from app/ since tools/ has no node_modules.
const appRequire = createRequire(new URL('../../app/package.json', import.meta.url));
const puppeteer = appRequire('puppeteer-core');

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../app/public/assets');

/** DanGG palette shared by every generator, so the set reads as one product. */
export const PALETTE = Object.freeze({
  ink: '#070a09', felt: '#0e1714', felt2: '#172a22', feltLight: '#1f3a2e',
  gold: '#d8b15f', goldLight: '#f5dda2', goldDeep: '#9a7432',
  red: '#b32635', red2: '#d33746', green: '#2e9b68', green2: '#55d591',
  text: '#e9e5db', muted: '#99a39b', blue: '#2f6fb3', purple: '#6b4bb3',
});

let browserPromise = null;
const browser = () => (browserPromise ??= puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] }));

/**
 * Render `html` (a full body fragment) at exactly width×height and write a PNG to OUT/relPath
 * (or to relPath itself when it is absolute).
 * The page background is transparent unless the HTML paints one.
 */
export async function renderPng(relPath, html, width, height) {
  const page = await (await browser()).newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}</style></head><body>${html}</body></html>`, { waitUntil: 'load' });
    const file = path.isAbsolute(relPath) ? relPath : path.join(OUT, relPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width, height } });
    return file;
  } finally {
    await page.close();
  }
}

export async function closeRenderer() {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = null;
}

/** Entries of the manifest whose path starts with any of the given prefixes. */
export function manifestEntries(...prefixes) {
  const manifest = JSON.parse(fs.readFileSync(new URL('./manifest.json', import.meta.url)));
  return manifest.filter((e) => prefixes.some((p) => e.path.startsWith(p)));
}
