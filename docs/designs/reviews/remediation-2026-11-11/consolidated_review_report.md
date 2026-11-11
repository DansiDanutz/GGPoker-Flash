# EGM Consolidated Review — Remediation Design

*   **Target:** `docs/designs/remediation.md` (330 lines)
*   **Method:** Elephant-Goldfish Model, `dsh-egm` 0.3.1
*   **Stages run:** 5 (Zoom Out), 6 (Comprehension), 7 (Design, Structural, Style), 8 (Intermediate Zoom Out), 9 (Implementation Readiness, Codebase Details)
*   **Review date:** 2026-11-11
*   **Reports:** [zoom_out](zoom_out_report.md) · [comprehension](comprehension_report.md) · [critic_design](critic_design_report.md) · [critic_structural](critic_structural_report.md) · [critic_style](critic_style_report.md) · [intermediate_zoom_out](intermediate_zoom_out_report.md) · [implementation_readiness](implementation_readiness_report.md) · [codebase_details](codebase_details_report.md)

## Verdict

**Not ready to implement.** The defect diagnosis is largely accurate, but the remediation is net-additive, contradicts the design-of-record on scope, and specifies money state machines that cannot be built as written. The same defects are enumerated five times with no traceability, and most verification rows cannot run because the server is not importable.

The single highest-value change is to shrink the document: classify the eight items as **defects** (code contradicts the record) or **ratchets** (the record accepted a bound, the code conforms, and we now choose to raise it), ship a declarative accepted-bounds register, and keep only the ratchets that fit a fixed budget.

## Consolidated blockers

| ID | Finding | Evidence | Required change |
|---|---|---|---|
| C1 | **Refund model is wrong.** `table_sessions.buyin` ignores rebuys, sat-out stacks and session P&L. A 5,000 buy-in + 5,000 rebuy refunds 5,000, destroying 5,000. | design A.3; `index.js` `seatHuman`, `rebuy`, cash-out paths | Store `chips_in`/`chips_out`, increment on every seat debit, refund `chips_in`. Decide what happens to unbanked winnings/losses. |
| C2 | **Debit/session-open and close/cash-out are not atomic; close paths unenumerated.** A crash in the gap strands a debit with no session. | `seatHuman` debits then `table.sit()`; three cash-out sites plus admin close | Session insert + debit, and session close + cash-out, in one transaction. Enumerate every path, including admin close and idle teardown. |
| C3 | **"Use a transaction" for the refund sweep is impossible.** `addTransaction` owns `BEGIN IMMEDIATE`; nesting throws; a crash between COMMIT and the `state` update double-refunds. | `db.js` `addTransaction` | Use `transactions.reference = session:<id>` unique for exactly-once, or refactor transaction ownership. |
| C4 | **Mandatory `Idempotency-Key` breaks the shipped client.** `api.deposit`/`withdraw`/`admin.credit` send none; `Cashier.tsx`/`Admin.tsx` are in no phase. | `api.ts`, `Cashier.tsx`, Phase 1 | Add client files in the same phase, or make the key optional-but-honoured; define the missing-key response. |
| C5 | **Idempotency key is global and not payload-bound.** A second user can read the first user's stored response; the same key with a different amount silently drops the second intent; check-then-act races. | design A.2 | `(user_id, key)` primary key, request hash, 409 on mismatch, insert + movement in one transaction. |
| C6 | **`stateVersion` resets on table recreation and restart.** A client at 4,900 discards the new instance's 0 forever; G4's freeze is caused by the fix. | `LIVE_TABLES.delete`, new `PokerTable` | Use `(tableEpoch, tableVersion)`; a new epoch is accepted as fresh. |
| C7 | **Late-action rejection breaks auto-fold.** `tick()` calls `act()` after the deadline; a guard inside `act()` blocks the auto-fold, a WS guard leaves the race. | `table.js` `tick`/`act` | Add `act(..., {auto:true})` bypass and a named rejection log. |
| C8 | **No test harness; most verification rows cannot run.** `index.js` listens on import and exports nothing; six rows need HTTP/WS integration tests. | `index.js`, `package.json` test script | Extract `createApp(db)`/`start({port:0})` and `createHooks(db)`; name test files; spawn with temp DB. |
| C9 | **Migration, backup and dateline are unspecified.** `init()` ALTERs at import; the sweep mutates balances with no backup/rollback; existing stranded buy-ins are not addressed. | `db.js` init | `user_version` migrations, pre-migration backup, non-fatal sweep failure, a dateline for historic rows. |
| C10 | **Scope crosses the predecessor's own Tier-2 rule.** The plan adds two tables and a new trust boundary without the separate decision the record requires; no budget or kill list. | `dangro-clone.md` Tier-2 rule | Record the decision with a budget (≤1 table, ≤1 module, no new protocol surface) or drop the items. |

## Consolidated major findings

