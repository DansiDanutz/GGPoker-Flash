// Per-viewer projection of a stored hand: a player only ever sees cards they were entitled to see.

function parseJson(text, fallback) {
  try { return JSON.parse(text || '') ?? fallback; } catch { return fallback; }
}

const isChipAmount = (value) => Number.isInteger(value) && value >= 0;
const isSeatIndex = (value) => Number.isInteger(value) && value >= 0;

/** Labels for the seats after the big blind, UTG first and CO last, keyed by how many there are. */
const MIDDLE_POSITIONS = [
  [],
  ['CO'],
  ['UTG', 'CO'],
  ['UTG', 'HJ', 'CO'],
  ['UTG', 'MP', 'HJ', 'CO'],
  ['UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  ['UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'],
];

/** Position names in clockwise order from the button, or null when the size is unlabelled. */
function positionNames(count) {
  if (count < 2) return [];
  if (count === 2) return ['BTN/SB', 'BB'];
  const middle = MIDDLE_POSITIONS[count - 3];
  return middle ? ['BTN', 'SB', 'BB', ...middle] : null;
}

/**
 * Seat → position label for the players dealt into a hand. Labels run clockwise from the
 * button seat, so sparse seating and heads-up (button = small blind) are handled.
 * A missing or invalid button yields no labels at all, which is how older hands look.
 * @param {object[]} players stored hand players (`seat`, `inHand`)
 * @param {number | null} button stored dealer button seat
 * @returns {Map<number, string>}
 */
export function seatPositions(players, button) {
  const labels = new Map();
  if (!isSeatIndex(button)) return labels;
  const dealt = (Array.isArray(players) ? players : [])
    .filter((p) => p && p.inHand === true && isSeatIndex(p.seat));
  const names = positionNames(dealt.length);
  if (!names) return labels;
  const span = Math.max(button, ...dealt.map((p) => p.seat)) + 1;
  const clockwise = (seat) => (seat - button + span) % span;
  [...dealt]
    .sort((a, b) => clockwise(a.seat) - clockwise(b.seat))
    .forEach((p, i) => labels.set(p.seat, names[i]));
  return labels;
}

/** Button and blinds as stored at deal time; anything malformed is treated as absent. */
function storedTableMeta(text) {
  const meta = parseJson(text, {}) || {};
  const button = isSeatIndex(meta.button) ? meta.button : null;
  const blinds = meta.blinds && isChipAmount(meta.blinds.sb) && isChipAmount(meta.blinds.bb) && isChipAmount(meta.blinds.ante)
    ? { sb: meta.blinds.sb, bb: meta.blinds.bb, ante: meta.blinds.ante }
    : null;
  return { button, blinds };
}

/**
 * Hands saved after the `showed` flag existed carry it per player. Older hands only tell us
 * the showdown winners, whose cards were always turned over, so only they are revealed.
 */
function isRevealed(player, result) {
  if (player.folded) return false;
  if (typeof player.showed === 'boolean') return player.showed;
  const winners = Array.isArray(result.winners) ? result.winners : [];
  return result.reason === 'showdown' && winners.some((w) => w.seat === player.seat || (w.id != null && w.id === player.id));
}

/** Drops the cards of any showdown entry (winner or hand) whose seat is not revealed to this viewer. */
function projectResult(result, visibleSeats) {
  const withCards = (entry) => (Array.isArray(entry.cards) && !visibleSeats.has(entry.seat)
    ? { ...entry, cards: [] }
    : entry);
  return {
    ...result,
    ...(Array.isArray(result.winners) ? { winners: result.winners.map(withCards) } : {}),
    ...(Array.isArray(result.hands) ? { hands: result.hands.map(withCards) } : {}),
  };
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
  const result = parseJson(row.result, {}) || {};
  const visible = players.map((p) => p.id === viewerId || isRevealed(p, result));
  const visibleSeats = new Set(players.filter((_, i) => visible[i]).map((p) => p.seat));
  const { button, blinds } = storedTableMeta(row.meta);
  const positions = seatPositions(players, button);
  return {
    id: row.id, handNo: row.hand_no, tableId: row.table_id, tableName: row.table_name, game: row.game,
    board: row.board, pot: row.pot, result: projectResult(result, visibleSeats),
    button, blinds,
    players: players.map((p, i) => ({
      ...p,
      cards: visible[i] ? p.cards : [],
      position: positions.get(p.seat) ?? null,
    })),
    heroCards: (me.cards || []).join(' '),
    actions: parseJson(row.actions, []),
    created_at: row.created_at,
  };
}
