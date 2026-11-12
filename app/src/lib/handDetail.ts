// Pure helpers for the hand-history detail view. Kept free of React so they can be tested directly.

export const HAND_STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
export type HandStreet = (typeof HAND_STREETS)[number];

const STREET_TITLES: Record<HandStreet, string> = {
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

/** Board cards that must be on the table before a street's actions are shown during replay. */
export const STREET_BOARD_CARDS: Record<HandStreet, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

export type StreetRow = { nick: string; action: string; amount: number };
export type StreetColumn = { street: HandStreet; title: string; rows: StreetRow[] };

type StoredAction = { nick?: unknown; action?: unknown; amount?: unknown; street?: unknown };

/**
 * Per-street action columns. Older hands stored actions without a street, which are
 * preflop by definition; an unknown street matches no column and is dropped. Amounts are
 * shown as stored: a raise amount is the raise-to total, so columns are not summed.
 */
export function handStreetColumns(actions: readonly StoredAction[] | null | undefined): StreetColumn[] {
  const list = Array.isArray(actions) ? actions : [];
  const streetOf = (a: StoredAction) => a.street ?? 'preflop';
  return HAND_STREETS.map((street) => ({
    street,
    title: STREET_TITLES[street],
    rows: list
      .filter((a) => a && streetOf(a) === street)
      .map((a) => ({ nick: String(a.nick ?? ''), action: String(a.action ?? ''), amount: Number(a.amount) || 0 })),
  }));
}
