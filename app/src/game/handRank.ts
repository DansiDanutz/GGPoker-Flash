// @ts-expect-error Node's native test runner imports this TypeScript module directly.
import { bestFiveFocus, bestHand } from './eval.ts';

const FACES = '23456789TJQKA';
const VALID = /^[2-9TJQKA][cdhs]$/;
const VALID_SHORT = /^[6-9TJQKA][cdhs]$/;
const DRAW_LABELS: Record<string, string> = {
  RoyalStraightFlushDraw: 'Royal Flush Draw', StraightFlushDraw: 'Straight Flush Draw',
  FlushDrawDoubleGutshotStraightDraw: 'Flush & Double Gutshot Draw', FlushDrawGutshotStraightDraw: 'Flush & Gutshot Draw',
  FlushDrawOpenEndedStraightDraw: 'Flush & Open Ended Draw', DoubleGutshotStraightDraw: 'Double Gutshot Draw',
  OpenEndedStraightDraw: 'Open Ended Draw', GutshotStraightDraw: 'Gutshot Draw', FlushDraw: 'Flush Draw',
};

export type HandRank = {
  cards: { card: string; hole: boolean }[];
  drawKey: string;
  drawLabel: string;
  labelKey: string;
  labelValues: string[];
  label: string;
};

function validCards(hole: string[], board: string[], shortDeck: boolean) {
  const all = [...hole, ...board];
  return [2, 4, 5, 6].includes(hole.length) && [0, 3, 4, 5].includes(board.length)
    && (!shortDeck || hole.length === 2) && new Set(all).size === all.length
    && all.every((card) => (shortDeck ? VALID_SHORT : VALID).test(card));
}

export function handDraw(hole: string[], board: string[]): string {
  if (!Array.isArray(hole) || hole.length !== 2 || ![3, 4].includes(board?.length)) return '';
  const all = [...hole, ...board];
  if (new Set(all).size !== all.length || !all.every((card) => VALID.test(card))) return '';
  const position = (card: string) => card[0] === 'A' ? (1 | 1 << 13) : 1 << (FACES.indexOf(card[0]) + 1);
  const ranks = all.reduce((mask, card) => mask | position(card), 0);
  const suits = [...'cdhs'].map((suit) => all.filter((card) => card[1] === suit));
  const suitMasks = suits.map((list) => list.reduce((mask, card) => mask | position(card), 0));
  const flush = suits.some((list) => list.length === 5) ? 'made' : suits.some((list) => list.length === 4) ? 'draw' : '';
  let suited = false;
  const sameSuit = (mask: number) => suitMasks.some((suit) => {
    const indices = Array.from({ length: 14 }, (_, index) => index).filter((index) => ((suit & mask) & (1 << index)) !== 0);
    return indices.some((_, index) => index >= 3 && _ - indices[index - 3] <= 4);
  });
  const matches = (indices: readonly number[], span: number, checkSuit = false, shift = true) => {
    const base = indices.reduce((mask, index) => mask | 1 << index, 0);
    for (let offset = 0; offset < (shift ? 15 - span : 1); offset++) {
      const mask = base << offset;
      if ((ranks & mask) === mask) {
        if (checkSuit && sameSuit(mask)) suited = true;
        return true;
      }
    }
    return false;
  };
  let straight = matches([0, 1, 2, 3, 4], 5) ? 'made' : '';
  if (!straight && matches([1, 2, 3, 4], 6, !!flush)) straight = 'OpenEndedStraightDraw';
  if (!straight || straight === 'OpenEndedStraightDraw') {
    for (const [mask, span] of [[[0, 2, 3, 4, 6], 7], [[0, 1, 3, 4, 6, 7], 8]] as const) {
      if (matches(mask, span, !!flush) && !straight) straight = 'DoubleGutshotStraightDraw';
    }
  }
  if (!straight || ['OpenEndedStraightDraw', 'DoubleGutshotStraightDraw'].includes(straight)) {
    for (const [mask, span, shift] of [[[0, 1, 2, 4], 5, true], [[0, 1, 3, 4], 5, true], [[0, 2, 3, 4], 5, true], [[0, 1, 2, 3], 4, false], [[10, 11, 12, 13], 4, false]] as const) {
      if (matches(mask, span, !!flush, shift) && !straight) straight = 'GutshotStraightDraw';
    }
  }
  if (suited) straight = sameSuit([9, 10, 11, 12, 13].reduce((mask, index) => mask | 1 << index, 0)) ? 'RoyalStraightFlushDraw' : 'StraightFlushDraw';
  if (!flush) return straight === 'made' ? '' : straight;
  if (flush === 'made') return ['StraightFlushDraw', 'RoyalStraightFlushDraw'].includes(straight) ? straight : '';
  if (['StraightFlushDraw', 'RoyalStraightFlushDraw'].includes(straight)) return straight;
  return ['OpenEndedStraightDraw', 'DoubleGutshotStraightDraw', 'GutshotStraightDraw'].includes(straight) ? `FlushDraw${straight}` : 'FlushDraw';
}

