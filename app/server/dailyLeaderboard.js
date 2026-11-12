// Native Daily Leaderboard at the table (string_table DailyLeaderBoard "{0} Daily Leaderboard",
// MobileTotalPrize "Total Prize", MyPoints "My Points", MobileLeaderboardRank). How native
// awards points and splits prizes is server data; these values are DanGG rules: one point per
// raked hand you put chips into, per stake and UTC day, and a prize of TOTAL_PRIZE_BB big blinds
// paid to the top ten when the day is over.

export const TOTAL_PRIZE_BB = 500;
export const PRIZE_SPLIT = Object.freeze([30, 20, 15, 10, 8, 6, 4, 3, 2, 2]);
export const BOARD_SIZE = PRIZE_SPLIT.length;

export const stakeKey = (cfg) => `${cfg.game}:${cfg.sb}/${cfg.bb}`;
/** The leaderboard a table counts toward: public cash games only (no tournaments, Spins or private tables). */
export function leaderboardStake(table) {
  const cfg = table?.cfg;
  if (!cfg || table.tournament || table.spin || cfg.private || !(cfg.bb > 0)) return null;
  return { key: stakeKey(cfg), bb: cfg.bb };
}

/**
 * Humans who earn a point for this hand: everyone who put chips in, including players who left
 * mid-hand (kept as table.ghosts), once each.
 */
export function pointEarners(table) {
  const seated = table.seats.map((s) => s.player).filter((p) => p && p.inHand);
  const ids = [...seated, ...(table.ghosts || [])]
    .filter((p) => !p.isBot && p.totalBet > 0)
    .map((p) => p.id);
  return [...new Set(ids)];
}

export const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

/** Prize per place for the first `places` finishers (floored, so never above the total). */
export function prizeShares(total, places) {
  return PRIZE_SPLIT.slice(0, places).map((pct) => Math.floor((total * pct) / 100));
}

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ pay: (userId: number, amount: number, memo: string, reference: string) => void }} deps
 */
export function createDailyLeaderboard(db, { pay }) {
  db.exec(`CREATE TABLE IF NOT EXISTS daily_points (
    day TEXT NOT NULL, stake TEXT NOT NULL, bb INTEGER NOT NULL, user_id INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0, settled INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, stake, user_id));
    CREATE INDEX IF NOT EXISTS daily_points_unsettled ON daily_points (settled, day);`);
  const add = db.prepare(`INSERT INTO daily_points (day, stake, bb, user_id, points) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(day, stake, user_id) DO UPDATE SET points = points + 1`);
  const top = db.prepare(`SELECT d.user_id, d.points, u.nick FROM daily_points d JOIN users u ON u.id = d.user_id
    WHERE d.day = ? AND d.stake = ? ORDER BY d.points DESC, d.user_id ASC LIMIT ${BOARD_SIZE}`);
  const mine = db.prepare('SELECT points FROM daily_points WHERE day = ? AND stake = ? AND user_id = ?');
  const ahead = db.prepare(`SELECT COUNT(*) AS n FROM daily_points
    WHERE day = ? AND stake = ? AND (points > ? OR (points = ? AND user_id < ?))`);
  const unsettled = db.prepare('SELECT DISTINCT day, stake, bb FROM daily_points WHERE day < ? AND settled = 0');
  const markSettled = db.prepare('UPDATE daily_points SET settled = 1 WHERE day = ? AND stake = ?');

  /** Pays every finished day's leaders once. */
  function settle(now) {
    for (const { day, stake, bb } of unsettled.all(dayOf(now))) {
      const leaders = top.all(day, stake);
      const shares = prizeShares(bb * TOTAL_PRIZE_BB, leaders.length);
      // Past days never change and ties break on user id, so a retry sees the same order. The reference
      // is per user, so whatever happens between paying and marking settled, nobody is paid twice.
      leaders.forEach((row, i) => {
        if (shares[i] > 0) {
          pay(row.user_id, shares[i], `Daily Leaderboard ${stake} ${day}: #${i + 1}`, `daily-lb:${day}:${stake}`);
        }
      });
      markSettled.run(day, stake);
    }
  }

  return {
    settle,
    /** One point for each player id, at this stake, today. */
    record({ stake, userIds, now = Date.now() }) {
      settle(now);
      const day = dayOf(now);
      for (const id of userIds) add.run(day, stake.key, stake.bb, id);
    },
    view({ stake, userId, now = Date.now() }) {
      settle(now);
      const day = dayOf(now);
      const totalPrize = stake.bb * TOTAL_PRIZE_BB;
      const leaders = top.all(day, stake.key);
      const shares = prizeShares(totalPrize, leaders.length);
      const myPoints = Number(mine.get(day, stake.key, userId)?.points || 0);
      const myRank = myPoints > 0 ? Number(ahead.get(day, stake.key, myPoints, myPoints, userId).n) + 1 : null;
      return {
        day, stake: stake.key, totalPrize, myPoints, myRank,
        top: leaders.map((r, i) => ({ rank: i + 1, nick: r.nick, points: Number(r.points), prize: shares[i] })),
      };
    },
  };
}
