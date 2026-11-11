// Per-viewer projection of a stored hand: a player only ever sees cards they were entitled to see.

function parseJson(text, fallback) {
  try { return JSON.parse(text || ''); } catch { return fallback; }
}

/**
 * @param {object} row a row from the `hands` table
 * @param {number} viewerId
 * @returns {object | null} the hand as the viewer may see it, or null when they did not play it
 */
export function handForViewer(row, viewerId) {
  const players = parseJson(row.players, []);
  const me = players.find((p) => p.id === viewerId);
  if (!me) return null;
  const result = parseJson(row.result, {});
  // Hands saved before the `showed` flag existed: only showdown participants revealed cards.
  const shownAtShowdown = new Set((result.hands || []).map((h) => h.nick));
  const visible = (p) => p.id === viewerId
    || (p.showed ?? (result.reason === 'showdown' && !p.folded && shownAtShowdown.has(p.nick)));
  return {
    id: row.id, handNo: row.hand_no, tableId: row.table_id, tableName: row.table_name, game: row.game,
    board: row.board, pot: row.pot, result,
    players: players.map((p) => ({ ...p, cards: visible(p) ? p.cards : [] })),
    heroCards: (me.cards || []).join(' '),
    actions: parseJson(row.actions, []),
    created_at: row.created_at,
  };
}
