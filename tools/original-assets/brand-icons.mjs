#!/usr/bin/env node
// Raster derivatives of the repository-authored SVG identity. No remote or supplied images.
// Requires optional asset tooling `sharp` (0.34.x or later); normal app builds use committed files.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const appRequire = createRequire(new URL('../../app/package.json', import.meta.url));
const sharp = appRequire('sharp');
const OUT = fileURLToPath(new URL('../../app/public/openpoker/', import.meta.url));
const jobs = [
  ['icon.svg', 'icon-192.png', 192, 192],
  ['icon.svg', 'icon-512.png', 512, 512],
  ['icon.svg', 'icon-maskable-512.png', 512, 512],
  ['icon.svg', 'apple-touch-icon.png', 180, 180],
  ['social.svg', 'social.png', 1200, 630],
];
if (process.argv.length > 2) throw new Error('Usage: node tools/original-assets/brand-icons.mjs');
for (const [source, output, width, height] of jobs) {
  const input = fs.readFileSync(path.join(OUT, source));
  let render = sharp(input).resize(width, height, { fit: 'contain', background: '#151713' });
  if (output === 'icon-maskable-512.png' || output === 'apple-touch-icon.png') render = render.flatten({ background: '#151713' });
  await render.png().toFile(path.join(OUT, output));
  console.log(`Wrote openpoker/${output} from ${source} (${width}×${height})`);
}
