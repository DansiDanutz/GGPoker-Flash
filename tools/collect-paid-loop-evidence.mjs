// SPDX-License-Identifier: AGPL-3.0-only
// Read-only collector for roadmap step S2 (prove the paid loop in production).
// Runs inside the game container: docker exec -i dangro-game-1 node --input-type=module - --table <id> --hours 24
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

export function collectPaidLoopEvidence(db, { tableFilter = null, hours = 24, now = new Date() } = {}) {
  const since = new Date(now.getTime() - hours * 3600_000).toISOString();

  const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const round = (value) => Math.round(value * 100) / 100;

  function parseHand(resultJson) {
    try {
      const parsed = JSON.parse(resultJson || '{}');
      return { rake: num(parsed.rake), pot: num(parsed.pot) };
    } catch {
      return { rake: 0, pot: 0 };
    }
  }

  const tables = db.prepare(
    'SELECT id, name, sb, bb, min_buyin, max_buyin, seats, rake_percent, rake_cap, chip_economy, private, owner_id FROM tables WHERE owner_id IS NOT NULL ORDER BY id',
  ).all().filter((row) => !tableFilter || row.id === tableFilter);

  if (tables.length === 0) {
    throw new Error(tableFilter ? `no organizer table ${tableFilter}` : 'no organizer tables');
  }

  const report = {
    generated_at: now.toISOString(),
    source: 'ggpoker.db (read-only)',
    window: { since, hours },
    tables: [],
    checks: [],
  };

  for (const table of tables) {
    const ownerId = table.owner_id;
    const hands = db.prepare(
      'SELECT result, created_at FROM hands WHERE table_id = ? AND julianday(created_at) >= julianday(?) ORDER BY julianday(created_at)',
    ).all(table.id, since);
    let totalPot = 0;
    let totalRake = 0;
    let rakedHands = 0;
    for (const hand of hands) {
      const parsed = parseHand(hand.result);
      totalPot += parsed.pot;
      totalRake += parsed.rake;
      if (parsed.rake > 0) rakedHands += 1;
    }

    const billing = db.prepare(
      'SELECT kind, amount_cents, reference, created_at FROM organizer_billing_ledger WHERE user_id = ? AND resource_id = ? AND julianday(created_at) >= julianday(?) ORDER BY julianday(created_at)',
    ).all(ownerId, table.id, since);
    const billingByKind = {};
    for (const row of billing) {
      billingByKind[row.kind] = (billingByKind[row.kind] || 0) + 1;
    }

    const sessions = db.prepare(
      'SELECT active, paid_until, next_charge_at, started_at FROM organizer_cash_sessions WHERE table_id = ? ORDER BY started_at DESC LIMIT 5',
    ).all(table.id);

    const journals = db.prepare(
      'SELECT kind, amount, created_at FROM organizer_chip_journals WHERE organizer_id = ? AND (from_account = ? OR to_account = ?) AND julianday(created_at) >= julianday(?) ORDER BY julianday(created_at)',
    ).all(ownerId, `table:${table.id}`, `table:${table.id}`, since);
    const journalByKind = {};
    for (const row of journals) {
      journalByKind[row.kind] = (journalByKind[row.kind] || 0) + 1;
    }

    const accounts = db.prepare(
      'SELECT account_key, balance FROM organizer_chip_accounts WHERE organizer_id = ? ORDER BY account_key',
    ).all(ownerId);
    const serviceBalance = db.prepare(
      'SELECT balance_cents FROM organizer_billing_accounts WHERE user_id = ?',
    ).get(ownerId);

    const paidHours = billing.filter((row) => row.kind === 'cash_hour' && row.amount_cents < 0).length;
    const checks = [
      { id: 'hands_observed', ok: hands.length > 0, detail: `${hands.length} hands in window` },
      { id: 'rake_observed', ok: totalRake > 0, detail: `${rakedHands} raked hands, ${round(totalRake)} total rake` },
      { id: 'setup_charge', ok: billing.some((row) => row.kind === 'setup'), detail: billingByKind.setup ? 'setup charge present' : 'no setup charge' },
      { id: 'hourly_charge', ok: paidHours > 0, detail: paidHours ? `${paidHours} paid hours` : 'no cash_hour debit yet' },
      { id: 'seat_open', ok: Boolean(journalByKind.seat_open), detail: journalByKind.seat_open ? 'seat_open journal present' : 'no seat_open journal' },
    ];

    report.tables.push({
      id: table.id,
      name: table.name,
      owner_id: ownerId,
      stakes: { sb: table.sb, bb: table.bb, min_buyin: table.min_buyin, max_buyin: table.max_buyin },
      rake: { percent: table.rake_percent, cap: table.rake_cap },
      economy: table.chip_economy ? 'organizer_chips' : 'play_money',
      private: Boolean(table.private),
      hands: {
        count: hands.length,
        raked: rakedHands,
        total_pot: round(totalPot),
        total_rake: round(totalRake),
        first: hands[0]?.created_at ?? null,
        last: hands.at(-1)?.created_at ?? null,
      },
      billing: {
        scope: 'table',
        rows: billing.length,
        by_kind: billingByKind,
        total_debits_cents: billing.filter((row) => row.amount_cents < 0).reduce((sum, row) => sum + row.amount_cents, 0),
        total_credits_cents: billing.filter((row) => row.amount_cents > 0).reduce((sum, row) => sum + row.amount_cents, 0),
        service_balance_cents: serviceBalance?.balance_cents ?? 0,
        service_balance_scope: 'organizer',
      },
      cash_sessions: sessions,
      chip_journals: { rows: journals.length, by_kind: journalByKind },
      chip_balances: accounts,
      chip_balance_scope: 'organizer',
      checks,
    });

    report.checks.push({ table: table.id, checks });
  }

  const integrity = db.prepare('PRAGMA quick_check').get();
  report.integrity = Object.values(integrity)[0];
  report.verdict = report.tables.every((table) => table.checks.every((check) => check.ok)) ? 'proven' : 'incomplete';
  report.blocking = report.tables.flatMap((table) =>
    table.checks.filter((check) => !check.ok).map((check) => `${table.id}: ${check.detail}`),
  );

  return report;
}

if (process.argv[1] === '-' || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  const db = new DatabaseSync('/data/ggpoker.db', { readOnly: true });
  try {
    console.log(JSON.stringify(collectPaidLoopEvidence(db, {
      tableFilter: arg('table'), hours: Number(arg('hours', '24')),
    }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 2;
  } finally { db.close(); }
}
