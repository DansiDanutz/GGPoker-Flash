# Paid Cash Game loop: controlled live verification

**Status:** Verified for setup, first-hour prepayment, two played hands, rake, pause,
cash-out and reconciliation. Hourly renewal and pricing-tier transitions remain pending.

**Run:** 17 November 2026, 21:22:09–21:22:35 Europe/Bucharest
(19:22:09–19:22:35 UTC), on DanGG.live.
**Tested release:** [0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4](https://github.com/OpenPoker4all/OpenPoker/tree/0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4).
This is a bounded operator-authorized live test, not a claim that all billing or recovery
scenarios are verified. It completes the first-hour paid-loop scope of **M1.4 / S2**.

## Observed results

| Check | Expected | Observed |
| --- | --- | --- |
| Manual funding | Verified receipt funds $15 of service credits once | NervixPay payment confirmed; $15 credited; identical receipt replay added nothing |
| Cash setup | One $10 debit | One $10 debit; repeated setup returned the same table |
| First prepaid hour | One $5 debit | One $5 debit; identical start replay and a distinct start within the paid hour added no charge |
| Scoped transfers | Three QA players receive 5,000 Cash Chips each | 15,000 transferred; transfer retries added nothing |
| Hand 1 | 5% rake on a 200-chip pot | 10 chips; two participants |
| Hand 2 | 5% rake limited to 300 chips | 9,000-chip pot, three participants, 300-chip rake |
| Rake ledger | One rake entry per hand | Two distinct entries totaling 310 chips |
| Pause and cash-out | Stop billing, close all seats, return stacks once | Session inactive; all seats closed; escrow zero; repeated stop/leave added no charge or cash-out |
| Cleanup | Return remaining QA chips and close test sessions | QA wallets zero; no open chip seats or test sessions; no further journal entries after cleanup |
| Unrelated balances | Preserve Play Money and memberships | Unchanged |
| Collector | All table-scoped checks pass | `proven`; hands, rake, setup, hourly charge and seat-open checks passed; SQLite integrity `ok` |

Service-credit reconciliation: **$0 + $15 funding − $10 setup − $5 first hour = $0**.
Cash Chip reconciliation after returning QA funds:
**98,190 organiser wallet + 1,810 cumulative rake burn + 0 QA wallets + 0 escrow = 100,000**.
The burn account contained 1,500 before this run; this test added 310. Rake is burned under
the implemented inventory model, not credited to the organiser's Cash Chip wallet.

The collector ran at 21:22:50 Europe/Bucharest against only the test table, using a one-hour
window beginning 20:22:50. That window contains the setup, first prepaid hour, hands and
chip movements. The short run did not last one hour: the first hour is charged in advance.
The collector's `proven` verdict alone is insufficient to establish reconciliation;
the separate harness asserted tariff amounts, retry behavior and before/after ledger totals.

## Evidence retained by the operator

The following artifacts belong to the same table and tested release. This public summary
omits account/table/payment identifiers, credentials and raw production records.

- `cash-credit-posted.json`: confirmed receipt reference, one top-up and duplicate-retry check.
- `cash-live-result.json`: release assertion, before/after balances, table-scoped charges,
  seat sessions, hand results, rake journals and cleanup assertions; `ok: true`.
- `cash-paid-loop-evidence.json`: read-only table/window report; `verdict: proven`.
- `cash-post-cleanup.json`: no open test sessions/seats and unchanged final balances/journal count.

The raw artifacts remain operator-local, following the [collector privacy policy](paid-loop-evidence.md#privacy).
Reproduce accounting logic with disposable fixtures; another live charge requires operator
approval. This summary documents the completed run rather than publishing private data.

## Pending live verification

- **Hourly renewal:** crossing the real one-hour boundary, exactly one next-hour debit under
  retries/concurrent triggers, insufficient-credit handling, and no renewal while paused.
- **Pricing-tier transitions:** organiser lifetime table-hour boundaries 50→51 ($5→$4),
  100→101 ($4→$3), 200→201 ($3→$2), and 500→501 ($2→$1), including concurrent tables.
  Existing isolated billing tests are separate evidence; none of these boundaries was crossed
  during this live run. Do not inflate production usage merely to test a boundary.

Automatic receipt fulfilment, external buybacks/withdrawals and restart recovery remain
separate scopes. This test does not complete the entire M1 milestone.
