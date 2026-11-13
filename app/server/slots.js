// Server-authoritative 5x3 slot machine with 10 fixed paylines.
//
// One engine, several real games: each catalogue entry has its own symbol
// weights (volatility), paytable scale (return) and bet ladder. The default game
// keeps the original math so existing behaviour and tests are unchanged.
import { randomInt } from 'node:crypto';

const SYMBOLS = ['cherry', 'lemon', 'bell', 'star', 'diamond', 'seven', 'clover', 'wild'];
const BASE_WEIGHTS = [26, 24, 18, 12, 9, 6, 4, 1];
const WILD = 'wild';
const REELS = 5;
const ROWS = 3;
const MIN_MATCH = 3;

// Multipliers of the per-line stake for 3, 4 and 5 of a kind.
// Tuned so the long-run return of the default game is about 95% (simulation test).
const BASE_PAYTABLE = Object.freeze({
  cherry: [7, 22, 75], lemon: [8, 30, 95], bell: [15, 50, 185], star: [22, 90, 370],
  diamond: [45, 185, 900], seven: [110, 550, 3700], clover: [75, 370, 1850], wild: [185, 1100, 9000],
});

export const PAYTABLE = BASE_PAYTABLE;

export const PAYLINES = Object.freeze([
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 0, 1, 2, 1],
]);

const cryptoRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

function scalePaytable(scale) {
  const out = {};
  for (const [symbol, pays] of Object.entries(BASE_PAYTABLE)) {
    out[symbol] = pays.map((p) => Math.max(1, Math.round(p * scale)));
  }
  return Object.freeze(out);
}

const GAME_DEFS = [
  {
    id: 'olympus-gold', name: 'Olympus Gold', tagline: 'Fruits, bells and one golden wild',
    badge: 'CLASSIC', accent: '#f2c45c', volatility: 'Medium', tags: ['classic', 'hot'],
    bets: [50, 100, 500, 1000], weights: BASE_WEIGHTS, scale: 1,
    glyphs: { cherry: '🍒', lemon: '🍋', bell: '🔔', star: '⭐', diamond: '💎', seven: '7️⃣', clover: '🍀', wild: '🃏' },
  },
  {
    id: 'disco-cat', name: 'Disco Cat', tagline: 'Neon reels that never stop moving',
    badge: 'NEW', accent: '#c05cff', volatility: 'Low', tags: ['new', 'hot'],
    bets: [25, 50, 100, 250], weights: [28, 25, 17, 11, 8, 6, 4, 1], scale: 0.92,
    glyphs: { cherry: '🪩', lemon: '🎧', bell: '🔮', star: '✨', diamond: '💠', seven: '7️⃣', clover: '🐱', wild: '🃏' },
  },
  {
    id: 'robo-rush', name: 'Robo Rush', tagline: 'Gears, bolts and steady small wins',
    badge: 'HOT', accent: '#48c8e0', volatility: 'Low', tags: ['hot'],
    bets: [25, 50, 200, 500], weights: [30, 27, 16, 10, 7, 5, 4, 1], scale: 0.808,
    glyphs: { cherry: '🔩', lemon: '⚙️', bell: '🔋', star: '⚡', diamond: '💎', seven: '7️⃣', clover: '🤖', wild: '🃏' },
  },
  {
    id: 'clover-cash', name: 'Clover Cash', tagline: 'Luck of the Irish, big and rare',
    badge: 'JACKPOT', accent: '#4fd07a', volatility: 'High', tags: ['jackpot'],
    bets: [50, 250, 500, 2000], weights: [24, 22, 17, 11, 9, 7, 6, 2], scale: 0.833,
    glyphs: { cherry: '🍒', lemon: '🍋', bell: '🔔', star: '🌟', diamond: '💎', seven: '7️⃣', clover: '🍀', wild: '🃏' },
  },
  {
    id: 'seven-samurai', name: 'Seven Samurai', tagline: 'Seven-heavy reels, honour or nothing',
    badge: 'HIGH', accent: '#e05c5c', volatility: 'High', tags: ['jackpot', 'hot'],
    bets: [100, 500, 1000, 2000], weights: [20, 20, 18, 12, 10, 14, 5, 1], scale: 0.642,
    glyphs: { cherry: '🌸', lemon: '🏮', bell: '🔔', star: '⭐', diamond: '💎', seven: '7️⃣', clover: '🗡️', wild: '🃏' },
  },
  {
    id: 'wild-jungle', name: 'Wild Jungle', tagline: 'Wilds everywhere, prizes everywhere',
    badge: 'FEATURED', accent: '#8fd14f', volatility: 'Medium', tags: ['new', 'hot'],
    bets: [25, 100, 500, 1000], weights: [22, 20, 16, 11, 9, 7, 4, 4], scale: 0.546,
    glyphs: { cherry: '🍒', lemon: '🍋', bell: '🦜', star: '🌺', diamond: '💎', seven: '🐍', clover: '🌴', wild: '🐯' },
  },
];

