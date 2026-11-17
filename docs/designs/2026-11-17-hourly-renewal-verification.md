# Cash Game hourly renewal: controlled live verification

**Status:** Verified for one automatic $5 renewal, start-request retries, and no charge
across the following paused boundary with sufficient service credits.
**Still pending:** pricing-tier transitions, insufficient-credit renewal and restart recovery.

**Run:** 17 November 2026, 21:51:54–23:22:17 Europe/Bucharest
(19:51:54–21:22:17 UTC), on DanGG.live.
**Tested release:** [0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4](https://github.com/OpenPoker4all/OpenPoker/tree/0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4).
This extends the [first-hour paid Cash Game evidence](2026-11-17-paid-cash-loop-verification.md)
for M1.4 / S2. It does not complete all billing or M1 recovery scenarios.

## Observed results

| Check | Observed |
| --- | --- |
| Funding | Confirmed NervixPay receipt funded $10 once; identical receipt retry added nothing |
| Resume | Existing unexpired paid session resumed without another setup or hourly debit |
| Before boundary | Active session retained $10; no early charge |
| Automatic renewal | Exactly one $5 `cash_hour` debit at 22:22:12.864 Bucharest, 124 ms after the real 22:22:12.740 boundary; boundary-specific reference; paid time advanced exactly one hour |
| Retry safety | Old start-key replay and concurrent requests with the same new start key after renewal added no debit |
| Pause | Table paused at 22:22:12.966; repeated stop requests added no debit |
| Following boundary | Session stayed paused with $5 available through 23:22:12.740 and five seconds beyond; no further charge |
| Final state | Paused, $5 service credits; no open chip seats or test sessions; SQLite integrity `ok` |
| Reconciliation | Cash Chip account hash and journal count unchanged; Play Money balances and memberships unchanged |

Service credits: **$0 + $10 funding − $5 renewal = $5 remaining**.
The remaining funds were sufficient for another $5 hour, so the absence of a paused-boundary
charge was not caused by an empty account. No new setup fee was charged.

The existing production scheduler performed the renewal. The harness used normal billing
APIs and read-only database observations; it did not alter clocks, paid-until timestamps,
ledger entries or lifetime usage counters. This test used an active, empty table; no hands
or chip transfers were needed. Retry checks happened after the automatic boundary debit,
not as a claimed simultaneous scheduler/start race at the exact boundary.

## Evidence retained by the operator

- `renewal-credit-posted.json`: unique receipt credit and replay assertion.
- `renewal-live-result.json`: before/resume/renewal/retry/pause/final snapshots;
  `ok: true`, cleanup paused, exact timestamps and unchanged financial state.
- `renewal-live.log`: continuous assertion progress and final result.
- `renewal-before.json` and `renewal-after.json`: independent account/journal reconciliation.

Raw receipts, account/table identifiers and production records stay operator-local under
the [evidence privacy policy](paid-loop-evidence.md#privacy). This public summary contains
bounded results rather than private records. No application code or deployment changed.

## Pending live verification

- **Pricing-tier transitions:** lifetime table-hours 50→51 ($5→$4), 100→101 ($4→$3),
  200→201 ($3→$2), and 500→501 ($2→$1), including concurrent tables.
- **Insufficient-credit renewal:** insufficient funds at the boundary, safe pause/no invalid
  debit, and the subsequent funding/resume path without duplicate charges.
- **Restart recovery:** interruption around renewal or acknowledgement, durable payment
  identity, no duplicate debit, and correct paused/paid state after recovery.

Existing isolated tests are separate evidence. Do not inflate production usage or claim
these cases passed from this one real-hour run. Automatic funding fulfilment and broader
Mystery Bounty recovery remain separate work.
