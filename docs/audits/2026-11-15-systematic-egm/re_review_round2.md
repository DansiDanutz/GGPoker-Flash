# EGM re-review round 2 — complete, not clean

**Target:** revised `docs/designs/2026-11-15-systematic-clone-mobile-egm.md`.
**Requested reviewer coverage:** all eight reviewer responsibilities completed: full-file zoom-out; comprehension; feature design, structural and style; implementation readiness, codebase details and implementation style.

## Result

This was not a clean round. The reviewers found blockers in crash-boot refund ordering, cross-coordinator transaction boundaries, swallowed persistence-hook errors, receipt/schema design and the smoke readiness endpoint. Major findings also covered checkpoint cleanup, complete workflow dispositions, executable matrix cases, RIMT presentation/Elo/configuration, Spin partial results/configuration/presentation, Battle qualification/admin/full-field verification, side-game funding, Auto Fold/Cash Drop, HandRank/continuation bets, Rabbit restrictions/history, and final-state identity.

## Applied remediation

- Serialized commands per room with ordered multi-room locking, revision checks inside the lock, whole-coordinator memory staging, post-commit replies/events, exhaustive hook error propagation, and hard-crash checkpoint restore/quarantine before generic refunds.
- Added one-active-checkpoint enforcement, deletion of superseded rows, exact quarantine scope, orphan handling, measurable fixture capacity bounds, and exact SQLite schemas for receipts, checkpoints, house accounting and unique hand identity.
- Added authenticated HTTP routes, response/error/retry contracts, owner funding/configuration/quarantine routes, correct `/healthz` readiness, named soak/browser/matrix/soak harnesses and per-phase executable commands.
- Defined proof labels, mandatory final dispositions, additional missing workflow rows, explicit primary/secondary/landscape/viewport assignments, manifest-driven expected cases, functional assertions, contrast instrumentation and visual review records.
- Added RIMT persisted owner modes, precise eligibility/deadlines, numeric-net Elo reducer semantics, public multi-board projections, choreography, history modal/list/export files and explicit browser gates.
- Added complete Spin configuration, per-match partial-result semantics, presentation acknowledgements/deadline state machine, segment mapping, source motion/prize/insurance requirements and recovery gates.
- Corrected Battle direct qualification for 1–6 survivors, deterministic shootout grouping/bounds, configuration limits, per-stage blinds/clocks, admin operations, routes and 18-account end-to-end verification.
- Defined predeal funded Cash Drop, complete Auto Fold preference/editor rules, exact HandRank/draw/session/continuation-bet algorithms, Bet-and-Muck rank semantics and Rabbit variant/privacy restrictions.
- Scheduled funded migrations for slots/casino/Prop Bet/Cash Drop/Bad Beat Jackpot, required remaining features and explicit local branded-format rules.
- Defined dirty-tree identity including deletions/modes/evidence and separated the final self-referential report digest.

All findings were **PROPOSE FIX** and none were waived as external unknowns. These edits require another complete fresh review; this report is not a clean round or proof of implementation.
