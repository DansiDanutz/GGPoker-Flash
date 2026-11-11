# Stage 9 — Implementation Readiness: Remediation Design

**Target:** `docs/designs/remediation.md` L239–330
**Reviewer:** fresh-context EGM Goldfish (`egm-implementation-readiness`)

## Verdict

Not ready to execute. The right files are named at a coarse level and some seams exist (`refundOpenSessions` is exportable, `shuffle(deck,rng)` exists, `money()`/`chips()` exist), but the money state machines and the test harness are undefined, and Phases 1–2 settle seats under contradictory rules.

## Blockers

1. **Phases 1 and 2 contradict on seat settlement.** Phase 1 closes sessions on cash-out; Phase 2 removes close-time cash-out (sit-out, stack stays), so quit/tab close leaves sessions open and only the buy-in is refunded. Name a lifecycle table: trigger → ledger row → state, covering `leave_table`, WS close, idle teardown and `before-quit`.
2. **`table_sessions` ignores rebuys, multi-table and atomicity.** `rebuy` debits outside `seatHuman`; a second table's buy-in would throw after debit under "one open session"; a crash refunds only the original buy-in. Specify `UNIQUE(user_id, table_id) WHERE state='open'`, rebuy increment, and one transaction for open/close/refund with the ledger row.
3. **Refund amount/idempotency undefined.** Buy-in-only refund forgives losses and ignores rebuys; the sweep races a second server. State the policy (buy-in total incl. rebuys, losses forgiven) and guard with `UPDATE … WHERE state='open'` + reference unique.
4. **No test harness.** `index.js` listens on import and exports nothing; "cashier replay", "Origin 403", "WS resync", "late action", "places 2/3 with production hooks" cannot run. Extract `createApp(db)`/`start({port:0})` and `createHooks(db)`, name test files, spawn with `PORT=0` + temp `GGPOKER_DATA`.
5. **"Reject late actions" breaks auto-fold.** `tick()` calls `act()` after the deadline; guard inside `act()` blocks auto-fold, guard at WS leaves a race. Specify `act(..., {auto:true})` bypass and a rejection log sink.

## Majors

- Origin/Host predicate must allow absent Origin (curl/startup) and derive port; otherwise startup and the documented curl fail.
- Disconnect/grace owner, timer, `sittingOut` clearing and reconnect double-debit are undecided.
- Seeded hands need `cfg.now`/`cfg.botSpeed` to drive `tick()`; bots act on wall clock.
- File lists miss `Cashier.tsx`, `TablePage.tsx` token transport, `table.js` rake removal and test files; Phase 4 names `rewards.js` but no step creates it.
- §F is unphased and includes a nonexistent leaderboard/GG Pass payout; `/api/rewards/spin` has no period guard.
- `casino.js`/`rewards.js` have no exports/signatures; blackjack state fate undecided.
- Idempotency response/status/retention and admin `set` exclusion unstated.
- `stateVersion` has no event log to resume; resets on table recreation. Use full-snapshot resync and reset on `joined`.
- Verification table lacks rows for sandbox, throttle, subprotocol, grace, claimPeriod, blackjack, resetpw, rake, non-USD admin set; `package_app.sh` is not a routine gate.

## Ready

Schema additions, `refundOpenSessions` seam, `shuffle(deck,rng)`, `claimPeriod` placement, and `money()` targets match the code. The blockers are undecided state machines and the missing harness, not the diagnosis.
