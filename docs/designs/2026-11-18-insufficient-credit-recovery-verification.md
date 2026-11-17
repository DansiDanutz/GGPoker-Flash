# Cash Game insufficient-credit recovery: controlled live verification

**Status:** Verified for an empty table: automatic pause at insufficient-credit renewal,
rejected unfunded retries, receipt credit once, and funded resume with one hourly debit.
**Still pending:** active-hand expiry, pricing-tier transitions and restart recovery.

**Run:** 17 November 23:45 through 18 November 00:54, Europe/Bucharest
(17 November 21:45–22:54 UTC), on DanGG.live.
**Tested release:** [0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4](https://github.com/OpenPoker4all/OpenPoker/tree/0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4).
This extends the [hourly renewal evidence](2026-11-17-hourly-renewal-verification.md)
for M1.4 / S2; it does not complete every billing or recovery scenario.

## Observed results

| Check | Observed |
| --- | --- |
| Initial paid hour | Existing $5 service balance funded exactly one hour at 23:45:01.259 Bucharest; repeating the start request did not debit again |
| Before expiry | Table remained active during its paid hour with $0 remaining and no additional ledger entry |
| Unfunded boundary | Real boundary 00:45:01.259 on 18 November; automatic inactive state observed at 00:45:01.964, 705 ms later, before cleanup |
| Failed renewal | No renewal debit, negative balance or paid-until extension |
| Unfunded retries | Three resume attempts returned HTTP 402 `insufficient_credit`; no debit and no successful idempotency-operation record |
| Recovery funding | Confirmed NervixPay USDT receipt on Polygon funded $5 once; repeating the receipt-credit request left $5, not $10; the separate unpaid USDC request was not credited |
| Funded resume | Reused the previously rejected key at 00:54:04.933; three concurrent starts and a later retry produced one $5 hourly debit and exactly one hour of paid time |
| Final pause | Repeated stop requests and a five-second follow-up added no debit; final state paused, $0 service credits |
| Reconciliation | Full service ledger summed to $0; Cash Chip account hash and journal count unchanged; Play Money balances and memberships unchanged; no open chip seats; SQLite integrity `ok` |

Service credits: **$5 opening − $5 initial hour + $5 recovery top-up − $5 resumed hour = $0**.
No new setup fee was charged. Cash Chips: **98,190 organiser wallet + 1,810 historical
rake/burn = 100,000**; player wallets and table/ticket escrows were zero. The billing test
created no chip transactions and collected no additional rake.

The production scheduler performed the pause. The harness used normal billing APIs and
read-only database observations, without changing clocks, paid-until timestamps, ledger
rows or lifetime usage counters. The table was empty: this proves billing recovery, not
settlement of a hand crossing expiry. The final post-resume pause was observed for five
seconds; no second full boundary is claimed for this run. The separate hourly-renewal run
already verified no charge across a paused boundary with sufficient credits.

## Evidence retained by the operator

- `insufficient-live-result.json`: initial hour, real boundary pause, three rejected retries,
  unchanged chip hash/journal and cleanup; `ok: true`.
- `insufficient-credit-posted.json`: one receipt-backed $5 credit and replay assertion.
- `insufficient-resume-result.json`: concurrent retries, exactly one $5 debit, one-hour
  entitlement, final pause and ledger reconciliation; `ok: true`.
- `insufficient-during.json`, `insufficient-paused.json`, `insufficient-after.json`:
  independent account/journal reconciliation.
- `insufficient-live.log` and `insufficient-payment-confirmed.jpg`: monitoring and receipt evidence.

Raw receipts, transaction hashes, account/table identifiers and production records remain
operator-local under the [evidence privacy policy](paid-loop-evidence.md#privacy).
No application code or deployment changed.

## Pending live verification

- **Active-hand expiry:** insufficient credit at a renewal boundary during an active hand;
  correct hand settlement, safe pause before another deal, and chip reconciliation.
- **Pricing-tier transitions:** lifetime table-hours 50→51 ($5→$4), 100→101 ($4→$3),
  200→201 ($3→$2), and 500→501 ($2→$1), including concurrent tables.
- **Restart recovery:** interruption around renewal or acknowledgement, durable payment
  identity, no duplicate debit, and correct paused/paid state after recovery.

Do not inflate production usage or infer these cases from this empty-table run. Automatic
funding fulfilment and broader Mystery Bounty recovery remain separate work.
