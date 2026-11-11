# Implementation Review — Remediation Phases 1–4

**Date:** 2026-11-11
**Scope:** `320f00b..2b78993` plus the follow-up fixes in this change set.
**Reviewers:** fresh-context EGM `codebase_details` and an independent code-review subagent. Both read the working tree, not only the patch.
**Tests at review:** 20 passing; after fixes: 24 passing.

## Verdict

The design is implemented, but the first review found real money bugs in the new paths. All Blocking and Major findings were fixed and covered by tests. The remaining items are operational or accepted bounds, not release blockers.

## Blocking findings (fixed)

| Finding | Fix | Test |
|---|---|---|
| Registration inserted `start` and then credited `start` again; response used the pre-credit row. | Insert `balance = 0`, award one `welcome` row, re-read the user before responding. | `http.test.js` asserts `user.balance == welcome.amount == 600000`. |
| `sessionId` was attached after `table.sit()`; a throw or a later cash-out could write an `out:` marker-less cash-out and refund the buy-in twice. | `table.sit(..., sessionId)` stores it at seat creation; `cashOutSeat` always writes an `out:` marker (generating a legacy id if absent). | `http.test.js` live join/leave asserts matching `in:`/`out:` session ids. |
| Spin busts removed the seat without a close marker, so the next launch refunded a lost buy-in. | `onSeatBusted` hook writes a zero-amount `session_close` before the seat is cleared. | `engine.test.js` spin bust hook test. |

## Major findings (fixed)

| Finding | Fix |
|---|---|
| `claimReward` could record/return a new random amount after a crash when the ledger had already paid the old amount. | On `!applied`, read the existing `claim:` transaction amount and store/return that. `claims.test.js` crash-repair test. |
| `rake_cap = 0` became zero rake; test used bb=100 where 300 and 3×bb coincide. | `rakeCap > 0 ? rakeCap : 300`; test now covers bb=2000 and custom caps. |
| Admin `quickCredit` generated a new UUID per click and had no in-flight guard. | `creditBusy` ref blocks concurrent credits; server still enforces reference + amount. |
| CSP `script-src 'self'` broke Vite dev (inline React Refresh preamble). | CSP moved to an Electron response header, installed only in packaged mode; dev has no CSP. |
| `waitForListening` returned the port but `createWindow` kept the constant URL. | `startServer` assigns the reported port to `URL`; a mismatched/`0` port now loads the real one. |
| `rebuy` credited the stack even when the ledger insert was skipped. | Gate `seat.player.stack += amount` on `award.applied`; reject rebuys in tournaments. |
| Blackjack `deal` overwrote a live hand and stranded the previous bet. | Reject `deal` while `BJ_HANDS` has the user. |
| Global mission progress was still returned by `/api/lobby` and admin missions. | Lobby projects per-user `player_claims`; admin shows claimed counts, not the frozen global flag. |
| Missions never rolled over. | `missionPeriodKey` uses `mission:<id>:day:<date>` or `:week:<ISO>`; progress and claims reset by period. |
| `idx_transactions_reference` was dropped and rebuilt every boot. | Drop only a legacy partial index; `CREATE ... IF NOT EXISTS`; add `session_id` index. |
| Replay returned the historical `balance_after`. | Replay returns the current user balance; a different amount returns 409. |
| Cashier key generation sat outside `try`, so a throw left `inFlight` stuck. | Key generation moved inside `try`; `finally` always clears `inFlight`. |

## Test coverage added

* `ledger-session.test.js`: crash refund of buy-in + rebuy, no refund after bust/failed seat, duplicate skip, failing session does not abort sweep.
* `claims.test.js`: per-user isolation, second claim no-op, crash-repair amount.
* `http.test.js`: ephemeral port, lobby, registration single credit, deposit/withdraw replay, 409 on changed amount, live join/leave markers.
* `engine.test.js`: places 2/3 + winner, spin `onSeatBusted` hook, rake floor/cap at bb=2000.
* `ledger.test.js`: per-currency balance reconciliation.

## Remaining

* Admin user deletion leaves claims/transactions/session rows; startup logs a per-user sweep failure for the deleted id.
* A full Origin policy and WS state versioning remain open.
* Fault injection covers one failing session, not a database-level failure mid-sweep.
