// In-game table art for the original DanGG asset set: tables/*, table/*, chips/*, reserved/*.
// Usage (repo root): node tools/original-assets/table.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { OUT, closeRenderer, manifestEntries, renderPng } from './render.mjs';
import { tableJobs } from './table-felts.mjs';
import { hudJobs } from './table-hud.mjs';
import { shuffleJob } from './table-shuffle.mjs';
import { renderWin } from './table-win.mjs';

const PREFIXES = ['table/', 'tables/', 'chips/', 'reserved/'];

function pixelSize(file) {
  const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  return [Number(info.match(/pixelWidth: (\d+)/)[1]), Number(info.match(/pixelHeight: (\d+)/)[1])];
}

/** Every manifest entry in this category must exist at its exact size; returns the failures. */
function verify() {
  return manifestEntries(...PREFIXES).flatMap((e) => {
    try {
      const [w, h] = pixelSize(path.join(OUT, e.path));
      return w === e.width && h === e.height ? [] : [`${e.path}: ${w}x${h}, want ${e.width}x${e.height}`];
    } catch {
      return [`${e.path}: missing`];
    }
  });
}

async function main() {
  const only = process.argv[2];
  const jobs = [...tableJobs(), ...hudJobs(), shuffleJob()].filter((j) => !only || j.path.includes(only));
  for (const j of jobs) await renderPng(j.path, j.html, j.w, j.h);
  if (!only || 'table/native-win'.includes(only)) await renderWin(renderPng, OUT);
  await closeRenderer();
  const failures = verify();
  console.log(`rendered ${jobs.length} images${only ? ` matching "${only}"` : ' + win effect'}`);
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  await closeRenderer();
  process.exitCode = 1;
});
