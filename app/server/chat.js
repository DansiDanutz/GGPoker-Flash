// Table chat and reactions (P0 slice C1).
// Validation and the ring buffer are pure; the service wires them to the database and
// the table sockets so index.js only delegates.

export const CHAT_MAX_CHARS = 280;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_SENDER_INTERVAL_MS = 1000;

// Reaction allowlist (Codex: three shipped client emoticons, integer IDs 1–3).
// `glyph` keeps the current client's emoji rendering working until the artwork lands (C2/C3).
export const REACTIONS = Object.freeze({
  1: Object.freeze({ id: 1, label: 'Angry', glyph: '😠' }),
  2: Object.freeze({ id: 2, label: 'Listening', glyph: '👂' }),
  3: Object.freeze({ id: 3, label: 'Laughing', glyph: '😂' }),
});

// Legacy `emote` frames carry a glyph; map the ones that match a reaction, drop the rest.
const LEGACY_EMOTES = Object.freeze({
  '😠': 1, '😡': 1, '🤬': 1, '😤': 1,
  '👂': 2, '🎧': 2, '🤔': 2,
  '😂': 3, '🤣': 3, '😆': 3, '😄': 3,
});

// C0 (Cc) controls, plus bidi overrides/isolates that can visually reorder a line.
const LINE_BREAKS = /[\t\n\r\v\f]+/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

/**
 * @param {unknown} text
 * @returns {{ ok: true, text: string } | { ok: false, error: string }}
 */
export function validateChat(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Message must be text' };
  const clean = text.replace(LINE_BREAKS, ' ').replace(CONTROL_CHARS, '').trim();
  const length = [...clean].length;
  if (length === 0) return { ok: false, error: 'Message is empty' };
  if (length > CHAT_MAX_CHARS) return { ok: false, error: `Message is longer than ${CHAT_MAX_CHARS} characters` };
  return { ok: true, text: clean };
}

/**
 * Only a real integer in the allowlist passes: "1", 1.5, null, [1] and {} are all rejected.
 * @param {unknown} id
 * @returns {{ ok: true, reaction: { id: number, label: string, glyph: string } } | { ok: false, error: string }}
 */
export function validateReaction(id) {
  if (typeof id !== 'number' || !Number.isInteger(id) || !Object.hasOwn(REACTIONS, id)) {
    return { ok: false, error: 'Unknown reaction' };
  }
  return { ok: true, reaction: REACTIONS[id] };
}

/** @param {unknown} emote @returns {number | null} */
export function reactionIdForEmote(emote) {
  if (typeof emote !== 'string') return null;
  return Object.hasOwn(LEGACY_EMOTES, emote) ? LEGACY_EMOTES[emote] : null;
}

/** Ring buffer append: returns a new array holding the latest `limit` lines. */
export function appendLine(buffer, line, limit = CHAT_HISTORY_LIMIT) {
  return [...buffer, line].slice(-limit);
}

/**
 * One slot per sender: a send inside the interval is refused, and a sender's
 * clock never moves another sender's.
 */
export function createSenderLimiter({ intervalMs = CHAT_SENDER_INTERVAL_MS } = {}) {
  let lastSent = new Map();
  return {
    tryAcquire(key, now = Date.now()) {
      const last = lastSent.get(key);
      if (last !== undefined && now - last < intervalMs) return false;
      lastSent = new Map(lastSent).set(key, now);
      return true;
    },
  };
}

export const tableChannel = (tableId) => `table:${tableId}`;

