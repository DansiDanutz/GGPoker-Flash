// Rush pool lobby logic (P0 slice R3). Free of React and runtime imports so Node can test it.
import type { LobbyTable, RushLeaderRow, RushPool } from './api';
import type { TableGroup, Variant } from './lobbyFilters';

/** A pool's variant: `rushplo` is PLO, every other Rush game is Hold'em. */
export function poolVariant(pool: Pick<RushPool, 'game'>): Variant {
  return pool.game === 'rushplo' ? 'plo' : 'holdem';
}

/** Stakes descending (bb, then sb), Hold'em before PLO at the same stake. Never mutates. */
export function sortPools(pools: readonly RushPool[]): RushPool[] {
  return [...pools].sort((a, b) => b.bb - a.bb || b.sb - a.sb || a.game.localeCompare(b.game));
}

const poolKeyOfTable = (t: Pick<LobbyTable, 'game' | 'sb' | 'bb'>) => `${t.game}:${t.sb}/${t.bb}`;

/**
 * The pools to list: those with at least one table left by the tab's filters (pill, stake,
 * search…), sorted by stakes descending. A pool's counts still cover all of its tables.
 */
export function visiblePools(pools: readonly RushPool[], visibleTables: readonly LobbyTable[]): RushPool[] {
  const keys = new Set(visibleTables.map(poolKeyOfTable));
  return sortPools(pools.filter((p) => keys.has(p.poolKey)));
}

/** The pool's lobby tables, in lobby order. */
export function poolTables(pool: Pick<RushPool, 'poolKey'>, tables: readonly LobbyTable[]): LobbyTable[] {
  return tables.filter((t) => !t.private && poolKeyOfTable(t) === pool.poolKey);
}

/**
 * The pool as a Group View group so the existing group action (Join / Join Wait List /
 * "#n · Leave") drives it unchanged. Join takes the server's `firstFree` table.
 */
export function poolAsGroup(pool: RushPool, tables: readonly LobbyTable[]): TableGroup {
  const members = poolTables(pool, tables);
  const firstFree = members.find((t) => t.id === pool.firstFree) ?? null;
  return {
    key: pool.groupKey, game: pool.game, sb: pool.sb, bb: pool.bb, seats: pool.seats,
    tables: members, players: pool.players, wait: pool.wait, firstFree,
    action: firstFree ? 'join' : 'joinWait',
  };
}

/** "1,234 players" / "1 player", for the Players pill's accessible label. */
export function playersLabel(players: number): string {
  const n = Math.max(0, Math.floor(players || 0));
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'player' : 'players'}`;
}

/** Play-money chips from cents, whole chips with separators ("12,345"). */
export function chipsWonLabel(cents: number): string {
  return Math.floor(Math.max(0, cents || 0) / 100).toLocaleString('en-US');
}

const REGIONAL_A = 0x1f1e6;

/** "RO" → 🇷🇴. Anything that is not a two-letter code gets a neutral white flag. */
export function countryFlag(code: string | null | undefined): string {
  const cc = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  return String.fromCodePoint(...[...cc].map((c) => REGIONAL_A + c.charCodeAt(0) - 65));
}

export type LeaderboardRow = { readonly key: string; readonly rank: number; readonly flag: string; readonly nick: string; readonly chips: string; readonly isMe: boolean };

/** Display rows for the Rush leaderboard panel (Flag / Player / Chips won). */
export function leaderboardRows(rows: readonly RushLeaderRow[] | null | undefined, myId?: number | null): LeaderboardRow[] {
  return (rows ?? []).map((r) => ({
    key: `${r.rank}-${r.userId}`,
    rank: r.rank,
    flag: countryFlag(r.country),
    nick: r.nick,
    chips: chipsWonLabel(r.won),
    isMe: myId != null && Number(myId) === Number(r.userId),
  }));
}
