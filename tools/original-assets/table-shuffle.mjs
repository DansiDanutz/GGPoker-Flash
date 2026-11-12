// chips/native-chip-shuffle.png: a 16×16 grid of 145×165 frames (2320×2640), read by
// app/src/game/potChips.ts shuffleFramePosition (frame n -> cell n-1, row-major). Playback uses
// frames 37..245 with the "combine" sound at 143, so the choreography is:
//   1-36 split one stack into two, 37-90 two stacks rest, 91-142 lean in, 143-182 riffle into
//   one stack, 183-256 the tall stack settles.
import { CHIP_STYLES, chip, clamp, easeInOut, easeOut, lerp, r2, rng, seg, svg } from './table-kit.mjs';

const COLS = 16;
const CELL_W = 145;
const CELL_H = 165;
const HALF = 10; // chips per half-stack; the combined stack has 2*HALF
const RX = 26;
const RY = 10.5;
const THICK = 5.2;
const BASE_Y = CELL_H - 18; // top-face centre of the bottom chip
const SPLIT_DX = 31; // half-stack offset from the cell centre while apart
const CX = CELL_W / 2;

const jitter = (() => {
  const rand = rng(97);
  return Array.from({ length: HALF * 2 }, () => (rand() - 0.5) * 2.4);
})();

/** Positions {x, y, order} of every chip at `frame` (1-based). Left chips 0..9, right 10..19. */
export function chipLayout(frame) {
  const split = easeInOut(seg(frame, 2, 34));
  const lean = easeInOut(seg(frame, 91, 140));
  const riffle = seg(frame, 143, 182);
  const settle = seg(frame, 183, 215);
  const chips = [];
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < HALF; i += 1) {
      const id = side * HALF + i;
      const dir = side ? 1 : -1;
      // Phase 1: one stack (left half at the bottom, right half on top) parts into two.
      const stackedY = BASE_Y - (side * HALF + i) * THICK;
      const apartY = BASE_Y - i * THICK;
      const lift = side ? Math.sin(split * Math.PI) * 26 : 0;
      let x = CX + dir * SPLIT_DX * split;
      let y = lerp(stackedY, apartY, split) - lift;
      // Phase 3: stacks slide closer and lean their tops toward each other.
      const h = i / (HALF - 1);
      x -= dir * (6 * lean + 9 * lean * h);
      y -= 2 * lean * h;
      // Phase 4: chips drop in alternately, bottom first, into one interleaved column.
      const slot = i * 2 + side;
      const k = easeOut(clamp(riffle * 1.6 - (slot / (HALF * 2)) * 0.6));
      x = lerp(x, CX, k);
      y = lerp(y, BASE_Y - slot * THICK, k) - Math.sin(k * Math.PI) * 4;
      // Phase 5: a small decaying wobble as the tall stack settles.
      const wob = riffle >= 1 ? Math.sin(settle * Math.PI * 3) * (1 - settle) * 1.8 * (slot / (HALF * 2)) : 0;
      chips.push({ x: x + wob + jitter[id] * (1 - k * 0.6), y, id });
    }
  }
  return chips.sort((a, b) => b.y - a.y);
}

function frameSvg(frame, ox, oy) {
  const chips = chipLayout(frame);
  const xs = chips.map((c) => c.x);
  const shadowRx = r2(RX + (Math.max(...xs) - Math.min(...xs)) / 2 + 6);
  const body = chips.map((c) => chip(r2(c.x), r2(c.y), RX, RY, THICK, CHIP_STYLES.shuffle)).join('');
  return `<g transform="translate(${ox} ${oy})"><ellipse cx="${CX}" cy="${BASE_Y + THICK + 3}" rx="${shadowRx}" ry="${RY + 2}" fill="#000" opacity=".35"/>${body}</g>`;
}

/** The full sheet as one render job. */
export function shuffleJob() {
  const frames = Array.from({ length: COLS * COLS }, (_, n) => frameSvg(n + 1, (n % COLS) * CELL_W, Math.floor(n / COLS) * CELL_H)).join('');
  return { path: 'chips/native-chip-shuffle.png', w: COLS * CELL_W, h: COLS * CELL_H, html: svg(COLS * CELL_W, COLS * CELL_H, frames) };
}
