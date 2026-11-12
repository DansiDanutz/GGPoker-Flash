// Input validation helpers shared by the HTTP and WebSocket handlers.

export const GAMES = Object.freeze(['holdem', 'omaha', 'omaha5', 'shortdeck', 'rush', 'aof', 'spingold', 'battleroyale', 'flipandgo']);
const MIN_SEATS = 2;
const MAX_SEATS = 9;
const NICK_PATTERN = /^[\p{L}\p{N} _.\-]{2,20}$/u;

/**
 * Parse a finite integer within [min, max]; returns null when the value is not acceptable.
 * @param {unknown} value
 * @param {{ min?: number, max?: number }} [range]
 * @returns {number | null}
 */
export function toInt(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * @param {unknown} value
 * @returns {string | null} the trimmed nickname, or null when invalid
 */
export function cleanNick(value) {
  const nick = String(value ?? '').trim().replace(/\s+/g, ' ');
  return NICK_PATTERN.test(nick) ? nick : null;
}

/**
 * Validate an admin-supplied cash table definition.
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function parseTableConfig(body) {
  const game = String(body.game || 'holdem');
  if (!GAMES.includes(game)) return { ok: false, error: `Unknown game "${game}"` };
  const sb = toInt(body.sb ?? 100, { min: 1, max: 1e9 });
  const bb = toInt(body.bb ?? 200, { min: 2, max: 1e9 });
  const ante = toInt(body.ante ?? 0, { min: 0, max: 1e9 });
  const minBuyin = toInt(body.min_buyin ?? 2000, { min: 1, max: 1e11 });
  const maxBuyin = toInt(body.max_buyin ?? 20000, { min: 1, max: 1e11 });
  const seats = toInt(body.seats ?? 6, { min: MIN_SEATS, max: MAX_SEATS });
  if (sb === null || bb === null || ante === null) return { ok: false, error: 'Blinds and ante must be positive whole numbers' };
  if (sb > bb) return { ok: false, error: 'Small blind cannot exceed the big blind' };
  if (minBuyin === null || maxBuyin === null) return { ok: false, error: 'Buy-in limits must be positive whole numbers' };
  if (minBuyin > maxBuyin) return { ok: false, error: 'Minimum buy-in cannot exceed the maximum' };
  if (minBuyin < bb) return { ok: false, error: 'Minimum buy-in must cover at least one big blind' };
  if (seats === null) return { ok: false, error: `Seats must be between ${MIN_SEATS} and ${MAX_SEATS}` };
  return {
    ok: true,
    value: {
      name: String(body.name || 'New Table').slice(0, 60), game,
      category: String(body.category || 'Gold').slice(0, 30),
      sb, bb, ante, min_buyin: minBuyin, max_buyin: maxBuyin, seats,
      speed: String(body.speed || 'Normal').slice(0, 20),
      featured: body.featured ? 1 : 0, enabled: body.enabled === false ? 0 : 1,
      sort: toInt(body.sort, { min: 0, max: 1e6 }) ?? 999,
    },
  };
}

const TABLE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const GROUP_KEY_PATTERN = /^([a-z0-9]{1,20}):(\d{1,10})\/(\d{1,10}):(\d)$/;

/**
 * Decode and validate a table id taken from a URL path segment.
 * @param {unknown} raw still percent-encoded
 * @returns {string | null}
 */
export function parseTableId(raw) {
  let id;
  try { id = decodeURIComponent(String(raw ?? '')); } catch { return null; }
  return TABLE_ID_PATTERN.test(id) ? id : null;
}

/**
 * Decode and validate a lobby group key (`game:sb/bb:seats`, see waitlist.groupKey).
 * @param {unknown} raw still percent-encoded
 * @returns {{ key: string, game: string, sb: number, bb: number, seats: number } | null}
 */
export function parseGroupKey(raw) {
  let key;
  try { key = decodeURIComponent(String(raw ?? '')); } catch { return null; }
  const m = GROUP_KEY_PATTERN.exec(key);
  if (!m) return null;
  const sb = toInt(m[2], { min: 1, max: 1e9 });
  const bb = toInt(m[3], { min: 1, max: 1e9 });
  const seats = toInt(m[4], { min: MIN_SEATS, max: MAX_SEATS });
  if (sb === null || bb === null || seats === null || sb > bb) return null;
  return { key, game: m[1], sb, bb, seats };
}
