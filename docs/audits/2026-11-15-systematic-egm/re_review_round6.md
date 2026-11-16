# EGM stabilization re-review round 6 — complete, not clean

All eight requested reviewer responsibilities completed. Agents 51, 52 and 53 initially returned `not run` because the prompts used non-existent skill-local persona paths; each was retried once with the canonical `egm/0.1.0/agents/...` and standards paths and completed. No partial findings were counted.

## Reviewer status

- `zoom_out` (agent-49): completed
- `comprehension` (agent-50): completed
- feature `design_critic` (agent-51): completed on the required single retry
- feature `structural` (agent-52): completed on the required single retry
- feature `style` (agent-53): completed on the required single retry
- implementation `implementation_readiness` (agent-54): completed
- implementation `codebase_details` (agent-55): completed
- implementation `style` (agent-56): completed

## Verdict

Not clean. Reviewers found recovery-authority conflicts, waiting-Spin transport gaps, house-movement collisions, omitted private-state fields, incomplete Spin/table integration and missing workflow proof links. The global-writer design also received an architectural challenge. No finding was counted as settled merely because an earlier round had changed the text.

## Repairs applied

- Removed the second snapshot recovery table and ordinary-cash/tournament snapshot restoration. Ordinary cash uses only existing crash refunds; tournaments use only settled-hand snapshots; new active workflows use only active checkpoints; casino rounds use their own records.
- Replaced the global writer queue/generic cloning with synchronous outer transactions, per-aggregate revisions and workflow-scoped capture/install. Added deterministic system-actor commands for timers, bots and stage transitions.
- Limited foundation migrations to shared tables and assigned later tables to their vertical workflows.
- Removed derived-statistic counter tables; session and continuation metrics now reuse settled-hand records and `table-stats.js` readers.
- Added waiting-registration cancellation/polling, per-registration/cohort identity, matched-room seating without a second buy-in, committed draw timing, mode-specific rules and cohort-level prize/insurance hold accounting.
- Made house movement IDs a SHA-256 of the full actor/scope/operation/kind/reservation/entity/index tuple and scoped Spin operation uniqueness by actor.
- Added omitted private player/tournament fields, exact nested workflow/casino schemas, no-burn behavior, unredacted private results with public redaction at projection, Phase-1 action-seat capture and PLO6 validation.
- Added exact Battle actions, tournament-format storage/commands, offline financial effects, Share Hand revision/authorization/common visibility, cash-insurance rules and role-to-client gating.
- Added the `/battle` and `/share/:shareId` routes, missing gameplay browser tuples, touch/coarse-pointer execution, Desktop/PWA tools and final commands, and removed the accidental merge authorization.
- Reduced unnecessary viewport repetition while retaining every primary route at all required widths and explicit high-risk cross-role/gameplay tuples.

## Contested finding

The claim that the reference engine/guide paths do not exist is **CONTEST** with evidence. `docs/designs/2026-11-15-systematic-clone-mobile-egm.md:19` explicitly resolves unqualified `docs/rea/...`, `FEATURES.md` and reference module paths against `/Users/davidai/Reference/GGPoker-clone`, not the target. All thirteen cited files were confirmed present there at the pinned reference checkout.

This round does not count toward final EGM convergence. Another fresh complete review is required; application implementation and final EGM success remain unestablished.
