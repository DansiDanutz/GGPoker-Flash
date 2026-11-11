# Stage 7 — Style Audit: Remediation Design

**Target:** `docs/designs/remediation.md` L1–238
**Reviewer:** fresh-context EGM Goldfish (`egm-style`)

## Verdict

Tone is dry, structure follows the standard. It fails as a contract on three false claims about existing behavior and an alternatives section that attributes rejections to the author without evidence. A second tier of uncalibrated scope gates ("production-ready", "small set", "fix when touching") cannot be tested.

## Blockers

**B1 — "no disconnect policy" is false.** `ws.on('close')` marks disconnected, stands the seat and cashes out (`index.js` 1400–1418). What is missing is a grace window/resume, not a policy. C.3 silently reverses immediate cash-out; state the behavior change and its test.

**B2 — "never enter the ledger" is false for bot winnings.** Bot stacks are minted, but human winnings from bots are credited as `cashout` rows. State the accepted inflation and its bound.

**B3 — Alternatives rejections attributed to author with value judgment.** "Rejected by author" plus "should be true, not aspirational" violates the attribution rule and gives no technical trade-off. Replace with a decision row and concrete costs.

## Major

- **M1** — "design-of-record" undefined/unlinked; name the file.
- **M2** — "production-ready" undefined; replace with a verifiable handoff gate.
- **M3** — "no version" understates existing per-table `seq`; say whether `stateVersion` adopts or replaces it.
- **M4** — "8 defects + 3 gaps" unverifiable; label each item and cite the report.
- **M5** — "fix or state accepted risk" is a dead branch; delete.
- **M6** — G5 says non-query token, D.2 keeps query for dev; reconcile.
- **M7** — G1 "refund or restore" leaves the verb open; specify refund.
- **M8** — auto-fold/check branch unspecified; state the rule.
- **M9** — "mint without a recorded rule" misnames the defect; Spin multiplier is recorded, the ledger row is missing.
- **M10** — "most of the audit value" unmeasured; say what the ledger provides/lacks.
- **M11** — "fix when touching" unbounded; schedule in Phase 4 or drop.
- **M12** — self-referential instructions (D.4/D.5) leave the threat model unstated; write it declaratively.

## Nits

- Redundant scope sentence.
- Vague "several"/"large".
- Jargon (`mint`, `balance-mover`, `money system`).
- `buyin`/`buy-in` drift.
- Rhetorical verbs where mechanisms exist.
- Dev flag not named twice.
- G8 bundles six items.
- "Dead" rake fallback only unreachable at default 300.
- "working tree" has no commit reference.

## Checked and cleared

`addTransaction` atomicity, no idempotency/session fields, single-instance + poll, no EADDRINUSE handler, loopback/bearer/query token/`sandbox:false`, no `cfg.rng`, and the stale blackjack balance defect are all confirmed.

## Recommendation

Send B1, B2, B3 and M2 back before Stage 9. B1/B2 change scope (C.3 is a behavior change; E.3 needs a bound). B3/M2 are text fixes.
