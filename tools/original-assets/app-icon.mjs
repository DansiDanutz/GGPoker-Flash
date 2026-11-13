// macOS app icon for the DanGG desktop app: research/brand/AppIcon.png and AppIcon.icns.
// Run from the repo root: node tools/original-assets/app-icon.mjs
// The mark is the gold GG (with its red flick) from Dan's own DanGG wordmark
// (research/brand/gg-mark.png), on a flat pure-black tile like the T3 Code icon. The tile follows the macOS icon grid: an 824 px rounded
// square centred in the 1024 px canvas, with the drop shadow in the transparent margin.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeRenderer, renderPng } from './render.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const BRAND = path.join(ROOT, 'research/brand');
const MARK = path.join(BRAND, 'gg-mark.png');
const CANVAS = 1024;
const TILE = 824;
const RADIUS = 185;
const MARK_WIDTH = 712;

/** iconutil needs these exact names; each entry is [file, pixel size]. */
const ICONSET = Object.freeze([
  ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32], ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256], ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512], ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
]);

function iconHtml(markDataUri) {
  const inset = (CANVAS - TILE) / 2;
  return `<div style="position:absolute;left:${inset}px;top:${inset}px;width:${TILE}px;height:${TILE}px;border-radius:${RADIUS}px;overflow:hidden;
      background: #000;
      box-shadow: 0 14px 26px rgba(0,0,0,.42), 0 2px 5px rgba(0,0,0,.35), inset 0 0 0 2px rgba(255,255,255,.06);">
    <img src="${markDataUri}" style="position:absolute;left:50%;top:50%;width:${MARK_WIDTH}px;transform:translate(-50%,-52%);
      filter:brightness(1.12) saturate(1.08);" />
  </div>`;
}

function buildIcns(png) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-icon-'));
  const iconset = path.join(dir, 'AppIcon.iconset');
  fs.mkdirSync(iconset);
  try {
    for (const [name, size] of ICONSET) {
      execFileSync('sips', ['-z', String(size), String(size), png, '--out', path.join(iconset, name)], { stdio: 'ignore' });
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(BRAND, 'AppIcon.icns')]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

try {
  const mark = `data:image/png;base64,${fs.readFileSync(MARK).toString('base64')}`;
  const png = await renderPng(path.join(BRAND, 'AppIcon.png'), iconHtml(mark), CANVAS, CANVAS);
  buildIcns(png);
  console.log(`wrote ${path.relative(ROOT, png)} and research/brand/AppIcon.icns`);
} finally {
  await closeRenderer();
}
