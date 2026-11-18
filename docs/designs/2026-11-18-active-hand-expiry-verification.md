# Cash Game active-hand expiry: controlled live verification

**Status:** Verified for one normal heads-up showdown crossing service-credit expiry.
**Still pending:** all-in/side-pot expiry, pricing-tier transitions and restart recovery.

**Run:** 18 November 2026, approximately 01:43–01:56 Europe/Bucharest
(17 November 23:43–23:56 UTC), on DanGG.live.
**Tested release:** [0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4](https://github.com/OpenPoker4all/OpenPoker/tree/0ce0cf7d6e830b1e9dcefce0a31b443c467f36d4).
This extends [insufficient-credit recovery](2026-11-18-insufficient-credit-recovery-verification.md)
for M1.4 / S2. It does not complete every expiry or recovery scenario.

## Disposable reproduction (required for future tests)

Run `node --test app/server/active-expiry.test.js` from the repository root.
The fixture creates an in-memory SQLite database, synthetic users, 500 service-credit
cents and 100,000 Cash Chips. It wires the existing billing gate and chip settlement
hook into PokerTable, starts a heads-up hand, advances only the injected fixture billing
clock one hour, and settles the hand after the unfunded pause. Assertions cover one
200-chip pot, 10 rake, 9,990 returned stacks, idempotent settlement, blocked next deals,
three rejected unfunded starts, one initial hourly debit and reconciled chip supply.
The database is closed in finally; no network, payment credentials or production data
are used. This automated reproduction passed on 18 November 2026.

The following live run is a historical operator-authorized record, not a procedure to
repeat with customer balances. Future verification must use the disposable fixture or
CLI Play Money sandbox as required by AGENTS.md. All-in/side-pot expiry, pricing-tier
transitions and restart recovery remain pending.

## Observed historical results

| Check | Observed |
| --- | --- |
| Preparation | Resumed existing unexpired paid time with $0 service credits; no new setup/hour debit; two QA players received 5,000 organiser Cash Chips each, with transfer retries adding nothing |
| Active hand at expiry | Same unique hand ID and preflop actor recorded at 01:53:58.554 and 01:54:07.271 around the real 01:54:04.933 expiry; held action remained within its normal 15-second deadline |
| Billing pause | Billing inactive after expiry, with no renewal debit; no clocks, paid-until timestamps or ledger rows changed by the harness |
| Hand settlement | Calls/checks completed a normal showdown after expiry: 200-chip gross pot, 10 rake at 5%, 190 awarded to QA Player 2; final stacks 4,900 and 5,090 |
| Single settlement | Exactly one new persisted hand and one 10-chip rake journal reference tied to the unique hand ID |
| Next deal blocked | After reconnecting their existing seats, both players remained connected, ready, funded and not sitting out from 01:55:32.220 to 01:56:02.383; no new hand or charge, billing inactive |
| Unfunded retries | Three start requests returned HTTP 402 without another service debit |
| Cleanup | Players sat out, cashed out and returned remaining chips; transfer replays added nothing; table paused, no open chip seats or remaining QA authentication sessions |
| Reconciliation | Service balance remained $0; Play Money balances and memberships unchanged; SQLite integrity `ok` |

Cash Chips: **10,000 seated − 10 rake = 9,990 returned**. Final organiser wallet
**98,180 + 1,820 historical rake/burn = 100,000**; QA wallets and table escrow were zero.
The 300-chip rake cap stayed configured but this 200-chip pot did not exercise it.

## Harness failure and recovery

The first harness incorrectly identified a new completed hand by requiring its hand number
to exceed earlier persisted hand numbers. The live table counter had reset to 1. The hand
settled, but the harness did not recognize completion and timed out; its cleanup paused
the table and closed the QA connections. The failed result is retained. This was a test
reporting error, not evidence of an application settlement failure.

The recovery harness used the unique hand ID and persisted result to verify the winner,
exact stacks and single rake journal. It rejoined the existing seats and performed a fresh
30-second ready-player no-deal check before cash-out and reconciliation. Recovery completed
with `ok: true` and `cleanupPaused: true`. The initial harness retains the actual pre/post-
expiry snapshots and inactive billing state; the recovery verifies settlement and blocking.
Do not describe this as an uninterrupted successful harness run or a process-restart drill.

## Evidence retained by the operator

- `active-expiry-result.json`: original harness error plus pre/post-boundary hand snapshots.
- `active-expiry-recovery-result.json`: unique-hand settlement checks, ready-player observation,
  rejected starts, cash-out and final reconciliation.
- `active-expiry-final-audit.json`: independent post-logout financial/session audit.
- `active-expiry.log` and `active-expiry-recovery.log`: original and recovery execution records.

Raw account/table identifiers, cards and production records remain operator-local under the
[evidence privacy policy](paid-loop-evidence.md#privacy). No application code or deployment
changed during this test.

## Pending live verification

- **All-in/side-pot expiry:** settlement and next-deal blocking for all-in hands and multiple
  side pots crossing expiry, with full chip reconciliation.
- **Pricing-tier transitions:** lifetime table-hours 50→51, 100→101, 200→201 and 500→501,
  including concurrent tables and the corresponding $5/$4/$3/$2/$1 rates.
- **Restart recovery:** interruption around renewal or acknowledgement, durable payment
  identity, no duplicate debit and correct paused/paid state after recovery.

Do not infer these cases from the normal heads-up showdown or inflate production usage
for testing. Broader Mystery Bounty recovery and automatic funding fulfilment remain separate.
