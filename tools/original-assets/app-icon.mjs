// Resize the supplied artwork unchanged for phone/web icons and the macOS ICNS bundle.
// Run from the repo root: node tools/original-assets/app-icon.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const BRAND = path.join(ROOT, 'research/brand');
const SOURCE = path.join(BRAND, 'golden-spade.png');

/** iconutil needs these exact names; each entry is [file, pixel size]. */
const ICONSET = Object.freeze([
  ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32], ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256], ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512], ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
]);

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

const outputs = [
  ['research/brand/AppIcon.png', 1024],
  ['app/public/pwa/spade-192.png', 192],
  ['app/public/pwa/spade-512.png', 512],
  ['app/public/pwa/spade-maskable-512.png', 512],
  ['app/public/pwa/spade-apple-touch.png', 180],
  ['app/public/assets/brand/favicon.png', 64],
];
for (const [file, size] of outputs) {
  execFileSync('sips', ['-z', String(size), String(size), SOURCE, '--out', path.join(ROOT, file)], { stdio: 'ignore' });
}
buildIcns(path.join(BRAND, 'AppIcon.png'));
console.log('Generated phone, web and macOS icons from the supplied golden spade.');
