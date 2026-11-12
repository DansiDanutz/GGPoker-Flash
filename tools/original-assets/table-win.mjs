// table/native-win-effect.png (46-frame APNG, 30 fps, plays once, as the slot it replaces) and
// table/native-win-final.png (its resting last frame, used when animations are off).
// TablePage shows them as an <img class="native-win"> above the winning seat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PALETTE as P } from './render.mjs';
import { easeOut, goldGradient, r2, rng, seg, svg } from './table-kit.mjs';

const W = 729;
const H = 622;
const FRAMES = 46;
const FPS = 30;
const C = [418, 318]; // badge centre (matches the original's off-centre placement in the canvas)

const SPARKS = (() => {
  const rand = rng(5);
  return Array.from({ length: 14 }, () => ({
    a: rand() * Math.PI * 2, d: 70 + rand() * 70, s: 4 + rand() * 7, t0: 6 + rand() * 24, life: 10 + rand() * 12,
  }));
})();

const star = (x, y, s, o) => `<path d="M${r2(x)} ${r2(y - s)} Q${r2(x)} ${r2(y)} ${r2(x + s)} ${r2(y)} Q${r2(x)} ${r2(y)} ${r2(x)} ${r2(y + s)} Q${r2(x)} ${r2(y)} ${r2(x - s)} ${r2(y)} Q${r2(x)} ${r2(y)} ${r2(x)} ${r2(y - s)} Z" fill="#fff8e1" opacity="${r2(o)}"/>`;

/** One frame at time index f (0..FRAMES-1); the last frame is the resting state. */
export function winFrame(f) {
  const pop = seg(f, 3, 12);
  const scale = f < 3 ? 0 : pop < 1 ? 0.35 + easeOut(pop) * 0.85 : 1.2 - 0.2 * easeOut(seg(f, 12, 18));
  const halo = easeOut(seg(f, 2, 16));
  const burst = seg(f, 0, 10);
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + f * 0.02;
    const len = 60 + 90 * easeOut(burst);
    return `<path d="M${C[0]} ${C[1]} L${r2(C[0] + Math.cos(a - 0.05) * len)} ${r2(C[1] + Math.sin(a - 0.05) * len * 0.62)} L${r2(C[0] + Math.cos(a + 0.05) * len)} ${r2(C[1] + Math.sin(a + 0.05) * len * 0.62)} Z" fill="${P.goldLight}"/>`;
  }).join('');
  const rayOpacity = f < 2 ? 0 : (1 - seg(f, 8, 26)) * 0.35;
  const sparks = SPARKS.map((s) => {
    const k = (f - s.t0) / s.life;
    if (f === FRAMES - 1 || k < 0 || k > 1) return '';
    const x = C[0] + Math.cos(s.a) * s.d * (0.6 + k * 0.4);
    const y = C[1] + Math.sin(s.a) * s.d * 0.55 * (0.6 + k * 0.4);
    return star(x, y, s.s * Math.sin(k * Math.PI), Math.sin(k * Math.PI));
  }).join('');
  const rest = seg(f, 26, 40);
  const resting = [star(C[0] + 104, C[1] - 42, 8 * rest, 0.9 * rest), star(C[0] - 112, C[1] + 26, 5 * rest, 0.7 * rest)].join('');
  const seed = f < 2 ? star(C[0] - 110, C[1], 4 + f * 3, 0.9) : '';
  const badge = scale <= 0 ? '' : `<g transform="translate(${C[0]} ${C[1]}) scale(${r2(scale)})">
      <ellipse cx="0" cy="40" rx="120" ry="16" fill="${P.gold}" opacity=".35" filter="url(#soft)"/>
      <rect x="-104" y="-36" width="208" height="72" rx="36" fill="#0a120f" stroke="url(#gold)" stroke-width="5"/>
      <rect x="-96" y="-29" width="192" height="26" rx="13" fill="#fff" opacity=".06"/>
      <text x="0" y="17" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="50" letter-spacing="6" fill="url(#gold)" stroke="#3b2a10" stroke-width="1.2">WIN</text>
    </g>`;
  return svg(W, H, `<defs>${goldGradient('gold')}
      <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
      <filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>
    <g opacity="${r2(rayOpacity)}" filter="url(#haze)">${rays}</g>
    <ellipse cx="${C[0]}" cy="${C[1] - 4}" rx="${r2(128 * halo)}" ry="${r2(62 * halo)}" fill="none" stroke="${P.goldLight}" stroke-width="7" opacity="${r2(0.55 * halo)}" filter="url(#haze)"/>
    <ellipse cx="${C[0]}" cy="${C[1] - 4}" rx="${r2(128 * halo)}" ry="${r2(62 * halo)}" fill="none" stroke="#fff4d6" stroke-width="1.6" opacity="${r2(0.8 * halo)}"/>
    ${seed}${badge}${sparks}${rest > 0 ? resting : ''}`);
}

/** Renders both files. `renderPng` is injected so this module stays a pure description. */
export async function renderWin(renderPng, outDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dangg-win-'));
  try {
    for (let f = 0; f < FRAMES; f += 1) {
      await renderPng(path.relative(outDir, path.join(tmp, `f${String(f).padStart(2, '0')}.png`)), winFrame(f), W, H);
    }
    fs.copyFileSync(path.join(tmp, `f${FRAMES - 1}.png`), path.join(outDir, 'table/native-win-final.png'));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(tmp, 'f%02d.png'),
      '-pix_fmt', 'rgba', '-plays', '1', '-f', 'apng', path.join(outDir, 'table/native-win-effect.png')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
