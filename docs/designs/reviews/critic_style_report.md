# Stage 7 — Style Audit

**Target:** `docs/designs/dangro-clone.md` L1–L402
**Standard:** `feature-spec-standard.md`
**Reviewer:** fresh-context EGM Goldfish (`egm-style`)

## Verdict

Structurally compliant and mostly free of marketing language, but not reliable as a contract: two internal contradictions undermine scope and the ledger goal, and roughly a dozen claims are calibrated to an intended state rather than the state the evidence supports.

## Findings

### B1 — Blocker · Goal promises idempotency the invariant denies

Tier-1 goal says "every balance change is attributable and idempotent"; the invariant says cashier movements are not replay-protected. Both are unconditional.
**Recommendation:** Calibrate the goal to attributable + period-bounded, choose a disposition for cashier replay (phase or accepted risk), and remove the contradiction.

### B2 — Blocker · "Clone contract" omits Tier-1 surfaces

The narrow contract says "lobby → one cash table → cashier/ledger → admin mutation", excluding tournaments and rewards that the same document makes Tier 1 (admin creates tournaments/promotions/missions, CUJ 3/4).
**Recommendation:** Enumerate the Tier-1 surfaces term by term; state variant/branding coverage as the Tier-2 boundary.

### M1 — Major · Status self-contradictory

"Proposed — post-implementation design record" mixes pre-approval and retrospective. Use one status vocabulary and an as-observed commit/date.

### M2 — Major · "No readable, runnable source" is false

The record documents 8,694 decompiled classes and 11,632 localisation keys read from the installed payload. The problem is no *buildable* source, not no readable source, and the payload is installed locally, not "remote".
**Recommendation:** "Downloaded AIR payload with no buildable source; decompiled ActionScript and assets are readable locally but cannot be rebuilt or run."

### M3 — Major · Testing seam presented as decided while no tests exist

`node:test` is stated present-tense; no project test file existed at review time and the caveat sits after the evidence table.
**Recommendation:** Mark planned/committed accurately and put the caveat above the verification table.

### M4 — Major · Upload limits have three statuses

`readBody` already rejects >6 MB (413); per-ingestion 5 MB/3 MB caps are pending; NFR presents upload limits as delivered. State implemented vs pending in one sentence.

### M5 — Major · "One sequence" leaves atomicity unstated while NFR forbids partial updates

State the mechanism (SQLite transaction / rollback) or replace the NFR with actual behaviour.

### M6 — Major · "Phase 2" pointer for restart reconciliation is wrong

Phase 2 is trust-boundary hardening; reconciliation appears nowhere.
**Recommendation:** Add it to the owning phase or mark an open risk.

### M7 — Major · Risks are observations, not testable risks

No failure mode, trigger, mitigation or owner. Move the placement opinion to §Placement and use `risk → symptom → mitigation → owner`.

### M8 — Major · Alternatives omit the obvious build-vs-adopt option

No existing NLHE engine/ledger library alternative; asset reuse argues for Electron + React, not for hand-writing money code.
**Recommendation:** Add adopt-existing-engine with a concrete rejection reason and a migrate-later decision.

### M9 — Major · Rake stated twice, one copy unparameterized

One copy hard-codes 5%; the other uses `rakePercent`. Keep one parameterized statement and cross-reference.

### M10 — Major · Locale counts disagree

Doc says 30 of 32; UI exposes 30; README says 20; 471 strings of 11,632 keys. Name the artifact/count method and reconcile.

### M11 — Major · NFR numbers unmeasured or misattributed

10-second startup "target Mac" undefined; 1.4 GB is the source asset directory, not the packaged clone. Cite measurements or label targets.

### M12 — Major · Reviewer request names no decision or acceptance bar

"Challenge the invariants" has no outcome; name the decision owner and the two decisions requested.

### Nits

- Architecture diagram and lifecycle duplicate five constants.
- HTTP surface repeats auth in fragments; mixed path/noun granularity.
- Time bank and client-evaluator invariants repeated.
- `addTransaction` ownership rule repeated.
- Jargon: "frozen shim", "money-invariant formula", "parity chrome", "hand-roll".
- Vague quantifiers ("short splash", "small static handler", "trivially cheatable").
- Modal inconsistency: "should"/"belongs"/"must" for placement.
- Product name vs legacy userData path unstated.
- Weak admin credential described subjectively; move to Accepted Risks.
- Multiplayer non-goal vs README "devices" ambiguity.
- Missing paragraph break in Overview.

## What holds up

Two-problem split, Tier 1/Tier 2 gating, placement rule, honest Non-Goals, and the "Decided" list are strong. CDP caveat matches the code. Tone is dry and free of hype.

## Standard compliance

Satisfied in form: Problem, Goals/Non-Goals, Architecture, Alternatives, Risks, verification surface. Not satisfied in substance: alternatives omit the strongest option, risks lack mitigations, and the fresh-reader test fails on idempotency, scope, atomicity and locale counts.
