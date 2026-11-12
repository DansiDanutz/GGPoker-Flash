// Pure lobby filter, column and pill config (P0 slice W5a). Free of React so Node can test it.
import type { LobbyTable } from './api';

/** Lobby game tab → the server `game` ids it lists. `home` lists everything. */
export const TAB_GAMES: Readonly<Record<string, readonly string[]>> = {
  home: [],
  aof: ['aof'],
  rush: ['rush'],
  holdem: ['holdem'],
  plo: ['omaha', 'omaha5', 'omaha6'],
  short: ['shortdeck'],
  spin: ['spingold'],
  battle: ['battleroyale'],
};

/** A table's poker variant, used by the pills, the Games chip and the row accent. */
export type Variant = 'holdem' | 'plo' | 'plo5' | 'plo6';

const GAME_VARIANT: Readonly<Record<string, Variant>> = { omaha: 'plo', omaha5: 'plo5', omaha6: 'plo6' };
const POOL_GAMES = ['rush', 'aof'];
const OMAHA_NAME = /\b(plo|omaha)\b/i;

/**
 * Rush and AoF share one `game` id for every variant, so their variant comes from the
 * table name ("Rush & Cash PLO …"). Everything else maps by game id; unknown games are Hold'em.
 */
export function variantOf(table: Pick<LobbyTable, 'game' | 'name'>): Variant {
  if (POOL_GAMES.includes(table.game)) return OMAHA_NAME.test(table.name) ? 'plo' : 'holdem';
  return GAME_VARIANT[table.game] ?? 'holdem';
}

export const VARIANT_LABEL: Readonly<Record<Variant, string>> = {
  holdem: "Hold'em", plo: 'PLO', plo5: 'PLO-5', plo6: 'PLO-6',
};

export type Pill = { readonly id: string; readonly label: string; readonly variants: readonly Variant[] | null };

const ALL_PILL: Pill = { id: 'all', label: 'All', variants: null };
const ANY_OMAHA: readonly Variant[] = ['plo', 'plo5', 'plo6'];

/** Native pill sets (N3, N4). Tabs without native pills get none. */
export const TAB_PILLS: Readonly<Record<string, readonly Pill[]>> = {
  rush: [ALL_PILL, { id: 'holdem', label: "Hold'em", variants: ['holdem'] }, { id: 'plo', label: 'PLO', variants: ANY_OMAHA }],
  plo: [
    ALL_PILL,
    { id: 'plo', label: 'PLO', variants: ['plo'] },
    { id: 'plo5', label: 'PLO-5', variants: ['plo5'] },
    { id: 'plo6', label: 'PLO-6', variants: ['plo6'] },
  ],
  aof: [ALL_PILL, { id: 'holdem', label: "Hold'em", variants: ['holdem'] }, { id: 'omaha', label: 'Omaha', variants: ANY_OMAHA }],
};

export function pillsFor(tab: string): readonly Pill[] {
  return TAB_PILLS[tab] ?? [];
}

/** Group View columns. Table View keeps its eight native columns (brief §1.1, N2). */
export type ColumnId = 'promotion' | 'tableSize' | 'games' | 'stakes' | 'buyin' | 'players' | 'pros' | 'handsHr' | 'action';

export const COLUMN_LABEL: Readonly<Record<ColumnId, string>> = {
  promotion: 'Promotion', tableSize: 'Table Size', games: 'Games', stakes: 'Stakes', buyin: 'Buy-in',
  players: 'Players', pros: 'Pros', handsHr: 'Hands/hr', action: 'Action',
};

const HOLDEM_COLUMNS: readonly ColumnId[] = ['promotion', 'tableSize', 'stakes', 'buyin', 'players', 'action'];

/**
 * Native column sets. Hold'em and Rush are observed (N1, N3). PLO adds the Games chip the
 * PLO capture shows (N4) ahead of Table Size. AoF is unobserved: DanGG uses the Rush pool
 * set without Pros and Hands/hr, which AoF has no data for.
 */
