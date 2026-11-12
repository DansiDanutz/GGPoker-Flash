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

/* ---- Display transforms: chips or big blinds, anonymised names, PNG export text. ---- */

export type AmountUnit = 'chips' | 'bb';
type Money = (amount: number) => string;

interface HandPlayer { id?: unknown; nick?: string; seat?: number; stack?: number; cards?: string[]; win?: number; position?: string | null }
interface HandAction { nick?: unknown; action?: unknown; amount?: unknown; street?: unknown }
interface HandEntry { nick?: string; seat?: number }
export interface RecordedHand {
  id?: number; handNo?: number; tableName?: string; game?: string; board?: string; pot?: number;
  blinds?: { sb: number; bb: number; ante: number } | null;
  players?: HandPlayer[];
  actions?: HandAction[];
  result?: { winners?: HandEntry[]; hands?: HandEntry[]; [key: string]: unknown };
  [key: string]: unknown;
}

const BB_DECIMALS = 2;

/** An amount in chips (money format) or in big blinds; without a big blind it stays in chips. */
export function formatHandAmount(amount: number, unit: AmountUnit, bigBlind: number | undefined, money: Money): string {
  if (unit !== 'bb' || !bigBlind || bigBlind <= 0) return money(amount);
  const blinds = Number((amount / bigBlind).toFixed(BB_DECIMALS));
  return `${blinds} BB`;
}

/**
 * Replaces every other player's name with Player 1..n, numbered by seat. The viewer keeps
 * their own name. Actions and showdown entries follow the same mapping. Returns a copy.
 */
export function anonymizeHand<T extends RecordedHand>(hand: T, viewerId: unknown): T {
  const players = hand.players ?? [];
  const others = players.filter((p) => p.id !== viewerId).sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  const byNick = new Map<string, string>(others.map((p, i) => [String(p.nick ?? ''), `Player ${i + 1}`]));
  const bySeat = new Map<number | undefined, string>(others.map((p, i) => [p.seat, `Player ${i + 1}`]));
  const rename = <E extends HandEntry>(entry: E): E => {
    const alias = bySeat.get(entry.seat) ?? byNick.get(String(entry.nick ?? ''));
    return alias ? { ...entry, nick: alias } : entry;
  };
  const result = hand.result;
  return {
    ...hand,
    players: players.map((p) => (p.id === viewerId ? p : rename(p))),
    actions: (hand.actions ?? []).map((a) => {
      const alias = byNick.get(String(a.nick ?? ''));
      return alias ? { ...a, nick: alias } : a;
    }),
    result: result && {
      ...result,
      ...(Array.isArray(result.winners) ? { winners: result.winners.map(rename) } : {}),
      ...(Array.isArray(result.hands) ? { hands: result.hands.map(rename) } : {}),
    },
  };
}

/** The hand as lines of text, in the unit and names currently shown, for the PNG export. */
export function handExportLines(hand: RecordedHand, { unit, viewerId, money }: { unit: AmountUnit; viewerId: unknown; money: Money }): string[] {
  const bb = hand.blinds?.bb;
  const amount = (v: number) => formatHandAmount(v, unit, bb, money);
  const lines = [`${hand.tableName ?? 'Table'} · hand #${hand.handNo ?? '?'}`, `Pot: ${amount(hand.pot ?? 0)}`];
  if (hand.blinds) {
    const ante = hand.blinds.ante ? ` · ante ${amount(hand.blinds.ante)}` : '';
    lines.push(`Blinds: ${amount(hand.blinds.sb)} / ${amount(hand.blinds.bb)}${ante}`);
  }
  lines.push(`Board: ${hand.board || '—'}`, '');
  for (const p of hand.players ?? []) {
    const name = `${p.nick ?? ''}${p.id === viewerId ? ' (you)' : ''}`;
    const cards = p.cards?.length ? p.cards.join(' ') : '—';
    const won = p.win ? ` · won ${amount(p.win)}` : '';
    lines.push(`${name} · ${p.position ?? '—'} · ${cards} · stack ${amount(p.stack ?? 0)}${won}`);
  }
  const columns = handStreetColumns(hand.actions).filter((c) => c.rows.length);
  if (columns.length) lines.push('');
  for (const col of columns) {
    const rows = col.rows.map((r) => `${r.nick} ${r.action}${r.amount ? ` ${amount(r.amount)}` : ''}`);
    lines.push(`${col.title}: ${rows.join(', ')}`);
  }
  return lines;
}

/** A download name with only safe characters. */
export function handExportFileName(hand: Pick<RecordedHand, 'tableName' | 'handNo'>): string {
  const table = String(hand.tableName ?? 'table').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `dangg-hand-${table || 'table'}-${hand.handNo ?? 0}.png`;
}
