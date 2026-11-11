# Stage 8 — Intermediate Zoom-Out (Round 2): Remediation Design

**Target:** `docs/designs/remediation.md` full
**Reviewer:** fresh-context EGM Goldfish (`egm-zoom-out`)
**Inputs:** Stages 5–7 reports, design-of-record, code spot-checks
**Scope:** excludes findings already filed by Stages 5–7.

## Verdict

No. Stages 5–7 fixed the items and left the shape intact: the document is still a defect queue that grows one mechanism per symptom, and after five reviews it is larger than when it started. The right shape is two parts: (1) a declarative accepted-bounds register that amends the design-of-record and ships immediately, (2) a three-item ratchet list with a cost ceiling and a delete budget. Everything else becomes "Won't do (reason)".

## Findings

**1. Blocker — Scope: net-additive, no cost ceiling.**
Every phase adds; only the dead rake fallback is deleted. A remediation whose test is "small enough to verify" has no budget to check against.
*Recommendation:* top-of-document budget (≤1 new table, ≤1 new module, zero new deps, no new process/protocol surface, net LoC ≤ +150). Two savings fall out: `idempotency_keys.response` duplicates the ledger row; `table_sessions` is derivable (a `buyin` with no later `cashout`/`refund`). Rule: no derived persistence without a reconciliation rule; derive at read time.

**2. Blocker — Project alignment: crosses both Tier-2 lines.**
`dangro-clone.md:83` says Tier 2 must not add a new persistence model or trust boundary without a separate decision. The plan adds two tables and a nonce/health/subprotocol/Origin boundary with no decision row. Silence is not permitted by the DoR.
*Recommendation:* either record the decision that lifts the constraint with the budget, or drop the items and accept the bounds.

**3. Major — Recorded decisions treated as defects or reversals arbitrarily.**
The DoR already records the crash bound ("one buy-in per player per crash… reconciliation not implemented") and cashier bound ("not replay-protected"); code matches both. G1 and G2 are the same move — raising an accepted bound — yet G1 is must-fix and G2 is called a reversal.
*Recommendation:* classify each item as Defect (code contradicts doc) or Ratchet (doc accepted bound, code conforms, we choose to raise it). Defects get fixed; ratchets get cost/owner/expiry. This reduces six must-fix goals to about two.

**4. Major — Nothing enforces the rules after the fix.**
The plan adds ten prose invariants and zero recurrence guards. The choke point (`addTransaction`) already holds; no direct balance UPDATE exists outside it.
*Recommendation:* one guard test: no SQL write to a currency column outside `db.js`; every `transactions.kind` is in a declared enum; every balance-moving route has an invariant-table row. Twenty lines lock in today's good state.

**5. Major — Invariants are prospective-only.**
Existing DBs already contain stranded `buyin` rows; `table_sessions` starts empty, so the sweep refunds nothing historical and G1 passes on an empty set. `balance_after` continuity is asserted for a table with historic bypass rows.
*Recommendation:* state the dateline ("invariants hold for rows created after upgrade build N") and decide what happens to historic stranded buy-ins and chain gaps: written off with a count, backfilled, or ignored.

**6. Major — The seeded-bot conservation test is unsatisfiable.**
E.3 accepts synthetic minting; human winnings from bots become cashable `cashout` rows. A conservation test including bots must fail or exclude the minting it just accepted.
*Recommendation:* name domains: (a) ledger conservation among real users for ledgered events; (b) table-chip conservation modulo a recorded mint total per table; (c) mint budget per table per day. Test (a) and (b); (c) is the missing bound.

**7. Major — Reuse: the claim primitive and kind vocabulary already exist.**
`daily_claims` is already `(user_id, day)`; `transactions.kind` already has a vocabulary. Generalize `daily_claims` to `(user_id, kind, period_key)`; extend `transactions.kind` instead of a parallel enum. Ten per-subsystem constraints become one. `addTransaction` already returns the fresh balance, so G.6 is a call-site change.

## Nit

`critic_design_report.md` was not present when this reviewer started; the Stage 7 design-critic findings may be restated. It exists now.

## What survives

Alternatives A/B/C (B is the right rejection), the "already fixed" header, and the verification table's shape — it should be the spine of the ratchet list, not an appendix to five phases.
