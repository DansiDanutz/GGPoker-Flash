// Client-side poker hand evaluation used to show hand strength at the table.
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const CATS = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

export type Card = { r: string; s: string; v: number };

export function parseCard(s: string): Card | null {
  if (!s || s === '??' || s.length < 2) return null;
  return { r: s[0], s: s[1], v: RANKS.indexOf(s[0]) + 2 };
}

function score5(cards: Card[]): number[] {
  const vs = cards.map((c) => c.v).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(vs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5;
  }
  const counts = new Map<number, number>();
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
    return [2, ...pairs, groups.find((g) => g[1] === 1)![0]];
  }
  if (g0[1] === 2) return [1, g0[0], ...groups.filter((g) => g[1] === 1).map((g) => g[0])];
  return [0, ...vs];
}

function compare(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function combos<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === arr.length - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

const NAMES: Record<number, string> = {
  0: 'High Card', 1: 'One Pair', 2: 'Two Pair', 3: 'Three of a Kind',
  4: 'Straight', 5: 'Flush', 6: 'Full House', 7: 'Four of a Kind', 8: 'Straight Flush',
};

export function bestHand(hole: string[], board: string[], omaha = false): { name: string; cat: number; best: string[] } | null {
  const h = hole.map(parseCard).filter(Boolean) as Card[];
  const b = board.map(parseCard).filter(Boolean) as Card[];
  if (h.length < 2 || b.length < 3) return null;
  let best: number[] | null = null;
  let bestCards: Card[] = [];
  const candidates: Card[][] = [];
  if (omaha) {
    for (const h2 of combos(h, 2)) for (const b3 of combos(b, 3)) candidates.push([...h2, ...b3]);
  } else {
    const all = [...h, ...b];
    if (all.length >= 5) for (const c of combos(all, 5)) candidates.push(c);
  }
  for (const c of candidates) {
    const sc = score5(c);
    if (!best || compare(sc, best) > 0) { best = sc; bestCards = c; }
  }
  if (!best) return null;
  let name = NAMES[best[0]];
  if (best[0] === 8 && best[1] === 14) name = 'Royal Flush';
  return { name, cat: best[0], best: bestCards.map((c) => c.r + c.s) };
}

export function describeHole(hole: string[]): string {
  const h = hole.map(parseCard).filter(Boolean) as Card[];
  if (h.length < 2) return '';
  const [a, b] = h.sort((x, y) => y.v - x.v);
  if (a.v === b.v) return `Pocket ${a.r}${b.r}`;
  const suited = a.s === b.s ? ' suited' : ' offsuit';
  return `${a.r}${b.r}${suited}`;
}
