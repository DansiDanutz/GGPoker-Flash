/**
 * Cross-room leaderboard (`GET /api/leaderboard?metric=vip|elo|xp`).
 *
 * One ranked list per metric over every active player: VIP points, the cross-room Elo
 * stored on `users.elo`, or XP. Ties break by nick so the order is stable. Banned and
 * deleted accounts never appear. The caller's own rank is computed with the same ordering,
 * so it is correct even when they sit outside the top 50.
 */

export const LEADERBOARD_METRICS = Object.freeze(['vip', 'elo', 'xp']);
export const DEFAULT_METRIC = 'vip';
export const LEADERBOARD_SIZE = 50;

// Fixed SQL expressions per metric; the metric name never reaches SQL as text.
const METRIC_SQL = Object.freeze({
  vip: 'vip_points',
  elo: 'COALESCE(elo, 1000)',
  xp: 'xp',
});

const ACTIVE = 'banned = 0 AND deleted_at IS NULL';

/** The metric for a query value: `null`/empty means the default, anything unknown is `null`. */
export function parseMetric(raw) {
  if (raw == null || raw === '') return DEFAULT_METRIC;
  const metric = String(raw).toLowerCase();
  return LEADERBOARD_METRICS.includes(metric) ? metric : null;
}

export function createLeaderboard(db) {
  const top = Object.fromEntries(LEADERBOARD_METRICS.map((m) => [m, db.prepare(
    `SELECT nick, avatar, vip_level, vip_points, xp, COALESCE(elo, 1000) AS elo, ${METRIC_SQL[m]} AS value
       FROM users WHERE ${ACTIVE}
       ORDER BY value DESC, nick ASC LIMIT ${LEADERBOARD_SIZE}`)]));
  const mine = Object.fromEntries(LEADERBOARD_METRICS.map((m) => [m, db.prepare(
    `SELECT nick, ${METRIC_SQL[m]} AS value FROM users WHERE id = ? AND ${ACTIVE}`)]));
  const ahead = Object.fromEntries(LEADERBOARD_METRICS.map((m) => [m, db.prepare(
    `SELECT COUNT(*) AS n FROM users
       WHERE ${ACTIVE} AND (${METRIC_SQL[m]} > ? OR (${METRIC_SQL[m]} = ? AND nick < ?))`)]));

  const meOf = (metric, userId) => {
    if (userId == null) return null;
    const row = mine[metric].get(userId);
    if (!row) return null;
    const value = Number(row.value);
    const { n } = ahead[metric].get(value, value, row.nick);
    return Object.freeze({ rank: Number(n) + 1, value });
  };

  return {
    /** `{ metric, leaders, me }`; `me` is `null` for anonymous, banned or deleted callers. */
    read(metric, userId = null) {
      const leaders = top[metric].all().map((r, i) => Object.freeze({
        rank: i + 1,
        nick: r.nick,
        avatar: r.avatar,
        vip_level: r.vip_level,
        value: Number(r.value),
        vip_points: r.vip_points,
        xp: r.xp,
        elo: Number(r.elo),
      }));
      return { metric, leaders, me: meOf(metric, userId) };
    },
  };
}
