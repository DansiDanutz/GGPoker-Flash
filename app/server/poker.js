// Texas Hold'em / Omaha / Short Deck poker engine used by OpenPoker.
import { randomInt } from 'node:crypto';

const cryptoRng = () => randomInt(0, 2 ** 32) / 2 ** 32;
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

export function shuffle(deck, rng = cryptoRng) {
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

// Configured Short Deck (6+) rules: a flush beats a full house and three of a kind
// beats a straight (both are rarer with 36 cards). The lowest straight is A-6-7-8-9.
const SHORT_DECK_FLUSH = 6;
const SHORT_DECK_FULL_HOUSE = 5;
const SHORT_DECK_TRIPS = 4;
const SHORT_DECK_STRAIGHT = 3;
const SHORT_DECK_WHEEL_HIGH = 9;

// Returns a comparable array: [category, ...kickers]
export function score5(cards, shortDeck = false) {
  const vs = cards.map((c) => c.v).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(vs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (!shortDeck && uniq[0] === 14 && uniq[1] === 5) straightHigh = 5;
    else if (shortDeck && uniq[0] === 14 && uniq[1] === SHORT_DECK_WHEEL_HIGH && uniq[4] === 6) straightHigh = SHORT_DECK_WHEEL_HIGH;
  }
  const counts = new Map();
  for (const v of vs) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [g0, g1] = groups;
  if (flush && straightHigh) return [8, straightHigh];
  if (g0[1] === 4) return [7, g0[0], g1[0]];
  if (g0[1] === 3 && g1[1] === 2) return [shortDeck ? SHORT_DECK_FULL_HOUSE : 6, g0[0], g1[0]];
  if (flush) return [shortDeck ? SHORT_DECK_FLUSH : 5, ...vs];
  if (straightHigh) return [shortDeck ? SHORT_DECK_STRAIGHT : 4, straightHigh];
  if (g0[1] === 3) return [shortDeck ? SHORT_DECK_TRIPS : 3, g0[0], ...groups.filter((g) => g[1] === 1).map((g) => g[0])];
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

export function handName(score, shortDeck = false) {
  const cat = score[0];
  if (cat === 8 && score[1] === 14) return 'Royal Flush';
  if (shortDeck && cat === SHORT_DECK_FLUSH) return 'Flush';
  if (shortDeck && cat === SHORT_DECK_FULL_HOUSE) return 'Full House';
  if (shortDeck && cat === SHORT_DECK_TRIPS) return 'Three of a Kind';
  if (shortDeck && cat === SHORT_DECK_STRAIGHT) return 'Straight';
  return CAT_NAMES[cat] || 'High Card';
}

export function bestHoldem(hole, board, shortDeck = false) {
  const all = [...hole, ...board];
  let best = null;
  let bestCards = null;
  for (const combo of combinations(all, 5)) {
    const sc = score5(combo, shortDeck);
    if (!best || compareScores(sc, best) > 0) {
      best = sc;
      bestCards = combo;
    }
  }
  return { score: best, cards: bestCards, name: handName(best, shortDeck) };
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
// `omaha` switches to the 2+3 rule and deals opponents as many hole cards as the hero holds.
export function estimateEquity(hole, board, opponents, shortDeck = false, iterations = 240, omaha = false) {
  const known = new Set([...hole, ...board].map(cardStr));
  const baseDeck = makeDeck(shortDeck).filter((c) => !known.has(cardStr(c)));
  const evaluate = omaha ? (h, b) => bestOmaha(h, b) : (h, b) => bestHoldem(h, b, shortDeck);
  const holeCount = omaha ? hole.length : 2;
  let wins = 0, ties = 0;
  for (let it = 0; it < iterations; it++) {
    const deck = shuffle([...baseDeck], seededRandom(it * 7919 + 13 + board.length * 31));
    let idx = 0;
    const fullBoard = [...board];
    while (fullBoard.length < 5) fullBoard.push(deck[idx++]);
    const mine = evaluate(hole, fullBoard);
    let best = mine;
    let tie = false;
    for (let o = 0; o < opponents; o++) {
      const oh = deck.slice(idx, idx + holeCount);
      idx += holeCount;
      const sc = evaluate(oh, fullBoard);
      const cmp = compareScores(sc.score, best.score);
      if (cmp > 0) { best = sc; tie = false; }
      else if (cmp === 0) tie = true;
    }
    if (best === mine) { if (tie) ties++; else wins++; }
  }
  return (wins + ties * 0.5) / iterations;
}

// Public showdown equity once every remaining player is all in. Exact with at most two
// cards to come; earlier streets use a deterministic sample that never reads the live deck.
export function allInEquity(players, board, { shortDeck = false, omaha = false, pots = [] } = {}) {
  if (!Array.isArray(players) || players.length < 2 || !Array.isArray(board) || board.length > 5) return null;
  const known = new Set([...board, ...players.flatMap((p) => p.cards)].map(cardStr));
  const deck = makeDeck(shortDeck).filter((c) => !known.has(cardStr(c)));
  const missing = 5 - board.length;
  const exact = missing <= 2;
  const limit = omaha ? 2000 : 5000;
  const runouts = [];

  if (exact) {
    const choose = (start, picked) => {
      if (picked.length === missing) { runouts.push(picked); return; }
      for (let i = start; i <= deck.length - (missing - picked.length); i++) choose(i + 1, [...picked, deck[i]]);
    };
    choose(0, []);
  } else {
    const seed = [...known].sort().join('').split('').reduce((n, ch) => ((n * 33) ^ ch.charCodeAt(0)) >>> 0, 5381);
    for (let i = 0; i < limit; i++) runouts.push(shuffle([...deck], seededRandom(seed + i * 7919)).slice(0, missing));
  }

  const payable = pots.length ? pots : [{ amount: 1, eligible: players.map((p) => p.id) }];
  const total = payable.reduce((sum, pot) => sum + pot.amount, 0);
  const awards = new Map(players.map((p) => [p.id, 0]));
  for (const runout of runouts) {
    const fullBoard = [...board, ...runout];
    const scored = players.map((p) => ({ ...p, score: (omaha ? bestOmaha(p.cards, fullBoard) : bestHoldem(p.cards, fullBoard, shortDeck)).score }));
    for (const pot of payable) {
      const eligible = scored.filter((p) => pot.eligible.includes(p.id));
      if (!eligible.length) continue;
      let best = eligible[0];
      for (const p of eligible.slice(1)) if (compareScores(p.score, best.score) > 0) best = p;
      const winners = eligible.filter((p) => compareScores(p.score, best.score) === 0);
      for (const winner of winners) awards.set(winner.id, awards.get(winner.id) + pot.amount / winners.length);
    }
  }

  const raw = players.map((p) => ({ seat: p.seat, percent: awards.get(p.id) * 100 / (runouts.length * total) }));
  const rounded = raw.map((p) => ({ seat: p.seat, percent: Math.round(p.percent * 10) / 10 }));
  const adjustment = Math.round((100 - rounded.reduce((sum, p) => sum + p.percent, 0)) * 10) / 10;
  if (adjustment) rounded[raw.reduce((best, p, i) => p.percent > raw[best].percent ? i : best, 0)].percent += adjustment;
  return { estimated: !exact, samples: runouts.length, players: rounded };
}

// Deterministic RNG for reproducible simulation inside a single decision.
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
