/**
 * Durable wait list (REA F07). The pure model in waitlist.js lives in memory; this module
 * writes it to one SQLite row on every change and reads it back on boot, so queued players
 * keep their place across a restart.
 *
 * Seat offers are not restored as offers: a restart cashes every seat out and closes the
 * live tables, so a held seat no longer exists. Each holder goes back to the head of the
 * queue the offer came from and is offered a seat again when the table next runs.
 */
import * as waitlist from './waitlist.js';

const QUEUE_KEY = /^[tg]:.{1,200}$/;
const isUserId = (v) => Number.isSafeInteger(v) && v > 0;

export function ensureWaitlistTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS waitlist_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

export function saveWaitlist(db, state) {
  const json = JSON.stringify({ queues: state.queues, offers: state.offers });
  db.prepare(`INSERT INTO waitlist_state (id, state, updated_at) VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`).run(json);
}

/** Validate a stored snapshot into a fresh, frozen wait-list state (offers become queue heads). */
export function restoreWaitlist(raw) {
  const queues = {};
  const add = (key, ids, atHead = false) => {
    if (!QUEUE_KEY.test(key) || !Array.isArray(ids)) return;
    const current = queues[key] || [];
    const merged = atHead ? [...ids, ...current] : [...current, ...ids];
    queues[key] = [...new Set(merged.filter(isUserId))];
  };
  for (const [key, ids] of Object.entries(raw?.queues || {})) add(key, ids);
  const offers = Array.isArray(raw?.offers) ? raw.offers : [];
  for (const o of [...offers].reverse()) add(String(o?.queueKey || ''), [o?.userId], true);
  const frozen = Object.fromEntries(
    Object.entries(queues).filter(([, ids]) => ids.length).map(([key, ids]) => [key, Object.freeze(ids)]),
  );
  return Object.freeze({ ...waitlist.createWaitlist(), queues: Object.freeze(frozen) });
}

/** The saved wait list, or an empty one when nothing (or nothing valid) is stored. */
export function loadWaitlist(db) {
  try {
    const row = db.prepare('SELECT state FROM waitlist_state WHERE id = 1').get();
    return row?.state ? restoreWaitlist(JSON.parse(row.state)) : waitlist.createWaitlist();
  } catch {
    return waitlist.createWaitlist();
  }
}
