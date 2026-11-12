// Pure tournament category + filter state (P0 slice W6 / F3). Free of React so Node can test it.

/** The tournament fields the filters read. Amounts are in cents, times in minutes. */
export type TournamentLike = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly start_at: string;
  readonly buyin: number;
  readonly fee: number;
  readonly format?: string | null;
  readonly mode?: string | null;
  readonly blind_speed?: number | null;
  readonly late_reg?: number | null;
};

export type GameFilter = 'all' | 'nlh' | 'plo';
export type BuyinBand = 'all' | 'free' | 'micro' | 'low' | 'mid' | 'high';
export type StatusFilter = 'all' | 'registering' | 'late' | 'running';
export type SpeedFilter = 'all' | 'regular' | 'turbo' | 'hyper';
export type Phase = 'registering' | 'late' | 'running' | 'completed';

export type TournamentFilters = {
  readonly category: string;
  readonly game: GameFilter;
  readonly buyin: BuyinBand;
  readonly status: StatusFilter;
  readonly speed: SpeedFilter;
  readonly registeredOnly: boolean;
  readonly search: string;
};

export const DEFAULT_TOURNAMENT_FILTERS: TournamentFilters = {
  category: 'all', game: 'all', buyin: 'all', status: 'all', speed: 'all', registeredOnly: false, search: '',
};

export const TOURNAMENT_SEARCH_MAX = 60;

type Option<T extends string> = { readonly value: T; readonly label: string };

export const GAME_OPTIONS: readonly Option<GameFilter>[] = [
  { value: 'all', label: 'All games' }, { value: 'nlh', label: 'NLH' }, { value: 'plo', label: 'PLO' },
];
export const BUYIN_OPTIONS: readonly Option<BuyinBand>[] = [
  { value: 'all', label: 'All buy-ins' },
  { value: 'free', label: 'Freeroll' },
  { value: 'micro', label: 'Micro · up to $5' },
  { value: 'low', label: 'Low · $5–$25' },
  { value: 'mid', label: 'Mid · $25–$100' },
  { value: 'high', label: 'High · $100+' },
];
export const STATUS_OPTIONS: readonly Option<StatusFilter>[] = [
  { value: 'all', label: 'Any status' },
  { value: 'registering', label: 'Registering' },
  { value: 'late', label: 'Late reg' },
  { value: 'running', label: 'Running' },
];
export const SPEED_OPTIONS: readonly Option<SpeedFilter>[] = [
  { value: 'all', label: 'Any speed' },
  { value: 'regular', label: 'Regular' },
  { value: 'turbo', label: 'Turbo' },
  { value: 'hyper', label: 'Hyper' },
];

// ---- categories ------------------------------------------------------------------------

export type Category = {
  readonly key: string;
  readonly label: string;
  /** Server `mode` values that put an event in this category. */
  readonly modes: readonly string[];
  /** Name fallback for events seeded before `mode` existed. */
  readonly needle: string | null;
};

/** The category rail. `mode` decides first; the name needle is the fallback. */
export const CATEGORIES: readonly Category[] = [
  { key: 'all', label: 'All series', modes: [], needle: null },
  { key: 'wsop', label: 'Live Series', modes: [], needle: 'live series' },
  { key: 'ggmasters', label: 'Masters', modes: [], needle: 'masters' },
  { key: 'mystery', label: 'Mystery Bounty', modes: ['MYSTERY'], needle: 'mystery' },
  { key: 'spin', label: 'Jackpot SNG', modes: [], needle: 'jackpot sng' },
  { key: 'flip', label: 'Quick Flip', modes: ['FLIP'], needle: 'quick flip' },
  { key: 'bounty', label: 'Bounty Hunters', modes: ['BOUNTY'], needle: 'bounty hunters' },
  { key: 'sat', label: 'Satellites', modes: ['SATELLITE'], needle: 'satellite' },
];

const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

export function inCategory(t: TournamentLike, key: string): boolean {
  const cat = CATEGORIES.find((c) => c.key === key);
  if (!cat || cat.key === 'all') return true;
  const mode = String(t.mode || '').toUpperCase();
  if (cat.modes.includes(mode)) return true;
  return cat.needle !== null && t.name.toLowerCase().includes(cat.needle);
}

// ---- predicates ------------------------------------------------------------------------

/** NLH vs PLO from `format` (PLO, PLO5 and PLO6 all count as PLO). */
export function gameOf(t: TournamentLike): 'nlh' | 'plo' {
  return /^plo/i.test(String(t.format || '')) ? 'plo' : 'nlh';
}

const MICRO_MAX = 500;   // cents, total buy-in ($5)
const LOW_MAX = 2500;    // $25
const MID_MAX = 10000;   // $100

export function buyinBandOf(t: TournamentLike): Exclude<BuyinBand, 'all'> {
  const total = (Number(t.buyin) || 0) + (Number(t.fee) || 0);
  if (total <= 0) return 'free';
  if (total <= MICRO_MAX) return 'micro';
  if (total <= LOW_MAX) return 'low';
  if (total <= MID_MAX) return 'mid';
  return 'high';
}

