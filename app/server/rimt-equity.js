const faces = '23456789TJQKA';
const suits = 'cdhs';
const encode = (card) => (faces.indexOf(card[0]) << 2) | suits.indexOf(card[1]);
const high = (mask) => 31 - Math.clz32(mask);

function straight(mask) {
  for (let rank = 12; rank >= 4; rank--) if ((mask >> (rank - 4) & 31) === 31) return rank + 2;
  return (mask & 4111) === 4111 ? 5 : 0;
}

function top(mask, count) {
  let score = 0;
  for (let n = 0; n < count; n++) {
    const rank = high(mask);
    score = (score << 4) | (rank + 2);
    mask ^= 1 << rank;
  }
  return score << (4 * (5 - count));
}

function rank7(cards) {
  let seen = 0, pairs = 0, trips = 0, quads = 0;
  const suitMasks = [0, 0, 0, 0];
  for (const card of cards) {
    const bit = 1 << (card >> 2);
    quads |= trips & bit;
    trips |= pairs & bit;
    pairs |= seen & bit;
    seen |= bit;
    suitMasks[card & 3] |= bit;
  }
  let flush = 0;
  for (const mask of suitMasks) {
    let bits = mask, count = 0;
    while (bits) { bits &= bits - 1; count++; }
    if (count >= 5) { flush = mask; break; }
  }
  if (flush) {
    const run = straight(flush);
    if (run) return 8 << 20 | run << 16;
  }
  if (quads) {
    const rank = high(quads);
    return 7 << 20 | (rank + 2) << 16 | (high(seen ^ (1 << rank)) + 2) << 12;
  }
  if (trips) {
    const rank = high(trips), others = pairs ^ (1 << rank);
    if (others) return 6 << 20 | (rank + 2) << 16 | (high(others) + 2) << 12;
  }
  if (flush) return 5 << 20 | top(flush, 5);
  const run = straight(seen);
  if (run) return 4 << 20 | run << 16;
  if (trips) {
    const rank = high(trips);
    return 3 << 20 | (rank + 2) << 16 | top(seen ^ (1 << rank), 2) >> 4;
  }
  if (pairs) {
    const first = high(pairs), otherPairs = pairs ^ (1 << first);
    if (otherPairs) {
      const second = high(otherPairs);
      return 2 << 20 | (first + 2) << 16 | (second + 2) << 12 | (high(seen ^ (1 << first) ^ (1 << second)) + 2) << 8;
    }
    return 1 << 20 | (first + 2) << 16 | top(seen ^ (1 << first), 3) >> 4;
  }
  return top(seen, 5);
}

function checked(cards) {
  if (new Set(cards).size !== cards.length || cards.some((card) => typeof card !== 'string' || !/^[2-9TJQKA][cdhs]$/.test(card))) throw new TypeError('Distinct standard cards required');
  return cards.map(encode);
}

export function holdemRank7(cards) {
  if (!Array.isArray(cards) || cards.length !== 7) throw new TypeError('Seven cards required');
  return rank7(checked([...cards]));
}

export function holdemEquity(a, b, board) {
  if (!Array.isArray(a) || a.length !== 2 || !Array.isArray(b) || b.length !== 2 || !Array.isArray(board) || ![0, 3, 4, 5].includes(board.length)) throw new TypeError('Two complete Holdem hands and a valid board required');
  const known = checked([...a, ...b, ...board]);
  const used = new Set(known);
  const pool = Array.from({ length: 52 }, (_, index) => index).filter((card) => !used.has(card));
  const left = [...known.slice(0, 2), ...known.slice(4)];
  const right = [...known.slice(2, 4), ...known.slice(4)];
  const needed = 5 - board.length;
  const result = { wins: [0, 0], ties: 0, total: 0 };
  function visit(start, depth) {
    if (depth === needed) {
      const x = rank7(left), y = rank7(right);
      result.total++;
      if (x === y) result.ties++;
      else result.wins[x > y ? 0 : 1]++;
      return;
    }
    for (let i = start; i <= pool.length - (needed - depth); i++) {
      left[2 + board.length + depth] = right[2 + board.length + depth] = pool[i];
      visit(i + 1, depth + 1);
    }
  }
  visit(0, 0);
  return result;
}
