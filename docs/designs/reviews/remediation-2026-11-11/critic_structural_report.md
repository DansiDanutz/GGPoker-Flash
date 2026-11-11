# Stage 7 — Structural Review: Remediation Design

**Target:** `docs/designs/remediation.md` L1–238
**Reviewer:** fresh-context EGM Goldfish (`egm-structural`)

## Verdict

Two blockers. Mechanics are clean (single H1, sequential headings, uniform lists, all mandatory topics), but four unlinked identifier systems (defects 1–8, G1–G8, plan A–H, phases 1–5, nine unkeyed verification rows) leave no traceability; Risks is mis-shaped and placed last; status contradicts the body.

## Blockers

**S1 — Traceability.** No line connects defect → goal → plan → phase → verification. G7/G8 and D.3/D.4 have no rows; §H is ungoaled; "Places 2/3" has no goal; G2 spans two plan areas and two rows. Add one matrix `Defect | Goal | Plan § | Phase | Verification | Test` with two rules: every goal has ≥1 row; every row cites a goal.

**S2 — Risks absent from audited scope and mis-shaped.** The section is after the plan and verification, is a flat bullet list with no mitigation field, mixes risks/decisions/scope, and has no Limits block. Hoist `## Risks and Limits` above the plan, use `Risk ID | Failure | Mitigation | Phase | Status`, split Open Questions, and state limits (single process, one open seat, 30-day keys, loopback not a boundary).

## Major

- **S3 — No context for a fresh reader or terminology anchor.** Add what exists, what this decides, what is requested, with links; define ~25 identifiers or point to the parent glossary.
- **S4 — Zero links, three path roots.** Declare repo-root relative and link every path; resolve bare basenames.
- **S5 — A–E have Current state/Design; F–H do not.** Impose one template on all eight.
- **S6 — Blocking ranking is bold prose.** Promote to H3s and a `Blocking` column; repeat under each phase.
- **S7 — Duplicated normative content.** Six constraints appear 2–4 times; one canonical home per rule.
- **S8 — Alternatives attributed to author without link; C has no cost.** Use a criteria table with linked decisions.
- **S9 — Status contradicts body.** "Proposed" while two fixes are landed; add an Already Landed section and mark goals done/partial.
- **S10 — "8 defects + 3 gaps" never delivered.** Label D1–D8/S1–S3 or drop the clause.
- **S11 — Sequencing dependencies hidden.** claimPeriod before casino module, tables before handlers, sessions before sweep; add Dependencies.
- **S12 — No architecture delta.** Add persistence/protocol/module lists and one flow per money path.

## Nits

- Lettered plan areas collide with Alternatives A–C.
- DDL split across inline spans; use one `sql` fence.
- Decorative rules and incomplete metadata.
- Terminology drift (`Spin/battleroyale`, `GG Care`, period key).
- Prose where tables belong; §F is a transposed table.

## What passes

Single H1, sequential heading hierarchy, uniform Markdown, all mandatory topics present, a real do-nothing alternative, and goals with inline acceptance language.