const HYPER_MAX_MIN = 3;  // blind level length in minutes
const TURBO_MAX_MIN = 6;

/** Speed from the blind level length; a "Hyper"/"Turbo" name wins for seeded events. */
export function speedOf(t: TournamentLike): Exclude<SpeedFilter, 'all'> {
  if (/hyper/i.test(t.name)) return 'hyper';
  if (/turbo/i.test(t.name)) return 'turbo';
  const level = Number(t.blind_speed) || 0;
  if (level > 0 && level <= HYPER_MAX_MIN) return 'hyper';
  if (level > 0 && level <= TURBO_MAX_MIN) return 'turbo';
  return 'regular';
}

const MINUTE_MS = 60_000;

/** Registering, late reg (running and inside the late-registration window), running or completed. */
export function phaseOf(t: TournamentLike, nowMs: number): Phase {
  if (t.status === 'registering') return 'registering';
  if (t.status !== 'running') return 'completed';
  const start = Date.parse(t.start_at);
  const lateEnd = start + (Number(t.late_reg) || 0) * MINUTE_MS;
  return Number.isFinite(start) && nowMs < lateEnd ? 'late' : 'running';
}

export const PHASE_LABEL: Readonly<Record<Phase, string>> = {
  registering: 'Registering', late: 'Late reg', running: 'Running', completed: 'Completed',
};

export type TournamentQuery = TournamentFilters & {
  readonly registered: readonly string[];
  readonly nowMs: number;
};

export function filterTournaments<T extends TournamentLike>(list: readonly T[], q: TournamentQuery): T[] {
  const needle = q.search.trim().toLowerCase();
  return list.filter((t) =>
    inCategory(t, q.category)
    && (q.game === 'all' || gameOf(t) === q.game)
    && (q.buyin === 'all' || buyinBandOf(t) === q.buyin)
    && (q.status === 'all' || phaseOf(t, q.nowMs) === q.status)
    && (q.speed === 'all' || speedOf(t) === q.speed)
    && (!q.registeredOnly || q.registered.includes(t.id))
    && (!needle || t.name.toLowerCase().includes(needle)));
}

// ---- state: count, reset, persistence ---------------------------------------------------

/** Number of filters (category and search included) that differ from the defaults. */
export function tournamentFilterCount(f: TournamentFilters): number {
  return [
    f.category !== 'all', f.game !== 'all', f.buyin !== 'all', f.status !== 'all',
    f.speed !== 'all', f.registeredOnly, f.search.trim() !== '',
  ].filter(Boolean).length;
}

export function resetTournamentFilters(): TournamentFilters {
  return DEFAULT_TOURNAMENT_FILTERS;
}

/** Returns new filters with `patch` applied and validated; the input is not changed. */
export function withTournamentFilters(f: TournamentFilters, patch: Partial<TournamentFilters>): TournamentFilters {
  return normalizeTournamentFilters({ ...f, ...patch });
}

const pick = <T extends string>(options: readonly Option<T>[], v: unknown, fallback: T): T =>
  (options.some((o) => o.value === v) ? v as T : fallback);

export function normalizeTournamentFilters(raw: unknown): TournamentFilters {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TOURNAMENT_FILTERS;
  return {
    category: typeof r.category === 'string' && CATEGORY_KEYS.includes(r.category) ? r.category : d.category,
    game: pick(GAME_OPTIONS, r.game, d.game),
    buyin: pick(BUYIN_OPTIONS, r.buyin, d.buyin),
    status: pick(STATUS_OPTIONS, r.status, d.status),
    speed: pick(SPEED_OPTIONS, r.speed, d.speed),
    registeredOnly: r.registeredOnly === true,
    search: typeof r.search === 'string' ? r.search.slice(0, TOURNAMENT_SEARCH_MAX) : d.search,
  };
}

/** Parses stored JSON; invalid input yields the defaults. Never throws. */
export function parseTournamentFilters(raw: string | null): TournamentFilters {
  try { return normalizeTournamentFilters(JSON.parse(raw || '{}')); } catch { return DEFAULT_TOURNAMENT_FILTERS; }
}

export const TOURNAMENT_FILTERS_KEY = 'ggpoker.tournamentFilters';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function readTournamentFilters(storage: StorageLike | null = defaultStorage()): TournamentFilters {
  try { return parseTournamentFilters(storage?.getItem(TOURNAMENT_FILTERS_KEY) ?? null); } catch { return DEFAULT_TOURNAMENT_FILTERS; }
}

export function writeTournamentFilters(f: TournamentFilters, storage: StorageLike | null = defaultStorage()): void {
  try { storage?.setItem(TOURNAMENT_FILTERS_KEY, JSON.stringify(f)); } catch { /* storage unavailable: keep in memory */ }
}

/** Empty-state copy: names the filters when some are set. */
export function emptyTournamentMessage(f: TournamentFilters): string {
  const n = tournamentFilterCount(f);
  if (n === 0) return 'No tournaments scheduled right now. Check back soon.';
  return `No tournaments match ${n === 1 ? 'this filter' : `these ${n} filters`}. Reset to see every event.`;
}
