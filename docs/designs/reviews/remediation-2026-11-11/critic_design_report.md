# Stage 7 — Design Critique: Remediation Design

**Target:** `docs/designs/remediation.md` L1–238
**Reviewer:** fresh-context EGM Goldfish (`egm-design`)

## Verdict

Not ready for implementation. The defect diagnosis is accurate, but the mechanisms for G1 (crash-safe seats) and G2 (replay-safe cashier) are not implementable as written. The core mismatch: the spec's unit of liability is the buy-in; the code's unit is the seat stack.

## Blockers

- **B-1 — Refund basis wrong.** `table_sessions.buyin` ignores rebuys, sat-out stacks and session P&L. Buy-in 5,000 + rebuy 5,000 → crash refunds 5,000, destroying 5,000. Use `chips_in`/`chips_out`, increment on every debit, refund `chips_in`; state what happens to unbanked results.
- **B-2 — "Use a transaction" is impossible.** `addTransaction` owns `BEGIN IMMEDIATE`; nested `BEGIN` throws. Use `transactions.reference = session:<id>` unique for exactly-once, or refactor transaction ownership. A crash between COMMIT and the `state` update otherwise double-refunds.
- **B-3 — Buy-in debit and session-open are not atomic; close paths unenumerated.** `seatHuman` debits then `table.sit()`; a crash in the gap strands the debit with no session. `cashout` has three call sites plus admin close. Require session insert + debit, and session close + cashout, in one transaction; enumerate all paths.
- **B-4 — Mandatory `Idempotency-Key` breaks the shipped client.** `api.ts` deposit/withdraw never send it and are not in Phase 1; every cashier call would 400. Add client changes and a documented missing-key response.
- **B-5 — Key is global and not payload-bound.** A second user can read the first user's stored response; same key with a different amount silently drops the second intent; check-then-act races. Scope `(user_id, key)`, hash the request, return 409 on mismatch, and require insert+movement in one transaction.
- **B-6 — `stateVersion` resets on table recreation/restart.** Clients that applied 4,900 discard the new instance's version 0 forever. Use `(tableEpoch, tableVersion)` and accept a new epoch as fresh.

## Majors

- **M-7** — Version guards reads, not writes; stale actions are silently auto-folded. Put version/epoch on actions, return `stale_action` + snapshot, define deadline grace.
- **M-8** — Origin/Host does not address the named foreign-process threat; absent-Origin is undefined and the origin is hardcoded to 5198. Split threats and derive the origin from config.
- **M-9** — Nonce is not secret (env + unauthenticated health), so it proves liveness, not ownership; health leaks pid/dbPath. Use the stdout pipe or require the nonce as a header; drop pid/dbPath.
- **M-10** — Port probe is TOCTOU; no `EADDRINUSE`; ephemeral port (bind 0, report on stdout) is unevaluated and simpler.
- **M-11** — `sandbox` goal has no decision; current posture is `sandbox:false`, no CSP, same-origin child windows. Decide with criteria and compensating controls.
- **M-12** — No migration ledger, backup or rollback for the money DB; `init()` ALTERs at import. Add `user_version`, backup, non-fatal sweep failure.
- **M-13** — "Chip conservation" is false globally (bots, casino, bonuses mint); test `balance == SUM(transactions.amount)` per currency and a per-account mint/sink table. RNG seam misses daily/wheel/roulette/table games.
- **M-14** — Lobby projection from `LIVE_TABLES` empties the lobby; decide real-only vs labelled synthetic, derive avg pot from `hands`, drop vpip.
- **M-15** — F is a subsystem list, not a design; no cap formula; missions are global, not per-user, so `claimPeriod` cannot fix it. Add a `claims` table and migrate missions.
- **M-16** — No traceability; "8 defects + 3 gaps" miscounted; item 8 bundles seven defects. Add a matrix now.
- **M-17** — Risk register misses every introduced risk; no per-defect accept/bound table.
- **M-18** — No rollback/recovery for the money file; add downgrade rules and correction rows.

## Nits

- Alternatives is a scope ladder, not per-defect technical options; add ephemeral port, persist-stack, client single-flight, claims-table options.
- Refund kind/state/reference vocabulary drift.
- Verification mixes auto/manual, no test names; curl contradicts Origin validation.
- "Make rake_cap required" has no mechanism.
- Non-Goals omit accepted money semantics.
- Bot inflation is unbounded and "never enters the ledger" false at cash-out.
- `stateVersion` scope/resync rate limit unspecified.

## Must change before implementation

1. `chips_in`/`chips_out` session accumulator and atomic debit/credit.
2. Resolve transaction nesting; reference-keyed refunds.
3. Scope/bind idempotency keys; land client change.
4. Table epoch + version on writes.
5. Private nonce or drop the ownership claim; evaluate ephemeral port.
6. Migration/backup/rollback + traceability + accepted-risk tables.
7. Formula caps, single RNG seam, sandbox decision.
