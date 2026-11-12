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

/** Hands per table the opponent HUD looks back over. */
export const HUD_WINDOW = 100;
const HUD_RECENT = 5;
const RAISES = new Set(['bet', 'raise', 'all-in', 'allin']);

/**
 * Room-scoped opponent HUD (Codex clone hud-room/hud-history): hands dealt, VPIP, PFR and
 * wins for one nickname at this table, plus the latest hands. Hole cards are included
 * only when the player showed them; everything else is public table information.
 * @param {Array<{hand_no:number,pot:number,board?:string,players?:string,actions?:string|null}>} rows newest first
 */
export function playerHud(rows, nick) {
  const mine = [];
  for (const row of rows.slice(0, HUD_WINDOW)) {
    const players = parseList(row.players) || [];
    const me = players.find((p) => p && p.nick === nick && Array.isArray(p.cards) && p.cards.length > 0);
    if (me) mine.push({ row, me, actions: parseList(row.actions) || [] });
  }
  if (!mine.length) return { hands: 0, vpip: 0, pfr: 0, wins: 0, recent: [] };
  const pre = ({ actions }, set) => actions.some((a) => a && a.nick === nick && a.street === 'preflop' && set.has(String(a.action).toLowerCase()));
  const pct = (n) => Math.round((n / mine.length) * 100);
  return {
    hands: mine.length,
    vpip: pct(mine.filter((h) => pre(h, VOLUNTARY)).length),
    pfr: pct(mine.filter((h) => pre(h, RAISES)).length),
    wins: mine.filter((h) => (Number(h.me.win) || 0) > 0).length,
    recent: mine.slice(0, HUD_RECENT).map(({ row, me }) => ({
      handNo: Number(row.hand_no),
      pot: Number(row.pot) || 0,
      won: Number(me.win) || 0,
      board: String(row.board || '').split(' ').filter(Boolean),
      cards: me.showed ? [...me.cards] : null,
    })),
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

  const hudHands = db.prepare(
    `SELECT hand_no, pot, board, players, actions FROM hands WHERE table_id = ? ORDER BY id DESC LIMIT ${HUD_WINDOW}`,
  );
  statsFor.hud = (tableId, nick) => playerHud(hudHands.all(tableId), nick);

  /** Drop a table's cached stats after a new hand is recorded. */
  statsFor.invalidate = (tableId) => cache.delete(tableId);
  return statsFor;
}
