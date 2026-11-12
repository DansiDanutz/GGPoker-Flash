// Hand history storage queries: hands a player sat in, and the hands they chose to hide.
import { handForViewer } from './hand-history.js';

/**
 * Rows of `hands` whose stored players include this user id, newest first. Matching on
 * participation (not scanning the latest N hands of every table) keeps an infrequent
 * player's history intact on a busy server. Malformed player JSON never matches.
 */
const PLAYED_HANDS_SQL = `
  SELECT h.* FROM hands h
  WHERE EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid(h.players) THEN h.players ELSE '[]' END) j
    WHERE CASE WHEN j.type = 'object' THEN json_extract(j.value, '$.id') END = ?
  )
  ORDER BY h.id DESC LIMIT ?`;

/** @param {import('node:sqlite').DatabaseSync} db */
export function createHandHistoryStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS hidden_hands (
    user_id INTEGER NOT NULL,
    hand_row INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, hand_row)
  )`);
  const played = db.prepare(PLAYED_HANDS_SQL);
  const hiddenRows = db.prepare('SELECT hand_row FROM hidden_hands WHERE user_id = ?');
  const handRow = db.prepare('SELECT * FROM hands WHERE id = ?');
  const hide = db.prepare('INSERT OR IGNORE INTO hidden_hands (user_id, hand_row) VALUES (?, ?)');
  const unhide = db.prepare('DELETE FROM hidden_hands WHERE user_id = ? AND hand_row = ?');

  return {
    /** The viewer's projected hands, newest first, each flagged `hidden`. */
    listForPlayer(userId, limit) {
      const hidden = new Set(hiddenRows.all(userId).map((r) => r.hand_row));
      return played.all(userId, limit)
        .map((row) => handForViewer(row, userId))
        .filter(Boolean)
        .map((hand) => ({ ...hand, hidden: hidden.has(hand.id) }));
    },
    /** @returns {boolean} false when the hand does not exist or the user did not play it */
    setHidden(userId, handId, hidden) {
      const row = handRow.get(handId);
      if (!row || !handForViewer(row, userId)) return false;
      (hidden ? hide : unhide).run(userId, handId);
      return true;
    },
  };
}
