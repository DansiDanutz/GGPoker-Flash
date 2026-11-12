/**
 * Rush pool lobby (P0 slice R3).
 *
 * `buildRushPools` folds the lobby table list into one row per Rush pool (game + sb + bb,
 * the same key `rush-pool.js` moves players within). `createRushLobby(db)` adds the two
 * real metrics the rows and the side panel need: hands played in the last hour per pool
 * table, and today's Rush leaderboard (Cash Drop credits + Rush pot wins, real players only).
 */
import { isRushGame, RUSH_GAMES } from './validate.js';
import { CASHDROP_KIND, poolKeyOf } from './rush-pool.js';

export const LEADERBOARD_LIMIT = 10;
const HOUR_WINDOW = "datetime('now', '-1 hour')";

const positive = (n) => (Number(n) > 0 ? Math.floor(Number(n)) : 0);

/** The wait-list group key (`game:sb/bb:seats`), as `waitlist.groupKey` builds it. */
const groupKeyOf = (t) => `${t.game}:${t.sb}/${t.bb}:${t.seats}`;

function toPool(key, members, { handsByTable, groupWait }) {
  const [first] = members;
  const firstFree = members.find((t) => positive(t.players) < t.seats) ?? null;
  const groupKey = groupKeyOf(first);
  const tableWait = members.reduce((n, t) => n + positive(t.wait), 0);
  return Object.freeze({
    poolKey: key,
    groupKey,
    game: first.game,
    category: first.category,
    sb: first.sb,
    bb: first.bb,
    seats: first.seats,
    min_buyin: Math.min(...members.map((t) => t.min_buyin)),
    max_buyin: Math.max(...members.map((t) => t.max_buyin)),
    featured: members.some((t) => !!t.featured),
    tables: members.length,
    players: members.reduce((n, t) => n + positive(t.players), 0),
    // No "pro" player definition exists yet (plan R3): always 0 until one does.
    pros: 0,
    handsPerHour: members.reduce((n, t) => n + positive(handsByTable.get(t.id)), 0),
    firstFree: firstFree ? firstFree.id : null,
    wait: tableWait + positive(groupWait(groupKey)),
  });
}

/**
 * One row per public Rush pool, ordered by stakes descending (bb, then sb), Hold'em before PLO.
 *
 * @param {ReadonlyArray<{ id: string, game: string, category: string, sb: number, bb: number,
 *   seats: number, min_buyin: number, max_buyin: number, players: number, wait: number,
 *   featured?: boolean, private?: boolean }>} tables  the `/api/lobby` table rows
 * @param {{ handsByTable?: Map<string, number>, groupWait?: (groupKey: string) => number }} [opts]
 */
export function buildRushPools(tables, opts = {}) {
  const ctx = { handsByTable: opts.handsByTable ?? new Map(), groupWait: opts.groupWait ?? (() => 0) };
  const byKey = new Map();
  for (const t of tables) {
    if (t.private || !isRushGame(t.game)) continue;
    const key = poolKeyOf(t);
    byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }
  return [...byKey].map(([key, members]) => toPool(key, members, ctx))
    .sort((a, b) => b.bb - a.bb || b.sb - a.sb || RUSH_GAMES.indexOf(a.game) - RUSH_GAMES.indexOf(b.game));
}

/**
 * Merge Cash Drop credits and Rush pot wins into leaderboard rows (pure).
 *
 * @param {{ cashdrops: ReadonlyArray<{ user_id: number, amount: number }>,
 *   wins: ReadonlyArray<{ id: unknown, amount: number }>,
 *   users: Map<number, { id: number, nick: string, country: string | null }> }} input
 * @param {number} [limit]
 */
export function mergeLeaderboard({ cashdrops, wins, users }, limit = LEADERBOARD_LIMIT) {
  const totals = new Map();
  const add = (id, amount) => {
    const userId = Number(id);
    if (!Number.isInteger(userId) || !users.has(userId) || positive(amount) === 0) return;
    totals.set(userId, (totals.get(userId) ?? 0) + positive(amount));
  };
  for (const row of cashdrops) add(row.user_id, row.amount);
  for (const w of wins) add(w.id, w.amount);
  return [...totals]
    .map(([userId, won]) => ({ userId, nick: users.get(userId).nick, country: users.get(userId).country || '', won }))
    .sort((a, b) => b.won - a.won || a.nick.localeCompare(b.nick))
    .slice(0, limit)
    .map((row, i) => Object.freeze({ rank: i + 1, ...row }));
}

function parseWinners(json) {
  try {
    const result = JSON.parse(json || '{}');
    return Array.isArray(result?.winners) ? result.winners : [];
  } catch {
    return [];
  }
}

/** SQLite-backed metrics for the Rush lobby. "Today" is the UTC day, like every `created_at`. */
export function createRushLobby(db) {
  const rushIn = RUSH_GAMES.map(() => '?').join(',');
  const handsLastHour = db.prepare(`SELECT table_id, COUNT(*) AS n FROM hands
    WHERE game IN (${rushIn}) AND created_at >= ${HOUR_WINDOW} GROUP BY table_id`);
  const cashdropsToday = db.prepare(`SELECT user_id, SUM(amount) AS amount FROM transactions
    WHERE kind = ? AND created_at >= date('now') GROUP BY user_id`);
  const handsToday = db.prepare(`SELECT result FROM hands WHERE game IN (${rushIn}) AND created_at >= date('now')`);
  const userById = db.prepare('SELECT id, nick, country FROM users WHERE id = ? AND deleted_at IS NULL');

  function handsPerHourByTable() {
    return new Map(handsLastHour.all(...RUSH_GAMES).map((r) => [r.table_id, Number(r.n)]));
  }

  function leaderboard(limit = LEADERBOARD_LIMIT) {
    const cashdrops = cashdropsToday.all(CASHDROP_KIND);
    const wins = handsToday.all(...RUSH_GAMES).flatMap((r) => parseWinners(r.result));
    const ids = new Set([...cashdrops.map((r) => Number(r.user_id)), ...wins.map((w) => Number(w.id))]);
    const users = new Map();
    for (const id of ids) {
      if (!Number.isInteger(id)) continue;
      const u = userById.get(id);
      if (u) users.set(id, u);
    }
    return mergeLeaderboard({ cashdrops, wins, users }, limit);
  }

  return Object.freeze({ handsPerHourByTable, leaderboard });
}
