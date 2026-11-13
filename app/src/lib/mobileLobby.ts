// Phone lobby helpers: the game-type list and the tournament row clock. Free of React so Node can test it.
// Kept free of runtime imports so Node can load it without a bundler (same rule as lobbyFilters.ts).
import type { TournamentLike } from './tournamentFilters';

const MINUTE_MS = 60_000;
/** At or above this many minutes a countdown reads "145 min(s)" instead of mm:ss. */
const LONG_COUNTDOWN_MIN = 100;

/** One row of the phone Poker list: a lobby tab with its icon and the perk badge it really has. */
export type MobileGame = {
  readonly key: string;
  readonly label: string;
  readonly icon: 'aof' | 'holdem' | 'plo' | 'short' | 'rush' | 'spin';
  readonly perk: string;
  /** Server `game` ids this row counts; mirrors TAB_GAMES in lobbyFilters.ts. */
  readonly games: readonly string[];
};

export const MOBILE_GAMES: readonly MobileGame[] = Object.freeze([
  { key: 'aof', label: 'All-in or Fold', icon: 'aof', perk: 'Jackpot', games: ['aof'] },
  { key: 'holdem', label: "Hold'em", icon: 'holdem', perk: 'Bad Beat Jackpot', games: ['holdem'] },
  { key: 'plo', label: 'PLO', icon: 'plo', perk: 'Bad Beat Jackpot', games: ['omaha', 'omaha5', 'omaha6'] },
  { key: 'short', label: 'Short Deck', icon: 'short', perk: 'Bad Beat Jackpot', games: ['shortdeck'] },
  { key: 'rush', label: 'Rush & Cash', icon: 'rush', perk: 'Cash Drops', games: ['rush', 'rushplo'] },
  { key: 'spin', label: 'Spin & Gold', icon: 'spin', perk: 'Up to 12,000x', games: ['spingold'] },
]);

type SeatedTable = { readonly game: string; readonly players: number };

/** Seated players per phone game row, from the live lobby tables. Capture-gated formats have no row. */
export function gameSummaries(tables: readonly SeatedTable[]): { key: string; players: number }[] {
  return MOBILE_GAMES.map((g) => ({
    key: g.key,
    players: tables.reduce((sum, t) => sum + (g.games.includes(t.game) ? Number(t.players) || 0 : 0), 0),
  }));
}

export type EventClock = {
  readonly tone: 'reg' | 'late' | 'run' | 'done';
  readonly label: string;
  readonly caption: string;
  readonly value: string;
};

function countdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  if (min >= LONG_COUNTDOWN_MIN) return `${min} min(s)`;
  return `${String(min).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
}

/** The left box of a phone tournament row: what phase it is in and how long until that phase ends. */
export function eventClock(t: TournamentLike, nowMs: number): EventClock {
  const start = Date.parse(t.start_at);
  if (t.status === 'registering') return { tone: 'reg', label: 'Registering', caption: 'Starts in', value: countdown(start - nowMs) };
  if (t.status !== 'running') return { tone: 'done', label: 'Finished', caption: '', value: '' };
  // Same late-reg rule as phaseOf in tournamentFilters.ts.
  const lateEnd = start + (Number(t.late_reg) || 0) * MINUTE_MS;
  if (Number.isFinite(start) && nowMs < lateEnd) return { tone: 'late', label: 'Late reg', caption: 'Ends in', value: countdown(lateEnd - nowMs) };
  return { tone: 'run', label: 'Running', caption: '', value: '' };
}
