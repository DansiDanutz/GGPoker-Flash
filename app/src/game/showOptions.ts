// Native ShowMuck buttons: one per hole card plus one for the whole hand.
const SUITS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function cardGlyph(card: string): string {
  const rank = card[0] === 'T' ? '10' : card[0];
  return `${rank}${SUITS[card[1]] || card[1]}`;
}

export type ShowOption = { label: string; indices: number[] };

/** Cards still face down get a button each; with two or more left there is one for the whole hand. */
export function showOptions(cards: string[], shown: readonly number[] = []): ShowOption[] {
  if (!cards.length || cards.some((c) => !c || c === '??')) return [];
  const single = cards
    .map((c, i) => ({ label: cardGlyph(c), indices: [i] }))
    .filter((o) => !shown.includes(o.indices[0]));
  if (single.length < 2) return single;
  const label = shown.length ? 'All' : cards.map(cardGlyph).join(' ');
  return [...single, { label, indices: cards.map((_, i) => i) }];
}

type ShowSeat = { inHand?: boolean; cards?: string[]; shown?: number[] } | null | undefined;

/** After the hand, a dealt-in player with a card still face down may show it (folded or not). */
export function canShowHand(me: ShowSeat, street: string | undefined, observing: boolean): boolean {
  if (!me || observing || street !== 'ended' || !me.inHand) return false;
  const cards = me.cards || [];
  return cards.length > 0 && !cards.includes('??') && (me.shown?.length || 0) < cards.length;
}