export const TAB_COLUMNS: Readonly<Record<string, readonly ColumnId[]>> = {
  holdem: HOLDEM_COLUMNS,
  rush: ['promotion', 'games', 'stakes', 'buyin', 'players', 'pros', 'handsHr', 'action'],
  plo: ['promotion', 'games', 'tableSize', 'stakes', 'buyin', 'players', 'action'],
  aof: ['promotion', 'games', 'stakes', 'buyin', 'players', 'action'],
};

export function columnsFor(tab: string): readonly ColumnId[] {
  return TAB_COLUMNS[tab] ?? HOLDEM_COLUMNS;
}

export type TableSizeChip = { label: string; tone: '6max' | '9max' };

/** Green **6-Max** chip up to six seats, yellow **9-Max** chip above. */
export function tableSizeChip(seats: number): TableSizeChip {
  return { label: `${seats}-Max`, tone: seats > 6 ? '9max' : '6max' };
}

/** DanGG has no per-table promotions yet; the Promotion pill shows the stake tier (or Featured). */
export function promotionOf(table: Pick<LobbyTable, 'featured' | 'category'>): string {
  return table.featured ? 'Featured' : table.category;
}

// ---- filter state -------------------------------------------------------------------

/**
 * One tab's filters. `pill` lives in the pill row; everything else is in the Filters
 * popover (W5b). `hideFull` drops tables with every seat taken; `hasSeats` keeps only
 * tables you can sit at right now: a free seat and nobody on the wait list ahead of you.
 */
export type TabFilters = {
  readonly pill: string;
  readonly stake: string;
  readonly seats: string;
  readonly speed: string;
  readonly search: string;
  readonly favOnly: boolean;
  readonly hideFull: boolean;
  readonly hasSeats: boolean;
};

export type FilterPrefs = Readonly<Record<string, TabFilters>>;

export const DEFAULT_TAB_FILTERS: TabFilters = {
  pill: 'all', stake: 'all', seats: 'all', speed: 'all', search: '', favOnly: false, hideFull: false, hasSeats: false,
};

/** Longest search kept in storage; the input enforces the same limit. */
export const SEARCH_MAX = 64;

export const STAKE_OPTIONS = ['all', 'low', 'mid', 'high'] as const;
export const SEAT_OPTIONS = ['all', '6', '9', '3'] as const;
export const SPEED_OPTIONS = ['all', 'Normal', 'Fast'] as const;

const pick = (value: unknown, allowed: readonly string[]) =>
  (typeof value === 'string' && allowed.includes(value) ? value : 'all');

/** Coerces anything (a stored blob, a partial patch) into valid filters for `tab`. */
export function normalizeTabFilters(tab: string, raw: unknown): TabFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    pill: pick(r.pill, pillsFor(tab).map((p) => p.id)),
    stake: pick(r.stake, STAKE_OPTIONS),
    seats: pick(r.seats, SEAT_OPTIONS),
    speed: pick(r.speed, SPEED_OPTIONS),
    search: typeof r.search === 'string' ? r.search.slice(0, SEARCH_MAX) : '',
    favOnly: r.favOnly === true,
    hideFull: r.hideFull === true,
    hasSeats: r.hasSeats === true,
  };
}

/** How many Filters-popover filters are active (the pill is visible in the row, so it doesn't count). */
export function activeFilterCount(f: TabFilters): number {
  return [
    f.stake !== 'all', f.seats !== 'all', f.speed !== 'all', f.search.trim() !== '',
    f.favOnly, f.hideFull, f.hasSeats,
  ].filter(Boolean).length;
}

/** The popover's Reset: clears every popover filter and keeps the selected pill. */
export function resetExtraFilters(f: TabFilters): TabFilters {
  return { ...DEFAULT_TAB_FILTERS, pill: f.pill };
}