function rankOf(card: string) { return FACES.indexOf(card[0]) + 2; }
function face(rank: number) { return FACES[rank - 2]; }

export function currentHandRank(hole: string[], board: string[], shortDeck = false): HandRank | null {
  if (!validCards(hole, board, shortDeck)) return null;
  if (!board.length) {
    let selected: string[] = [];
    let score = -1;
    for (let a = 0; a < hole.length - 1; a++) for (let b = a + 1; b < hole.length; b++) {
      const x = FACES.indexOf(hole[a][0]);
      const y = FACES.indexOf(hole[b][0]);
      const value = x === y ? 1000 + x : Math.max(x, y) * 13 + Math.min(x, y);
      if (value > score) { score = value; selected = [hole[a], hole[b]]; }
    }
    const pair = selected[0][0] === selected[1][0];
    const highest = face(Math.max(...selected.map(rankOf)));
    return {
      cards: selected.map((card) => ({ card, hole: true })), drawKey: '', drawLabel: '',
      labelKey: pair ? '1P' : 'HC', labelValues: [highest], label: pair ? `a pair of ${highest}s` : `${highest} high`,
    };
  }
  const omaha = hole.length > 2;
  const focus = bestFiveFocus(hole, board, omaha, shortDeck);
  const made = bestHand(hole, board, omaha, shortDeck);
  if (!focus || !made) return null;
  const selected = [...focus.hole.map((index) => hole[index]), ...focus.board.map((index) => board[index])];
  const ranks = selected.map(rankOf).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) || 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const wheel = shortDeck && selected.map((card) => card[0]).sort().join('') === '6789A';
  const straight = made.cat === 4 || made.cat === 8;
  const high = straight ? (ranks.includes(14) && ranks.includes(5) ? 5 : Math.max(...ranks)) : groups[0][0];
  const low = straight ? (high === 5 ? 14 : high - 4) : 0;
  const range = wheel ? 'A to 9' : straight ? `${face(low)} to ${face(high)}` : '';
  const labels = [
    `${face(groups[0][0])} high`, `a pair of ${face(groups[0][0])}s`,
    `two pair, ${face(groups[0][0])}s and ${face(groups[1][0])}s`, `three of a kind, ${face(groups[0][0])}s`,
    `a straight, ${range}`, `a flush ${face(Math.max(...ranks))} high`,
    `a full house, ${face(groups[0][0])}s full of ${face(groups[1][0])}s`, `four of a kind, ${face(groups[0][0])}s`,
    high === 14 ? 'a royal flush' : `a straight flush, ${range}`,
  ];
  const category = wheel ? (selected.every((card) => card[1] === selected[0][1]) ? 8 : 4) : made.cat;
  const labelKey = category === 8 && high === 14 && !wheel ? 'RF' : ['HC', '1P', '2P', '3K', 'S', 'F', 'FH', '4K', 'SF'][category];
  const labelValues = labelKey === 'RF' ? [] : ['S', 'SF'].includes(labelKey) ? (wheel ? ['A', '9'] : [face(low), face(high)]) : [face(groups[0][0]), ...(['2P', 'FH'].includes(labelKey) ? [face(groups[1][0])] : [])];
  const drawKey = handDraw(hole, board);
  return {
    cards: [...focus.hole.map((index) => ({ card: hole[index], hole: true })), ...focus.board.map((index) => ({ card: board[index], hole: false }))],
    drawKey, drawLabel: DRAW_LABELS[drawKey] || '', labelKey, labelValues,
    label: wheel ? `${selected.every((card) => card[1] === selected[0][1]) ? 'a straight flush' : 'a straight'}, A to 9` : labels[category],
  };
}

export function currentSeatHandRank({ hole, board, shortDeck = false, rabbitCards = [], rabbitOpened = false }: { hole: string[]; board: string[]; shortDeck?: boolean; rabbitCards?: string[]; rabbitOpened?: boolean }) {
  const actual = currentHandRank(hole, board, shortDeck);
  if (!actual || !rabbitOpened || board.length + rabbitCards.length !== 5) return actual;
  const virtual = currentHandRank(hole, [...board, ...rabbitCards], shortDeck);
  return virtual ? { ...virtual, drawKey: '', drawLabel: '' } : { ...actual, drawKey: '', drawLabel: '' };
}

export function sessionDuration(startedAt: number, now = Date.now()) {
  if (!Number.isSafeInteger(startedAt) || startedAt < 0 || startedAt > 8640000000000000 || !Number.isFinite(now)) return '-';
  const seconds = Math.floor(Math.max(0, now - startedAt) / 1000);
  const minutes = Math.floor(seconds / 60);
  const pad = (value: number) => String(value).padStart(2, '0');
  return minutes >= 60 ? `${pad(Math.floor(minutes / 60))}h ${pad(minutes % 60)}m` : `${pad(minutes)}m ${pad(seconds % 60)}s`;
}
