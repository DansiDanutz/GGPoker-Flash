# Paid-loop evidence (roadmap S2)

Roadmap step **S2** is evidence, not code: prove in production that a played cash table
produces a rake row, an hourly debit, a service-credit entry and a chip journal entry that
reconcile with each other.

This tool collects that evidence **read-only**. It never writes to the database and the report
stays on the machine that runs it.

## Verified run and remaining scope

The [17 November 2026 controlled live run](2026-11-17-paid-cash-loop-verification.md)
verified setup, first-hour prepayment, replay safety, 5% rake with a 300-chip cap, pause
and Cash Chip reconciliation on release `0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4`.
Its table-scoped verdict was `proven`. A [separate real-boundary test](2026-11-17-hourly-renewal-verification.md)
verified one $5 hourly renewal, retries without duplicate charges and no debit across the
following paused boundary with $5 available. A [separate insufficient-credit recovery run](2026-11-18-insufficient-credit-recovery-verification.md) verified automatic pause
without a renewal debit, rejected unfunded retries, one $5 top-up and one $5 resume debit
across retries, followed by pause and full reconciliation. **Active-hand expiry, pricing-tier transitions
and restart recovery remain pending live verification.** The collector verdict alone
does not verify renewal; use the separate timestamped ledger evidence.

## Collect

On Dexter (the host with the Docker socket):

```bash
bash ~/dangro/tools/paid-loop-evidence.sh home-2-fe0ac1d0 24
```

Arguments: `[table-id] [hours]` — both optional. Without a table id it reports every organizer
table in the window, which is the right default for a first run.

The report is written to `~/paid-loop-evidence/paid-loop-<UTC stamp>.json` and includes the live
`/healthz` payload (build commit) so the evidence cannot drift from the release it describes.

## What it reads

| Source | Fields |
|---|---|
| `tables` | organizer tables only (`owner_id IS NOT NULL`): stakes, rake percent/cap, economy |
| `hands` | count, pot and rake parsed from each hand's `result` JSON |
| `organizer_billing_ledger` | table-specific rows (`resource_id = table.id`), including `setup`, `cash_hour` and net debits |
| `organizer_cash_sessions` | `active`, `paid_until`, `next_charge_at`, `started_at` |
| `organizer_chip_journals` | per-kind counts involving this table account (e.g. `seat_open`, rake) |
| `organizer_chip_accounts` | balances per account key |
| SQLite | `PRAGMA quick_check` |

## Reading the verdict

`verdict: "proven"` requires every check to pass for every selected table:

- `hands_observed` — hands were played inside the window;
- `rake_observed` — at least one hand recorded rake > 0;
- `setup_charge` — the `$10` cash setup debit exists;
- `hourly_charge` — at least one `cash_hour` debit (negative amount, tiered rate);
- `seat_open` — the organizer chip journal recorded players taking seats.

`blocking` lists exactly what is missing, e.g.:

```json
["home-2-fe0ac1d0: no cash_hour debit yet", "home-2-fe0ac1d0: no seat_open journal"]
```

Before the smoke test the expected output is `incomplete`, and that is correct: the table exists,
the setup charge exists, but no hands have been played.

## The run (operator)

1. Pick or create one **private organizer cash table** with a known owner and record of its id.
2. Join with two accounts (or one account plus the operator), play enough hands for at least one
   pot to reach the rake trigger. Record the first prepaid hourly debit; testing renewal
   across a real hour boundary is a separate, explicitly funded scenario.
3. Run the collector for that table and the window.
4. Store the JSON with the receipt/screenshot evidence for that day; do **not** commit it.

## Acceptance for S2

- `verdict: "proven"`, or every remaining `blocking` item explained and accepted by the owner.
- `total_rake` equals the sum of rake the operator saw in hand results.
- Service-credit debits (setup + hours) equal the published tariff: `$10` setup, then the tiered
  hourly rate for the organizer's lifetime paid hours.
- Chip journal shows the seat/prize movement without a duplicate rake or double-debit.
- `service.commit` matches the release the operator is reporting against.

## Privacy

The report contains aggregate money figures, organizer ids and table ids — not nicknames, hole
cards or hand histories. Keep it local anyway; it is operational evidence, not a public dataset.

Timestamps are compared as SQLite dates, so native SQLite timestamps and ISO timestamps share the same window. Service-credit and chip balance snapshots remain organiser-wide and are explicitly labelled; they are not evidence that another table paid this table’s charges. Funding and membership rows without a table resource ID are not included in the table debit totals.
