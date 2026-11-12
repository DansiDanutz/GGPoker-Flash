/**
 * Player-note colours and private label titles.
 *
 * The eleven colours are the native client's note palette (recovered by the Codex
 * clone's REA pass, player-notes.mjs). Each account may name the first ten colours
 * with a private single-line title of at most 20 characters; the eleventh (white) is
 * the untitled "no label" colour. Older DanGG notes stored yellow/green/red/blue and
 * are mapped to their nearest native colour.
 */

export const NOTE_COLORS = Object.freeze([
  '#00B050', '#269CFF', '#7030AA', '#7AFFE8', '#862C08', '#96FA3E',
  '#FF0000', '#FF8121', '#FFC7D2', '#FFFF00', '#FFFFFF',
]);
export const LABEL_COUNT = 10;
export const LABEL_MAX = 20;
const DEFAULT_COLOR = 'c9';
const LEGACY = Object.freeze({ yellow: 'c9', green: 'c0', red: 'c6', blue: 'c1' });

/** @returns {string | null} a `c<index>` id, or null when the value is not a colour */
export function normalizeNoteColor(value) {
  if (value == null || value === '') return DEFAULT_COLOR;
  const text = String(value);
  if (LEGACY[text]) return LEGACY[text];
  const m = /^c(\d{1,2})$/.exec(text);
  return m && Number(m[1]) < NOTE_COLORS.length ? text : null;
}

/** @returns {string[] | null} a fresh copy of ten valid titles, or null */
export function cleanLabels(titles) {
  if (!Array.isArray(titles) || titles.length !== LABEL_COUNT) return null;
  for (let i = 0; i < LABEL_COUNT; i++) {
    const t = titles[i];
    if (typeof t !== 'string' || [...t].length > LABEL_MAX || /[\r\n]/.test(t)) return null;
  }
  return [...titles];
}

const EMPTY = () => Array(LABEL_COUNT).fill('');

export function createPlayerLabels(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS player_labels (
    user_id INTEGER PRIMARY KEY,
    titles TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const read = db.prepare('SELECT titles FROM player_labels WHERE user_id = ?');
  const write = db.prepare(`INSERT INTO player_labels (user_id, titles) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET titles = excluded.titles, updated_at = datetime('now')`);

  function get(userId) {
    const row = read.get(userId);
    if (!row) return EMPTY();
    try {
      return cleanLabels(JSON.parse(row.titles)) || EMPTY();
    } catch {
      return EMPTY();
    }
  }

  /** @returns {boolean} false when the titles are invalid */
  function set(userId, titles) {
    const clean = cleanLabels(titles);
    if (!clean) return false;
    write.run(userId, JSON.stringify(clean));
    return true;
  }

  return Object.freeze({ get, set });
}
