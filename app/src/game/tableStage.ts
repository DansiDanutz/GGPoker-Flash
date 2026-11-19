// Table stage: the rail box every table piece is laid out in. The skins share one rail,
// measured in their 1024px source: x 94-929, y 132-585. Seats sit on the rail in stage %.

export const SKIN_RAIL = { left: 94, top: 132, width: 836, height: 454, size: 1024 } as const;
export const RAIL_RATIO = SKIN_RAIL.width / SKIN_RAIL.height;
// Cushion bounds in the supplied 1448 × 1086 Emerald Royale artwork.
export const EMERALD_RAIL_RATIO = 1372 / 614;

export type StageMode = 'wide' | 'portrait';
export type StageBox = { left: number; top: number; width: number; height: number };
export type Spot = readonly [number, number];

const PORTRAIT_MAX_WIDTH = 760;
const SHORT_SCREEN = 520;
const MAX_STAGE_WIDTH = 1400;
const MIN_STAGE_SIDE = 60;
/** Portrait: px the rail may run past each screen edge (none: the oval art has its own rail), gap under the top bar, share of the bottom
 *  button row the rail runs behind, and the height range (x width) the upright skin may stretch to. */
const PORTRAIT_BLEED = 0;
// A fixed notice strip keeps connection/action messages above every seat.
const PORTRAIT_TOP_GAP = 46;
const PORTRAIT_UNDER_BAR = 0.5;
const PORTRAIT_MIN_RATIO = 1.3;
const PORTRAIT_MAX_RATIO = 2.1;
/** Phones: the bottom button row's fixed height (table-phone-layout.css --phone-bar-h). The rail is
 *  sized from this, not the live panel, so the table never jumps when your turn adds a row. */
export const PORTRAIT_ACTION_BAR = 84;

/** Room the seats need around the rail: seats are centred on it and hang over its edge. */
const PADS = {
  wide: { x: (w: number) => Math.max(80, Math.min(150, w * 0.07)), top: 96, bottom: 100 },
  short: { x: () => 90, top: 34, bottom: 16 },
} as const;

export function stageMode(width: number, height: number, desktop = false): StageMode {
  return !desktop && width <= PORTRAIT_MAX_WIDTH && height > width ? 'portrait' : 'wide';
}

/** The largest rail box that fits between the top bar and the action bar with room for seats. */
export function stageBox(opts: { width: number; height: number; topBar: number; actionBar: number; wideRatio?: number; desktop?: boolean }): StageBox {
  const mode = stageMode(opts.width, opts.height, opts.desktop);
  return mode === 'portrait' ? portraitBox(opts) : wideBox(opts);
}

/** Wide screens: the largest rail box between the bars, with room for seats around it. */
function wideBox({ width, height, topBar, actionBar, wideRatio = RAIL_RATIO }: { width: number; height: number; topBar: number; actionBar: number; wideRatio?: number }): StageBox {
  const pads = height < SHORT_SCREEN ? PADS.short : wideRatio === EMERALD_RAIL_RATIO ? { ...PADS.wide, top: 70, bottom: 65 } : PADS.wide;
  const padX = wideRatio === EMERALD_RAIL_RATIO ? Math.max(60, Math.min(pads.x(width), width * 0.12)) : pads.x(width);
  const availW = Math.max(MIN_STAGE_SIDE, width - 2 * padX);
  const availH = Math.max(MIN_STAGE_SIDE, height - topBar - actionBar - pads.top - pads.bottom);
  // Compact desktop windows need deeper felt for stacked runouts between the seats.
  const ratio = wideRatio === EMERALD_RAIL_RATIO && height >= SHORT_SCREEN
    ? Math.min(wideRatio, Math.max(.8, width / 360 - .2)) : wideRatio;
  const w = Math.min(availW, availH * ratio, MAX_STAGE_WIDTH);
  const h = w / ratio;
  return { left: Math.round((width - w) / 2), top: Math.round(topBar + pads.top + (availH - h) / 2), width: Math.round(w), height: Math.round(h) };
}

/**
 * Phones held upright (portrait layout): the oval always fills the screen edge to edge and runs from
 * just under the top bar into the bottom button row. Its height follows the screen, so the skin
 * stretches (TablePage passes the size to CSS) instead of the table shrinking on short screens.
 */
function portraitBox({ width, height, topBar }: { width: number; height: number; topBar: number; actionBar: number }): StageBox {
  const w = Math.max(MIN_STAGE_SIDE, width + 2 * PORTRAIT_BLEED);
  const top = topBar + PORTRAIT_TOP_GAP;
  const reach = height - top - PORTRAIT_ACTION_BAR * (1 - PORTRAIT_UNDER_BAR);
  const h = Math.max(MIN_STAGE_SIDE, Math.min(w * PORTRAIT_MAX_RATIO, Math.max(w * PORTRAIT_MIN_RATIO, reach)));
  return { left: Math.round((width - w) / 2), top: Math.round(top), width: Math.round(w), height: Math.round(h) };
}

