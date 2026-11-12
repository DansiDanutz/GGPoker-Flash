/**
 * Measured lobby statistics for a cash table, derived from recorded hands.
 *
 * Replaces the earlier seeded demo values. AvgPot averages the settled pot of the
 * most recent hands (uncalled returns are never part of a recorded pot). VPIP is
 * the share of dealt seats that voluntarily called, bet or raised preflop, each seat
 * counted at most once per hand. Hands recorded before action logs existed are
 * skipped for VPIP only. The native aggregation window is unknown; the Codex clone
 * and this module both use the last 20 hands.
 */

export const STATS_WINDOW = 20;

const VOLUNTARY = new Set(['call', 'bet', 'raise', 'all-in', 'allin']);

function parseList(text) {
  if (!text) return null;
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** @returns {{ dealt: number, entered: number } | null} */
function handVpip(row) {
  const actions = parseList(row.actions);
  const players = parseList(row.players);
  if (!actions || !players) return null;
  const dealt = new Set(players.filter((p) => p && Array.isArray(p.cards) && p.cards.length > 0).map((p) => p.nick));
  if (!dealt.size) return null;
  const entered = new Set(
    actions
      .filter((a) => a && a.street === 'preflop' && VOLUNTARY.has(String(a.action).toLowerCase()) && dealt.has(a.nick))
      .map((a) => a.nick),
  );
  return { dealt: dealt.size, entered: entered.size };
}

/**
 * @param {Array<{ pot: number, players?: string, actions?: string | null }>} rows newest first
 * @returns {{ avgPot: number, vpip: number, hands: number }}
 */
export function summarizeHands(rows) {
  const recent = rows.slice(0, STATS_WINDOW);
  if (!recent.length) return { avgPot: 0, vpip: 0, hands: 0 };
  const potTotal = recent.reduce((sum, r) => sum + (Number(r.pot) || 0), 0);
  const counts = recent.map(handVpip).filter(Boolean);
  const dealt = counts.reduce((sum, c) => sum + c.dealt, 0);
  const entered = counts.reduce((sum, c) => sum + c.entered, 0);
  return {
    avgPot: Math.round(potTotal / recent.length),
    vpip: dealt ? Math.round((entered / dealt) * 100) : 0,
    hands: recent.length,
  };
}

const CACHE_MS = 5000;

/**
 * Builds a cached per-table reader over the `hands` table.
 * @param {import('node:sqlite').DatabaseSync | any} db
 */
export function createTableStats(db, now = () => Date.now()) {
  const recentHands = db.prepare(
    `SELECT pot, players, actions FROM hands WHERE table_id = ? ORDER BY id DESC LIMIT ${STATS_WINDOW}`,
  );
  const lastHour = db.prepare(
    "SELECT COUNT(*) AS n FROM hands WHERE table_id = ? AND created_at >= datetime('now', '-1 hour')",
  );
  const cache = new Map();

  function statsFor(tableId) {
    const hit = cache.get(tableId);
    if (hit && now() - hit.at < CACHE_MS) return hit.value;
    const value = {
      ...summarizeHands(recentHands.all(tableId)),
      handsPerHour: Number(lastHour.get(tableId)?.n || 0),
    };
    cache.set(tableId, { at: now(), value });
    return value;
  }

  /** Drop a table's cached stats after a new hand is recorded. */
  statsFor.invalidate = (tableId) => cache.delete(tableId);
  return statsFor;
}
