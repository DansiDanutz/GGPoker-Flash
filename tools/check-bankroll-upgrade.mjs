// SPDX-License-Identifier: AGPL-3.0-only
// Run on a consistent offline SQLite backup, not the live database.
import { DatabaseSync } from 'node:sqlite';

if (process.argv.length !== 3) throw new Error('Usage: node tools/check-bankroll-upgrade.mjs <offline-backup.db>');
const db = new DatabaseSync(process.argv[2], { readOnly: true });
try {
  // A missing challenge table is not evidence that this is the right backup.
  db.prepare('SELECT login, play_chips, elo FROM users LIMIT 0').all();
  db.prepare('SELECT user_id, kind, currency, balance_after FROM transactions LIMIT 0').all();
  db.prepare('SELECT bet_id, user_id, side, stake FROM prop_bet_entries LIMIT 0').all();
  if (db.prepare('SELECT 1 FROM prop_bet_entries e WHERE NOT EXISTS (SELECT 1 FROM prop_bets b WHERE b.id=e.bet_id) LIMIT 1').get())
    throw new Error('A stake has no matching bet; reconcile the offline backup before upgrade.');
  const rows = db.prepare("SELECT status, COUNT(*) AS n FROM prop_bets WHERE type='bankroll' GROUP BY status").all();
  if (rows.some(row => !['open', 'running', 'refunded', 'settled'].includes(row.status)))
    throw new Error('Unrecognized Bankroll Challenge status; review backup before upgrade.');
  const counts = Object.fromEntries(rows.map(row => [row.status, row.n]));
  console.log(JSON.stringify({ open: counts.open || 0, running: counts.running || 0 }));
  if (counts.open || counts.running) process.exitCode = 1;
} finally { db.close(); }
