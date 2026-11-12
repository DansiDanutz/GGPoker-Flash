// Renders the original DanGG table effects to animated WebP files in app/public/assets/fx/.
// Run from the repo root: node tools/original-assets/effects.mjs
// Frames come from headless Chrome (render.mjs); cwebp + webpmux (libwebp) assemble them.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OUT, closeRenderer, renderPng } from './render.mjs';
import { chipShuffle, mysteryBox, spinIntro, spinWin, winEffect } from './fx-scenes.mjs';

const FPS = 20;
const QUALITY = '65';
const ALPHA_QUALITY = 40; // default; effects with headroom raise it to avoid glow banding
const MAX_BYTES = 600 * 1024;

/** name -> scene, pixel size and length. Durations must match app/src/fx.ts. */
const EFFECTS = Object.freeze([
// `design` is the scene's drawing space; frames are rasterised at `width`x`height` (SVG scales).
  { name: 'spin_intro', scene: spinIntro, design: [640, 360], width: 512, height: 288, seconds: 2.5 },
  { name: 'spin_win', scene: spinWin, design: [480, 480], width: 360, height: 360, seconds: 2.0 },
  { name: 'mystery_box', scene: mysteryBox, design: [360, 490], width: 288, height: 392, seconds: 2.5, alphaQuality: 75 },
  { name: 'win_effect', scene: winEffect, design: [480, 270], width: 400, height: 225, seconds: 1.5, alphaQuality: 75 },
  { name: 'chip_shuffle', scene: chipShuffle, design: [400, 300], width: 400, height: 300, seconds: 2.0, alphaQuality: 75 },
]);

/** Rasterise the scene's root <svg> at the output size; its viewBox keeps the design coordinates. */
const sized = (svg, width, height) => svg.replace(/^<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${width}" height="${height}"`);

async function renderFrames(effect, dir) {
  const count = Math.round(effect.seconds * FPS);
  const files = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const file = path.join(dir, `frame${String(i).padStart(3, '0')}.png`);
    const svg = sized(effect.scene(t, ...effect.design), effect.width, effect.height);
    await renderPng(path.relative(OUT, file), svg, effect.width, effect.height);
    files.push(file);
  }
  return files;
}

/**
 * Encode each frame with cwebp (lossy colour, lossy alpha) and mux them into one animation.
 * img2webp only offers lossless alpha, which made the soft glows 2-3x larger.
 */
function encode(files, target, alphaQuality = ALPHA_QUALITY) {
  const delay = Math.round(1000 / FPS);
  const frameArgs = files.flatMap((png) => {
    const webp = png.replace(/\.png$/, '.webp');
    execFileSync('cwebp', ['-quiet', '-q', QUALITY, '-alpha_q', String(alphaQuality), '-alpha_filter', 'best', '-m', '6', png, '-o', webp]);
    // +duration+x+y+mode-blend: dispose to background, no blending, so each frame replaces the last.
    return ['-frame', webp, `+${delay}+0+0+1-b`];
  });
  // -loop 1 plays once; the last frame is fully transparent, so holding it is invisible.
  // A transparent background colour keeps dispose-to-background frames see-through everywhere.
  execFileSync('webpmux', [...frameArgs, '-loop', '1', '-bgcolor', '0,0,0,0', '-o', target], { stdio: 'pipe' });
}

async function main() {
  const only = process.argv.slice(2);
  const fxDir = path.join(OUT, 'fx');
  fs.mkdirSync(fxDir, { recursive: true });
  const report = [];
  try {
    for (const effect of EFFECTS.filter((e) => !only.length || only.includes(e.name))) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dangg-fx-${effect.name}-`));
      try {
        const files = await renderFrames(effect, tmp);
        const target = path.join(fxDir, `${effect.name}.webp`);
        encode(files, target, effect.alphaQuality);
        const bytes = fs.statSync(target).size;
        if (bytes > MAX_BYTES) console.warn(`warning: ${effect.name}.webp is ${bytes} bytes (> ${MAX_BYTES})`);
        report.push({ file: `fx/${effect.name}.webp`, size: `${effect.width}x${effect.height}`, frames: files.length, fps: FPS, kb: Math.round(bytes / 1024) });
      } finally {
        if (!process.env.KEEP_FX_FRAMES) fs.rmSync(tmp, { recursive: true, force: true });
        else console.log(`frames kept in ${tmp}`);
      }
    }
  } finally {
    await closeRenderer();
  }
  console.table(report);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
