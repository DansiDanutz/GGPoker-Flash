// Texas Hold'em / Omaha / Short Deck poker engine used by the local GGPoker clone.
export const SUITS = ['s', 'h', 'd', 'c'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function makeDeck(shortDeck = false) {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      const v = RANKS.indexOf(r) + 2;
      if (shortDeck && v < 6) continue;
      deck.push({ r, s, v });
    }
  }
  return deck;
}

export function shuffle(deck, rng = Math.random) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function combinations(arr, k) {
  const out = [];
  const n = arr.length;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

// Returns a comparable array: [category, ...kickers]
export function score5(cards) {
  const vs = cards.map((c) => c.v).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(vs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5;
  }
  const counts = new Map();
  for (const v of vs) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [g0, g1] = groups;
  if (flush && straightHigh) return [8, straightHigh];
  if (g0[1] === 4) return [7, g0[0], g1[0]];
  if (g0[1] === 3 && g1[1] === 2) return [6, g0[0], g1[0]];
  if (flush) return [5, ...vs];
  if (straightHigh) return [4, straightHigh];
  if (g0[1] === 3) return [3, g0[0], ...groups.filter((g) => g[1] === 1).map((g) => g[0])];
  if (g0[1] === 2 && g1[1] === 2) {
    const pairs = [g0[0], g1[0]].sort((a, b) => b - a);
    const kicker = groups.find((g) => g[1] === 1)[0];
    return [2, ...pairs, kicker];
  }
  if (g0[1] === 2) return [1, g0[0], ...groups.filter((g) => g[1] === 1).map((g) => g[0])];
  return [0, ...vs];
}

export function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

const CAT_NAMES = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

export function handName(score) {
  const cat = score[0];
  if (cat === 8 && score[1] === 14) return 'Royal Flush';
  if (cat === 4) return 'Straight';
  if (cat === 5) return 'Flush';
  return CAT_NAMES[cat] || 'High Card';
}

export function bestHoldem(hole, board) {
  const all = [...hole, ...board];
  let best = null;
  let bestCards = null;
  for (const combo of combinations(all, 5)) {
    const sc = score5(combo);
    if (!best || compareScores(sc, best) > 0) {
      best = sc;
      bestCards = combo;
    }
  }
  return { score: best, cards: bestCards, name: handName(best) };
}

export function bestOmaha(hole, board) {
  let best = null;
  let bestCards = null;
  for (const h2 of combinations(hole, 2)) {
    for (const b3 of combinations(board, 3)) {
      const sc = score5([...h2, ...b3]);
      if (!best || compareScores(sc, best) > 0) {
        best = sc;
        bestCards = [...h2, ...b3];
      }
    }
  }
  return { score: best, cards: bestCards, name: handName(best) };
}

export function cardStr(c) { return c.r + c.s; }

export function formatCards(cards) { return cards.map(cardStr).join(' '); }

// Monte-Carlo equity for a bot decision. Returns 0..1.
export function estimateEquity(hole, board, opponents, shortDeck = false, iterations = 240) {
  const known = new Set([...hole, ...board].map(cardStr));
  const baseDeck = makeDeck(shortDeck).filter((c) => !known.has(cardStr(c)));
  let wins = 0, ties = 0;
  for (let it = 0; it < iterations; it++) {
    const deck = shuffle([...baseDeck], seededRandom(it * 7919 + 13 + board.length * 31));
    let idx = 0;
    const fullBoard = [...board];
    while (fullBoard.length < 5) fullBoard.push(deck[idx++]);
    const mine = bestHoldem(hole, fullBoard);
    let best = mine;
    let tie = false;
    for (let o = 0; o < opponents; o++) {
      const oh = [deck[idx++], deck[idx++]];
      const sc = bestHoldem(oh, fullBoard);
      const cmp = compareScores(sc.score, best.score);
      if (cmp > 0) { best = sc; tie = false; }
      else if (cmp === 0) tie = true;
    }
    if (best === mine) { if (tie) ties++; else wins++; }
  }
  return (wins + ties * 0.5) / iterations;
}

// Deterministic RNG for reproducible simulation inside a single decision.
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
