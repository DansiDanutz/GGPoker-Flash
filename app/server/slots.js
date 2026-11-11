// Server-authoritative 5x3 slot machine with 10 fixed paylines.
import { randomInt } from 'node:crypto';

const SYMBOLS = ['cherry', 'lemon', 'bell', 'star', 'diamond', 'seven', 'clover', 'wild'];
const WEIGHTS = [26, 24, 18, 12, 9, 6, 4, 1];
const TOTAL_WEIGHT = WEIGHTS.reduce((a, b) => a + b, 0);
const WILD = 'wild';
const REELS = 5;
const ROWS = 3;
const MIN_MATCH = 3;

// Multipliers of the per-line stake for 3, 4 and 5 of a kind.
// Tuned so the long-run return is about 95% (verified by a simulation test).
export const PAYTABLE = Object.freeze({
  cherry: [7, 22, 75], lemon: [8, 30, 95], bell: [15, 50, 185], star: [22, 90, 370],
  diamond: [45, 185, 900], seven: [110, 550, 3700], clover: [75, 370, 1850], wild: [185, 1100, 9000],
});

export const PAYLINES = Object.freeze([
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 0, 1, 2, 1],
]);

const cryptoRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

function pickSymbol(random) {
  let r = random() * TOTAL_WEIGHT;
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= WEIGHTS[i];
    if (r < 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

/**
 * Evaluate one payline. Wilds substitute for the first regular symbol on the line;
 * a line of nothing but wilds pays as wilds.
 * @param {string[]} line the five symbols along the payline, left to right
 * @returns {{ symbol: string, count: number, multiplier: number } | null}
 */
export function evaluateLine(line) {
  const symbol = line.find((s) => s !== WILD) ?? WILD;
  let count = 0;
  for (const s of line) {
    if (s !== symbol && s !== WILD) break;
    count++;
  }
  if (count < MIN_MATCH) return null;
  return { symbol, count, multiplier: PAYTABLE[symbol][count - MIN_MATCH] };
}

/**
 * @param {number} bet total stake for the spin, split evenly across the paylines
 * @param {() => number} [random] uniform [0, 1) source; defaults to the OS CSPRNG
 * @returns {{ grid: string[][], lines: object[], win: number }}
 */
export function spinSlots(bet, random = cryptoRandom) {
  const grid = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => pickSymbol(random)));
  const lineStake = bet / PAYLINES.length;
  const lines = [];
  PAYLINES.forEach((rows, index) => {
    const symbols = rows.map((row, reel) => grid[reel][row]);
    const hit = evaluateLine(symbols);
    if (!hit) return;
    lines.push({ line: index, symbols, count: hit.count, amount: Math.floor(lineStake * hit.multiplier) });
  });
  return { grid, lines, win: lines.reduce((a, l) => a + l.amount, 0) };
}