export const SLOT_GAMES = Object.freeze(GAME_DEFS.map((g) => Object.freeze({
  ...g,
  weights: Object.freeze([...g.weights]),
  bets: Object.freeze([...g.bets]),
  tags: Object.freeze([...g.tags]),
  glyphs: Object.freeze({ ...g.glyphs }),
  paytable: scalePaytable(g.scale),
})));

const BY_ID = new Map(SLOT_GAMES.map((g) => [g.id, g]));

/** The catalogue entry for an id, or null. */
export function slotGame(id) {
  return BY_ID.get(String(id || '')) || null;
}

/** Display-only catalogue (no weights or paytables). */
export function slotCatalog() {
  return SLOT_GAMES.map(({ id, name, tagline, badge, accent, volatility, bets, tags, glyphs }) => ({
    id, name, tagline, badge, accent, volatility, bets, tags, glyphs,
  }));
}

function pickSymbol(random, weights, total) {
  let r = random() * total;
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= weights[i];
    if (r < 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

/**
 * Evaluate one payline. Wilds substitute for the first regular symbol on the line;
 * a line of nothing but wilds pays as wilds.
 * @param {string[]} line the five symbols along the payline, left to right
 * @param {Record<string, number[]>} [paytable] defaults to the classic table
 * @returns {{ symbol: string, count: number, multiplier: number } | null}
 */
export function evaluateLine(line, paytable = PAYTABLE) {
  const symbol = line.find((s) => s !== WILD) ?? WILD;
  let count = 0;
  for (const s of line) {
    if (s !== symbol && s !== WILD) break;
    count++;
  }
  if (count < MIN_MATCH) return null;
  return { symbol, count, multiplier: paytable[symbol][count - MIN_MATCH] };
}

/**
 * @param {number} bet total stake for the spin, split evenly across the paylines
 * @param {() => number} [random] uniform [0, 1) source; defaults to the OS CSPRNG
 * @param {string} [gameId] catalogue game; defaults to the classic table
 * @returns {{ grid: string[][], lines: object[], win: number, game: string }}
 */
export function spinSlots(bet, random = cryptoRandom, gameId = 'olympus-gold') {
  const game = slotGame(gameId) || SLOT_GAMES[0];
  const total = game.weights.reduce((a, b) => a + b, 0);
  const grid = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => pickSymbol(random, game.weights, total)));
  const lineStake = bet / PAYLINES.length;
  const lines = [];
  PAYLINES.forEach((rows, index) => {
    const symbols = rows.map((row, reel) => grid[reel][row]);
    const hit = evaluateLine(symbols, game.paytable);
    if (!hit) return;
    lines.push({ line: index, symbols, count: hit.count, amount: Math.floor(lineStake * hit.multiplier) });
  });
  return { grid, lines, win: lines.reduce((a, l) => a + l.amount, 0), game: game.id };
}
