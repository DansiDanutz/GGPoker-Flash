# EGM re-review round 1 — not clean

**Target:** `docs/designs/2026-11-15-systematic-clone-mobile-egm.md` after the initial full-flow remediation.

## Reviewer status

| Reviewer / responsibility | Status |
| --- | --- |
| `zoom_out`, full document | completed |
| `comprehension`, feature and implementation ranges | completed |
| `design_critic`, feature range | completed |
| `structural`, feature range | completed |
| `style`, feature range | completed |
| `implementation_readiness`, implementation range | not run to completion: provider five-hour usage-limit error; partial notes were not accepted as a completed review |
| `codebase_details`, implementation range | not run to completion: provider five-hour usage-limit error; partial notes were not accepted as a completed review |
| `style`, implementation range | completed |

This round is **not clean** because required reviewers did not complete and the completed reviewers raised unresolved Blocker/Major findings. It does not count toward the two-consecutive-clean-round requirement.

## Findings and applied dispositions

All valid findings were **PROPOSE FIX**, with no external-unknown waiver.

1. Added `app/server/table.js` to the persistence foundation: staged or cloned table mutations, post-commit event delivery, propagated hook failures and database/memory/client consistency tests.
2. Required `UNIQUE(room_id, kind, revision)` and defined terminal/quarantine retention and a bounded 100-workflow/60-minute/512-MiB soak gate.
3. Separated valid-checkpoint restore from corrupt-checkpoint quarantine and explicit audited cancellation; removed ambiguous automatic rollback language.
4. Added Spin pre-event batch identity, canonical request hashing and an exact ordered per-match `operationIds` contract.
5. Defined aggregate RIMT mission/XP/VIP/points/Elo/history behavior, including different board winners and tied net results; required adaptation of reference negotiation/equity/pot code and prohibited Monte Carlo role selection.
6. Added Battle action/time-bank/blind clocks, stage reset/carry policy, cancellation limits and verified the reference's unused-place policy: unused shares merge into the last qualified place.
7. Corrected Bet-and-Muck to **Missing** and added an explicit closed-card river bet/raise contract and implementation phase.
8. Corrected Rabbit Hunt proof citations and required participant-only per-viewer delivery, stale-hand/restart and spectator-privacy tests.
9. Added explicit coverage/disposition for Bad Beat Jackpot, cash chat/reactions, Push Seat, Spin 6-Max, continuation-bet HUD, Rush observer chat/Helmet and tournament pause/cancel controls.
10. Required separately funded house scopes for Cash Drop, slots, Prop Bet and Bad Beat Jackpot; removed unscoped mint exceptions.
11. Replaced the unsupported log-metadata claim with a required `baseline-metadata.json`; corrected nonexistent Rabbit test citations.
12. Assigned secondary/global-state viewports, contrast thresholds, global reduced-motion checks, visual-inspection records and overlay geometry rules.
13. Replaced bare final `pnpm smoke` with an owned temporary-data/port/readiness/teardown wrapper.
14. Defined the final EGM roster, Auto Fold field units/last-selection rule/Cash Drop data, all nine HandRank labels and fixtures, RIMT retry hashing, exact bottom-clearance formula and dirty-tree hash inputs.
15. Replaced **Missing evidence** with the declared **Missing** status.

The revised design requires a fresh complete review. This report records remediation, not implementation or EGM convergence.
