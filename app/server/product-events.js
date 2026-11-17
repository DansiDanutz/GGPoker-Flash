// SPDX-License-Identifier: AGPL-3.0-only
// Product event taxonomy v1 (roadmap S3).
//
// Ground rules:
//  - recording never throws: analytics must not break a hand, a login or a checkout;
//  - only declared events and declared property keys are stored, so card content,
//    credentials and free text cannot leak in by accident;
//  - every summary splits human and bot activity.
export const EVENT_VERSION = 1;

/** Declared events and the only property keys each may carry. */
export const EVENT_TAXONOMY = Object.freeze({
  guest_joined: ['source'],
  account_created: ['source'],
  hand_completed: ['table_id', 'pot', 'rake'],
  checkout_started: ['product_id', 'amount_cents'],
  entitlement_activated: ['product_id'],
  renewal_completed: ['product_id'],
});

const MAX_PROPERTY_JSON = 1024;
const MAX_STRING = 120;
const RETENTION_DAYS = 400;

function sanitizeValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, MAX_STRING);
  return null;
}

function sanitizeProperties(name, properties) {
  const allowed = EVENT_TAXONOMY[name] || [];
  const clean = {};
  for (const key of allowed) {
    if (!properties || !(key in properties)) continue;
    const value = sanitizeValue(properties[key]);
    if (value !== null) clean[key] = value;
  }
  const encoded = JSON.stringify(clean);
  if (encoded.length <= MAX_PROPERTY_JSON) return encoded;
  return '{}';
}

export function createProductEvents(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER NOT NULL,
      name TEXT NOT NULL,
      user_id INTEGER,
      is_bot INTEGER NOT NULL DEFAULT 0,
      properties TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS product_events_name_time ON product_events(name, created_at);
  `);

  const insert = db.prepare(
    'INSERT INTO product_events (version, name, user_id, is_bot, properties, created_at) VALUES (?,?,?,?,?,?)',
  );

  function record(name, { userId = null, isBot = false, properties = {}, now = new Date() } = {}) {
    if (!Object.hasOwn(EVENT_TAXONOMY, name)) return false;
    try {
      insert.run(
        EVENT_VERSION, name, userId, isBot ? 1 : 0, sanitizeProperties(name, properties), now.toISOString(),
      );
      return true;
    } catch {
      return false; // never let analytics break gameplay
    }
  }

  function summary({ days = 30, now = new Date() } = {}) {
    const since = new Date(now.getTime() - days * 86400_000).toISOString();
    const rows = db.prepare(
      `SELECT name, is_bot, COUNT(*) AS count FROM product_events WHERE created_at >= ?
       GROUP BY name, is_bot ORDER BY name, is_bot`,
    ).all(since);
    const events = {};
    for (const name of Object.keys(EVENT_TAXONOMY)) {
      events[name] = { human: 0, bot: 0, total: 0 };
    }
    for (const row of rows) {
      const bucket = events[row.name] || (events[row.name] = { human: 0, bot: 0, total: 0 });
      if (row.is_bot) bucket.bot += row.count; else bucket.human += row.count;
      bucket.total += row.count;
    }
    return { version: EVENT_VERSION, since, days, events };
  }

  function prune({ now = new Date(), retentionDays = RETENTION_DAYS } = {}) {
    const before = new Date(now.getTime() - retentionDays * 86400_000).toISOString();
    return db.prepare('DELETE FROM product_events WHERE created_at < ?').run(before).changes;
  }

  return { record, summary, prune, taxonomy: EVENT_TAXONOMY };
}
