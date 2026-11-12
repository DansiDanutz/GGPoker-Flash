// Lobby, promo and chrome art generator (chrome/*, login/*, ocean/*, ui/*).
// Run from the repo root: node tools/original-assets/lobby.mjs
// chrome/logo.png is DanGG's own artwork and is intentionally left untouched.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { OUT, closeRenderer, manifestEntries } from './render.mjs';
import { renderChrome } from './lobby/chrome.mjs';
import { renderLogin } from './lobby/login.mjs';
import { renderOcean } from './lobby/ocean.mjs';
import { renderDiscover } from './lobby/discover.mjs';

const OWNED = ['chrome/', 'login/', 'ocean/', 'ui/'];
const SKIP = new Set(['chrome/logo.png']);

/** Read a PNG's pixel size with sips; returns [width, height]. */
function pngSize(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  return ['pixelWidth', 'pixelHeight'].map((k) => Number(out.match(new RegExp(`${k}: (\\d+)`))[1]));
}

function verify() {
  const problems = [];
  const entries = manifestEntries(...OWNED).filter((e) => !SKIP.has(e.path));
  for (const e of entries) {
    try {
      const [w, h] = pngSize(path.join(OUT, e.path));
      if (w !== e.width || h !== e.height) problems.push(`${e.path}: ${w}x${h}, expected ${e.width}x${e.height}`);
    } catch (err) {
      problems.push(`${e.path}: missing or unreadable (${err.message.split('\n')[0]})`);
    }
  }
  return { count: entries.length, problems };
}

try {
  const written = [...await renderChrome(), ...await renderLogin(), ...await renderOcean(), ...await renderDiscover()];
  const { count, problems } = verify();
  console.log(`wrote ${written.length} files; verified ${count} manifest entries`);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await closeRenderer();
}