// Spots per seat count, hero first, then clockwise. x/y are % of the stage (the rail box).
// Paired top seats sit slightly above the rail to clear diagonal players’ cards.
const WIDE: Record<number, Spot[]> = {
  2: [[50, 100], [50, 0]],
  3: [[50, 100], [11, 22], [89, 22]],
  4: [[50, 100], [0, 50], [50, 0], [100, 50]],
  5: [[50, 100], [3, 76], [21, 8], [79, 8], [97, 76]],
  6: [[50, 100], [3, 76], [11, 22], [50, 0], [89, 22], [97, 76]],
  7: [[50, 100], [1, 66], [8, 26], [31, -3], [69, -3], [92, 26], [99, 66]],
  8: [[50, 100], [19, 97], [1, 64], [8, 26], [50, 0], [92, 26], [99, 64], [81, 97]],
  9: [[50, 100], [19, 97], [1, 64], [8, 26], [31, -3], [69, -3], [92, 26], [99, 64], [81, 97]],
};

// Portrait seats follow the portrait layout: the hero in the bottom-left corner, the others up the side
// rails and across the top (clockwise from the hero), and the bottom-right corner left free for the
// stacked raise presets.
const PORTRAIT: Record<number, Spot[]> = {
  2: [[20, 84], [50, 8]],
  3: [[20, 84], [17, 26], [83, 26]],
  4: [[20, 84], [16, 46], [50, 8], [84, 46]],
  5: [[20, 84], [16, 56], [24, 13], [76, 13], [84, 56]],
  6: [[20, 84], [16, 62], [16, 30], [50, 8], [84, 30], [84, 62]],
  7: [[20, 84], [16, 64], [16, 38], [30, 11], [70, 11], [84, 38], [84, 64]],
  8: [[20, 84], [16, 66], [16, 43], [20, 19], [50, 8], [80, 19], [84, 43], [84, 66]],
  9: [[20, 84], [16, 68], [16, 49], [16, 30], [31, 10], [69, 10], [84, 30], [84, 49], [84, 68]],
}

export function seatLayout(seats: number, mode: StageMode): Spot[] {
  const n = Math.max(2, Math.min(9, Math.round(seats) || 6));
  return (mode === 'portrait' ? PORTRAIT : WIDE)[n];
}

/**
 * A spot `dist` px from a seat toward the stage centre, shifted `side` px to the right of that
 * line (as seen from the seat). Returns stage %. Keeps bets and buttons clear of the seat art.
 */
export function inward(spot: Spot, box: { width: number; height: number }, dist: number, side = 0): [number, number] {
  const sx = (spot[0] / 100) * box.width;
  const sy = (spot[1] / 100) * box.height;
  const vx = box.width / 2 - sx;
  const vy = box.height / 2 - sy;
  const len = Math.hypot(vx, vy) || 1;
  const ux = vx / len;
  const uy = vy / len;
  const px = sx + ux * dist - uy * side;
  const py = sy + uy * dist + ux * side;
  const round = (v: number) => Math.round(v * 10) / 10;
  return [round((px / box.width) * 100), round((py / box.height) * 100)];
}

// Match the inner line in phone-table-3d.svg, in its 400 × 720 viewBox.
const PHONE_LINE = [
  [[200, 78], [262, 78], [292, 88], [296, 132]],
  [[296, 132], [308, 268], [320, 404], [332, 540]],
  [[332, 540], [336, 590], [292, 640], [200, 640]],
  [[200, 640], [108, 640], [64, 590], [68, 540]],
  [[68, 540], [80, 404], [92, 268], [104, 132]],
  [[104, 132], [108, 88], [138, 78], [200, 78]],
].flatMap((curve) => Array.from({ length: 65 }, (_, i): Spot => {
  const t = i / 64, u = 1 - t;
  const at = (axis: number) => u ** 3 * curve[0][axis] + 3 * u ** 2 * t * curve[1][axis]
    + 3 * u * t ** 2 * curve[2][axis] + t ** 3 * curve[3][axis];
  return [at(0) / 4, at(1) / 7.2];
}));

/** Anchor the blind to the painted line, independently of card size or seat content. */
export function phoneBlindSpot(seat: Spot, box: { width: number; height: number }): Spot {
  const distance = (p: Spot) => ((p[0] - seat[0]) * box.width) ** 2 + ((p[1] - seat[1]) * box.height) ** 2;
  return PHONE_LINE.reduce((best, point) => distance(point) < distance(best) ? point : best);
}