/** Per-table history: in-memory ring buffer, persisted to `chat_messages`, loaded lazily. */
export function createChatStore(db, { limit = CHAT_HISTORY_LIMIT } = {}) {
  let buffers = new Map();
  const load = (tableId) => db.prepare(
    'SELECT id, user_id, nick, message, created_at FROM chat_messages WHERE channel = ? ORDER BY id DESC LIMIT ?',
  ).all(tableChannel(tableId), limit).reverse().map((r) => Object.freeze({
    id: r.id, userId: r.user_id, nick: r.nick, message: r.message, at: Date.parse(`${r.created_at}Z`) || 0,
  }));
  const history = (tableId) => {
    if (!buffers.has(tableId)) buffers = new Map(buffers).set(tableId, load(tableId));
    return buffers.get(tableId);
  };
  return {
    history,
    append(tableId, { userId, nick, message, at = Date.now() }) {
      const prior = history(tableId);
      const info = db.prepare('INSERT INTO chat_messages (user_id,nick,table_id,channel,message) VALUES (?,?,?,?,?)')
        .run(userId, nick, tableId, tableChannel(tableId), message);
      const line = Object.freeze({ id: Number(info.lastInsertRowid), userId, nick, message, at });
      buffers = new Map(buffers).set(tableId, appendLine(prior, line, limit));
      return line;
    },
    /** Drop a table's cached history so the next read reloads it (after an admin delete). */
    forget(tableId) {
      if (!buffers.has(tableId)) return;
      const next = new Map(buffers);
      next.delete(tableId);
      buffers = next;
    },
  };
}

const TOO_FAST = 'You are sending messages too quickly';
const OBSERVER_READ_ONLY = 'Observers cannot chat at this table';

/**
 * Socket-facing chat service. `getEntry(tableId)` returns the live table entry
 * ({ table, clients }) or undefined.
 */
export function createChatService({ db, getEntry, store = createChatStore(db), limiter = createSenderLimiter() }) {
  const send = (ws, frame) => { if (ws.readyState === 1) ws.send(JSON.stringify(frame)); };
  const broadcast = (entry, event) => { for (const client of entry.clients) send(client, { type: 'event', event }); };
  const isMuted = (tableId, userId) => {
    const user = db.prepare('SELECT chat_muted FROM users WHERE id = ?').get(userId);
    if (user?.chat_muted) return true;
    return !!db.prepare('SELECT 1 FROM table_mutes WHERE table_id = ? AND user_id = ?').get(tableId, userId);
  };

  // Shared gate for every outgoing chat/reaction frame. Returns the entry or null (already answered).
  function admit(ws, tableId) {
    const entry = getEntry(tableId);
    if (!entry || !ws.userId) return null;
    if (!entry.table.seatOf(ws.userId)) { send(ws, { type: 'error', error: OBSERVER_READ_ONLY }); return null; }
    if (isMuted(tableId, ws.userId)) return null; // muted: dropped silently, as before
    return entry;
  }

  function postChat(ws, msg) {
    const entry = admit(ws, msg.tableId);
    if (!entry) return;
    const checked = validateChat(msg.message);
    if (!checked.ok) return send(ws, { type: 'error', error: checked.error });
    if (!limiter.tryAcquire(ws.userId)) return send(ws, { type: 'error', error: TOO_FAST });
    const line = store.append(msg.tableId, { userId: ws.userId, nick: ws.nick, message: checked.text });
    broadcast(entry, { type: 'chat', id: line.id, nick: line.nick, userId: line.userId, message: line.message, at: line.at });
  }

  function postReaction(ws, tableId, reactionId) {
    const entry = admit(ws, tableId);
    if (!entry) return;
    const checked = validateReaction(reactionId);
    if (!checked.ok) return send(ws, { type: 'error', error: checked.error });
    if (!limiter.tryAcquire(ws.userId)) return send(ws, { type: 'error', error: TOO_FAST });
    const { id, label, glyph } = checked.reaction;
    // Event type stays `emote` so the current client keeps rendering it.
    broadcast(entry, { type: 'emote', reactionId: id, label, emote: glyph, nick: ws.nick, userId: ws.userId, at: Date.now() });
  }

  return {
    handleFrame(ws, msg) {
      if (msg.type === 'chat') return postChat(ws, msg);
      if (msg.type === 'reaction') return postReaction(ws, msg.tableId, msg.id);
      if (msg.type === 'emote') {
        const id = reactionIdForEmote(msg.emote);
        if (id === null) return undefined; // legacy glyph without a reaction: dropped
        return postReaction(ws, msg.tableId, id);
      }
      return undefined;
    },
    sendHistory(ws, tableId) {
      send(ws, { type: 'chat_history', tableId, lines: store.history(tableId) });
    },
  };
}