*   **False current-state claims.** A disconnect policy exists (stand + cash-out); events already carry `seq`; bot winnings do reach the ledger as `cashout`. Correct the baseline before proposing replacement behavior.
*   **Mission claims are global, not per-user.** `missions.claimed/progress` are shared rows; one user claims and all are locked out. `claimPeriod` cannot fix this. Add per-user claim rows or state the accepted bound.
*   **`sandbox` is undecided.** "Enable if it works, else accept in writing" is not a decision, and the current posture (`sandbox:false`, no CSP, same-origin child windows) is understated.
*   **Port/nonce design is weak.** The probe is TOCTOU; the nonce is readable via env and unauthenticated `/api/health`, so it proves liveness, not ownership; health leaks `pid`/`dbPath`. Use the child's stdout/exit code and `health.pid === serverProc.pid`, or bind port 0.
*   **Origin/Host does not address the named foreign-process threat**, and the absent-Origin rule is undefined; a naive allowlist breaks `curl`/startup and the Vite dev origin.
*   **Lobby projection empties the lobby.** `LIVE_TABLES` holds only human-opened tables; projecting 100 seeded tables yields 0. Decide real-only vs labelled synthetic, and name a source for `avgPot`/`vpip`/`handsPerHour`.
*   **Conservation/RNG domains are undefined.** Global conservation is false (bots, casino, bonuses); test `balance == SUM(transactions.amount)` per currency and record mint totals. `Math.random` also drives roulette, sic bo, prop bets, daily and the wheel; export the existing `seededRandom` and route a single seam.
*   **`casino.js`/`rewards.js` have no interfaces.** No exports, signatures, game list or blackjack-state decision; the split is the largest unphased refactor.
*   **Rake fallback removal is a behavior change** and breaks the test that asserts it; `getSetting('rake_cap',300)` masks a missing row.
*   **File lists miss required files**: `Cashier.tsx`, `TablePage.tsx` token transport, `table.js` rake removal, and test files.
*   **Idempotency retention/response contract** is unstated; `./package_app.sh` is not a routine gate.

## Traceability gaps

The document has five identifier systems (defects 1–8, G1–G8, plan A–H, phases 1–5, verification rows) and no mapping. G7/G8 and the sandbox/throttle work have no verification rows; "places 2/3" and §H have no goal; "eight defects + three gaps" never identifies the three. A traceability matrix (`Defect | Goal | Plan | Phase | Test | Automation`) is required before implementation.

## Recommended revision

**1. Split the document in two.**

*   **Accepted-bounds register** (ships now): the crash bound (one buy-in per seat), cashier replay, synthetic lobby counts, bot/Spin inflation, and the local threat model. Each entry states the bound, the observable, and the date.
*   **Ratchet list** (implementation): only items that raise a recorded bound with a cost and an owner.

**2. Classify before sequencing.**

*   **Defects**: admin `set` (fixed), blackjack settle (fixed), false current-state claims, mission scoping, disconnect/close contradiction.
*   **Ratchets**: crash refund, cashier replay, local threat model, bot minting, protocol version.

**3. Keep four ratchets, delete the rest.**

1.  Crash refund through the ledger choke point: `chips_in`/`chips_out` or a `reference`-keyed exactly-once refund, atomic with the debit/cash-out.
2.  Per-user claims table (generalize `daily_claims` to `(user_id, kind, period_key)`), replacing the global mission flag.
3.  One replay mechanism only (unique `reference`; no `idempotency_keys.response`) **or** the documented bound, with client changes in the same phase.
4.  Port ownership via child exit code + stdout/pid (or ephemeral port), no nonce over HTTP.

**Delete:** the nonce/health handshake, `stateVersion`/`resync` (full snapshot on `join_table` is enough), the 30 s disconnect state machine, the idempotency response cache, the `casino.js`/`rewards.js` split, and the `INV-*`/decisions layer.

**4. Add the missing harness.** Extract `createApp(db)` and `createHooks(db)`; spawn with `PORT=0` and temp `GGPOKER_DATA`; name `http.test.js`, `ws.test.js`, `casino.test.js`, `ledger.test.js`.

**5. Fix the text.** Link the design-of-record, correct the false baselines, replace "Rejected by author" with technical trade-offs, define "production-ready", and add a Limits block.

## Verification performed for this review

*   All eight reports were produced by fresh-context, read-only Goldfish reviewers.
*   Findings were checked against `db.js`, `index.js`, `table.js`, `poker.js`, `main.cjs`, `api.ts`, `TablePage.tsx`, `Cashier.tsx`, `engine.test.js`, `ledger.test.js`.
*   No design or code changes were made during the review.

## What is worth keeping

The problem statement, Alternatives A/B/C (B is the right rejection), the "already fixed" header, the verification-table shape, and the instinct to declare G7/G8 non-blocking. The design's core idea — make the record true — is right; the fault is trying to achieve it mostly by building.

*Produced with EGM, `dsh-egm` 0.3.1.*