export function filtersForTab(prefs: FilterPrefs, tab: string): TabFilters {
  return normalizeTabFilters(tab, prefs[tab]);
}

/** Returns new prefs with `patch` applied to `tab`; the input is not changed. */
export function withTabFilters(prefs: FilterPrefs, tab: string, patch: Partial<TabFilters>): FilterPrefs {
  return { ...prefs, [tab]: normalizeTabFilters(tab, { ...filtersForTab(prefs, tab), ...patch }) };
}

/** Parses the stored JSON; drops unknown tabs and invalid values. Never throws. */
export function parseFilterPrefs(raw: string | null): FilterPrefs {
  let parsed: unknown;
  try { parsed = JSON.parse(raw || '{}'); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>)
    .filter(([tab]) => Object.hasOwn(TAB_GAMES, tab))
    .map(([tab, v]) => [tab, normalizeTabFilters(tab, v)]));
}

const PREFS_KEY = 'ggpoker.lobbyFilters';

export function readFilterPrefs(): FilterPrefs {
  try { return parseFilterPrefs(localStorage.getItem(PREFS_KEY)); } catch { return {}; }
}

export function writeFilterPrefs(prefs: FilterPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage unavailable: keep in memory */ }
}

// ---- filtering and sorting -----------------------------------------------------------

export type SortKey = 'name' | 'bb' | 'players' | 'avgPot';

export type FilterQuery = TabFilters & { readonly tab: string; readonly favs: readonly string[] };

const LOW_BB_MAX = 2;   // dollars
const MID_BB_MAX = 20;  // dollars

function matchesStake(bbCents: number, stake: string): boolean {
  const bb = bbCents / 100;
  if (stake === 'low') return bb <= LOW_BB_MAX;
  if (stake === 'mid') return bb > LOW_BB_MAX && bb <= MID_BB_MAX;
  if (stake === 'high') return bb > MID_BB_MAX;
  return true;
}

function matchesPill(table: LobbyTable, tab: string, pillId: string): boolean {
  const pill = pillsFor(tab).find((p) => p.id === pillId);
  return !pill?.variants || pill.variants.includes(variantOf(table));
}

const isFull = (t: LobbyTable) => t.players >= t.seats;
// Same rule as `waitCount` in waitlist.ts; kept local so Node can load this module without a bundler.
const hasQueue = (t: LobbyTable) => Number(t.wait) > 0;
const canSitNow = (t: LobbyTable) => !isFull(t) && !hasQueue(t);

/** The lobby list for a tab: tab games, pill, stake/seat/speed, search, favourites, Hide full and Has seats. */
export function filterTables(tables: readonly LobbyTable[], q: FilterQuery): LobbyTable[] {
  const games = TAB_GAMES[q.tab] ?? [];
  const needle = q.search.trim().toLowerCase();
  return tables.filter((t) =>
    (!games.length || games.includes(t.game))
    && matchesPill(t, q.tab, q.pill)
    && matchesStake(t.bb, q.stake)
    && (q.seats === 'all' || t.seats === Number(q.seats))
    && (q.speed === 'all' || t.speed === q.speed)
    && (!needle || t.name.toLowerCase().includes(needle))
    && (!q.favOnly || q.favs.includes(t.id))
    && (!q.hideFull || !isFull(t))
    && (!q.hasSeats || canSitNow(t)));
}

const sortValue = (t: LobbyTable, key: SortKey) => (key === 'name' ? t.name : t[key]);

/** Stable sort by `key` (`dir` 1 asc, -1 desc). `home` puts featured tables first, then low stakes. */
export function sortTables(tables: readonly LobbyTable[], tab: string, key: SortKey, dir: 1 | -1): LobbyTable[] {
  if (tab === 'home') return [...tables].sort((a, b) => Number(b.featured) - Number(a.featured) || a.bb - b.bb);
  return [...tables].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (typeof va === 'string') return va.localeCompare(String(vb)) * dir;
    return (Number(va) - Number(vb)) * dir;
  });
}
