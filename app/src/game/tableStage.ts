// Table stage: the rail box every table piece is laid out in. The skins share one rail,
// measured in their 1024px source: x 94-929, y 132-585. Seats sit on the rail in stage %.

export const SKIN_RAIL = { left: 94, top: 132, width: 836, height: 454, size: 1024 } as const;
export const RAIL_RATIO = SKIN_RAIL.width / SKIN_RAIL.height;

export type StageMode = 'wide' | 'portrait';
export type StageBox = { left: number; top: number; width: number; height: number };
export type Spot = readonly [number, number];

const PORTRAIT_MAX_WIDTH = 760;
const SHORT_SCREEN = 520;
const MAX_STAGE_WIDTH = 1400;
const MIN_STAGE_SIDE = 60;
/** Portrait: px the rail may run past each screen edge, gap under the top bar, share of the action bar it may run behind. */
const PORTRAIT_BLEED = 10;
const PORTRAIT_TOP_GAP = 6;
const PORTRAIT_UNDER_BAR = 0.45;
/** Phones: the action panel's fixed height (table-phone.css --phone-bar-h). The rail is sized
 *  from this, not the live panel, so the table never jumps when your turn adds or removes a row. */
export const PORTRAIT_ACTION_BAR = 184;

/** Room the seats need around the rail: seats are centred on it and hang over its edge. */
const PADS = {
  wide: { x: (w: number) => Math.max(80, Math.min(150, w * 0.07)), top: 96, bottom: 100 },
  short: { x: () => 90, top: 34, bottom: 16 },
} as const;

export function stageMode(width: number, height: number): StageMode {
  return width <= PORTRAIT_MAX_WIDTH && height > width ? 'portrait' : 'wide';
}

/** The largest rail box that fits between the top bar and the action bar with room for seats. */
export function stageBox(opts: { width: number; height: number; topBar: number; actionBar: number }): StageBox {
  const mode = stageMode(opts.width, opts.height);
  return mode === 'portrait' ? portraitBox(opts) : wideBox(opts);
}

/** Wide screens: the largest rail box between the bars, with room for seats around it. */
function wideBox({ width, height, topBar, actionBar }: { width: number; height: number; topBar: number; actionBar: number }): StageBox {
  const pads = height < SHORT_SCREEN ? PADS.short : PADS.wide;
  const padX = pads.x(width);
  const availW = Math.max(MIN_STAGE_SIDE, width - 2 * padX);
  const availH = Math.max(MIN_STAGE_SIDE, height - topBar - actionBar - pads.top - pads.bottom);
  const w = Math.min(availW, availH * RAIL_RATIO, MAX_STAGE_WIDTH);
  const h = w / RAIL_RATIO;
  return { left: Math.round((width - w) / 2), top: Math.round(topBar + pads.top + (availH - h) / 2), width: Math.round(w), height: Math.round(h) };
}

/**
 * Phones held upright (GGPoker mobile): the rail fills the screen edge to edge and runs from just
 * under the top bar down behind the action bar; seats sit on the felt, not around it.
 */
function portraitBox({ width, height, topBar }: { width: number; height: number; topBar: number; actionBar: number }): StageBox {
  const actionBar = PORTRAIT_ACTION_BAR;
  const availW = width + 2 * PORTRAIT_BLEED;
  const availH = Math.max(MIN_STAGE_SIDE, height - topBar - PORTRAIT_TOP_GAP - actionBar * (1 - PORTRAIT_UNDER_BAR));
  const w = Math.max(MIN_STAGE_SIDE, Math.min(availW, availH / RAIL_RATIO));
  const h = w * RAIL_RATIO;
  return { left: Math.round((width - w) / 2), top: Math.round(topBar + PORTRAIT_TOP_GAP), width: Math.round(w), height: Math.round(h) };
}

// Spots per seat count, hero first, then clockwise. x/y are % of the stage (the rail box).
const WIDE: Record<number, Spot[]> = {
  2: [[50, 100], [50, 0]],
  3: [[50, 100], [11, 22], [89, 22]],
  4: [[50, 100], [0, 50], [50, 0], [100, 50]],
  5: [[50, 100], [3, 76], [21, 8], [79, 8], [97, 76]],
  6: [[50, 100], [3, 76], [11, 22], [50, 0], [89, 22], [97, 76]],
  7: [[50, 100], [1, 66], [8, 26], [31, 1], [69, 1], [92, 26], [99, 66]],
  8: [[50, 100], [19, 97], [1, 64], [8, 26], [50, 0], [92, 26], [99, 64], [81, 97]],
  9: [[50, 100], [19, 97], [1, 64], [8, 26], [31, 1], [69, 1], [92, 26], [99, 64], [81, 97]],
};

// Portrait seats sit on the felt like GGPoker mobile: hugging the side rails, hero just above the action bar.
const PORTRAIT: Record<number, Spot[]> = {
  2: [[50, 79], [50, 9]],
  3: [[50, 79], [13, 26], [87, 26]],
  4: [[50, 79], [12, 50], [50, 9], [88, 50]],
  5: [[50, 79], [12, 60], [17, 17], [83, 17], [88, 60]],
  6: [[50, 79], [12, 62], [12, 27], [50, 9], [88, 27], [88, 62]],
  7: [[50, 79], [12, 68], [12, 42], [22, 13], [78, 13], [88, 42], [88, 68]],
  8: [[50, 79], [16, 78], [11, 53], [13, 28], [50, 9], [87, 28], [89, 53], [84, 78]],
  9: [[50, 79], [16, 78], [11, 55], [12, 32], [27, 11], [73, 11], [88, 32], [89, 55], [84, 78]],
};

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
