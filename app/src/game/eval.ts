// Client-side poker hand evaluation used to show hand strength at the table.
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const CATS = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

export type Card = { r: string; s: string; v: number };

export function parseCard(s: string): Card | null {
  if (!s || s === '??' || s.length < 2) return null;
  return { r: s[0], s: s[1], v: RANKS.indexOf(s[0]) + 2 };
}

// Short Deck (6+): a flush outranks a full house and A-6-7-8-9 is the lowest straight.
function score5(cards: Card[], shortDeck = false): number[] {
  const vs = cards.map((c) => c.v).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(vs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (!shortDeck && uniq[0] === 14 && uniq[1] === 5) straightHigh = 5;
    else if (shortDeck && uniq[0] === 14 && uniq[1] === 9 && uniq[4] === 6) straightHigh = 9;
  }
  const counts = new Map<number, number>();
  for (const v of vs) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [g0, g1] = groups;
  if (flush && straightHigh) return [8, straightHigh];
  if (g0[1] === 4) return [7, g0[0], g1[0]];
  if (g0[1] === 3 && g1[1] === 2) return [shortDeck ? 5 : 6, g0[0], g1[0]];
  if (flush) return [shortDeck ? 6 : 5, ...vs];
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

export function bestHand(hole: string[], board: string[], omaha = false, shortDeck = false): { name: string; cat: number; best: string[] } | null {
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
    const sc = score5(c, shortDeck);
    if (!best || compare(sc, best) > 0) { best = sc; bestCards = c; }
  }
  if (!best) return null;
  let name = NAMES[best[0]];
  if (shortDeck && best[0] === 6) name = 'Flush';
  if (shortDeck && best[0] === 5) name = 'Full House';
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

export type FiveFocus = { hole: number[]; board: number[] };

const SUIT_ORDER = 'chds';
const VALID_CARD = /^[2-9TJQKA][cdhs]$/;
const VALID_SHORT_CARD = /^[6-9TJQKA][cdhs]$/;

function focusInputValid(hole: string[], board: string[], omaha: boolean, shortDeck: boolean): boolean {
  const all = [...hole, ...board];
  const pattern = shortDeck ? VALID_SHORT_CARD : VALID_CARD;
  const holeSizes = omaha ? [4, 5, 6] : [2];
  return holeSizes.includes(hole.length) && board.length === 5
    && new Set(all).size === all.length && all.every((c) => pattern.test(c));
}

/**
 * Indices of the winner's best five cards, for the showdown focus (selected cards lift,
 * the rest dim). Ported from the Codex clone's REA-recovered native rule: equal hands are
 * broken by the sum of rank*4 + suit ordinal (c0 h1 d2 s3), and Hold'em candidates are
 * visited in the native exclusion order. Returns null when cards are hidden or incomplete.
 */
export function bestFiveFocus(hole: string[], board: string[], omaha = false, shortDeck = false): FiveFocus | null {
  if (!Array.isArray(hole) || !Array.isArray(board) || !focusInputValid(hole, board, omaha, shortDeck)) return null;
  const cardOrdinal = (c: string) => RANKS.indexOf(c[0]) * 4 + SUIT_ORDER.indexOf(c[1]);
  let high: { score: number[]; ordinal: number; focus: FiveFocus } | null = null;
  const consider = (holes: number[], boards: number[]) => {
    const cards = [...holes.map((i) => hole[i]), ...boards.map((i) => board[i])];
    const score = score5(cards.map(parseCard) as Card[], shortDeck);
    const ordinal = cards.reduce((sum, c) => sum + cardOrdinal(c), 0);
    const cmp = high ? compare(score, high.score) : 1;
    if (cmp > 0 || (cmp === 0 && ordinal > high!.ordinal)) high = { score, ordinal, focus: { hole: holes, board: boards } };
  };
  if (omaha) {
    for (const pair of combos([...hole.keys()], 2)) for (const trio of combos([0, 1, 2, 3, 4], 3)) consider(pair, trio);
  } else {
    // Native exclusion order: drop cards (q, w) from the seven, highest indices first.
    for (let q = 6; q > 0; q--) for (let w = q - 1; w >= 0; w--) {
      const kept = [0, 1, 2, 3, 4, 5, 6].filter((i) => i !== q && i !== w);
      consider(kept.filter((i) => i < 2), kept.filter((i) => i >= 2).map((i) => i - 2));
    }
  }
  return high ? (high as { focus: FiveFocus }).focus : null;
}

const OMAHA_GAMES = ['omaha', 'omaha5', 'omaha6', 'rushplo'];

type ShowdownWinner = { seat?: number; cards?: string[]; potIndex?: number };
type ShowdownResult = { reason?: string; runItTwice?: boolean; winners?: ShowdownWinner[] } | null | undefined;
export type ShowdownFocus = { board: number[]; hole: Record<number, number[]> };

/**
 * Native winner focus: the main-pot winners' best five cards stay bright and lift,
 * everything else dims. Board indices are the union across tied main-pot winners.
 * Hidden cards, fold wins, run-it-twice and incomplete boards give no focus.
 */
export function showdownFocus(result: ShowdownResult, board: string[], game: string): ShowdownFocus | null {
  if (!result || result.reason !== 'showdown' || result.runItTwice || !Array.isArray(board) || board.length !== 5) return null;
  const winners = result.winners || [];
  const mainPot = Math.min(...winners.map((w) => w.potIndex ?? 0));
  const omaha = OMAHA_GAMES.includes(game);
  const shortDeck = game === 'shortdeck';
  const boardSet = new Set<number>();
  const hole: Record<number, number[]> = {};
  for (const w of winners) {
    if ((w.potIndex ?? 0) !== mainPot || typeof w.seat !== 'number' || !w.cards) continue;
    const focus = bestFiveFocus(w.cards, board, omaha, shortDeck);
    if (!focus) continue;
    focus.board.forEach((i) => boardSet.add(i));
    hole[w.seat] = focus.hole;
  }
  if (!boardSet.size && !Object.keys(hole).length) return null;
  return { board: [...boardSet].sort((a, b) => a - b), hole };
}

/** Card class for the winner focus: no focus → '', selected → lifted, otherwise dimmed. */
export function focusClass(selected: number[] | undefined, index: number): string {
  if (!selected) return '';
  return selected.includes(index) ? 'focus-on' : 'focus-off';
}
