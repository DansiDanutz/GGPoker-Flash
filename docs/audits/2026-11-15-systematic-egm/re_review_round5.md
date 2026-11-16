# EGM re-review round 5 — complete, not clean

All eight requested reviewer responsibilities completed. Agents 46 and 47 initially failed with the provider quota error; each was retried once against the revised document and returned a complete report. No partial output from the failed attempts was counted.

## Reviewer status

- `zoom_out` (agent-41): completed
- `comprehension` (agent-42): completed
- feature `design_critic` (agent-43): completed
- feature `structural` (agent-44): completed
- feature `style` (agent-45): completed
- implementation `implementation_readiness` (agent-46): completed on the required single retry
- implementation `codebase_details` (agent-47): completed on the required single retry
- implementation `style` (agent-48): completed

## Verdict

Not clean. The completed implementation reviews reported one Blocker and additional Major findings. Earlier reviewer findings concerned the global writer boundary, durable presentation delivery, snapshot compaction/recovery, the Spin partial-commit saga, independent workflow gates, metric ownership, soak/change-manifest requirements, nested schemas, Battle grouping, matrix identity collisions, Desktop proof, command identities and several gameplay contracts.

## Corrections applied before the retries

- Replaced per-room database queues with one bounded process-wide writer queue and removed the durable outbox in favor of reconnect/latest role-safe snapshots.
- Required compact latest-generation snapshots and fail-closed room-scoped recovery.
- Replaced the Spin batch saga with independent client-orchestrated single-registration commands.
- Made Phase 1 + Phase 6 an independent mobile vertical slice and split Phase 5 into independently gated workflows.
- Reused `app/server/table-stats.js:80-160`; removed the mandatory capacity benchmark and shadow change manifest.
- Added strict Battle coordinator/card contracts, a table-size-two shootout bye, deduplicated matrix IDs and a Desktop proof category.
- Corrected command identity, Auto Fold citation, house/private-state wording, Push Seat grants, Rabbit records, insurance quote identity, re-entry limits, phone sheets and validation bounds.
- Recorded baseline commands, exit statuses, timestamps and output in `baseline-verification.json`.

## New findings requiring repair

All are **PROPOSE FIX**; none is waived:

1. **Blocker:** the target does not burn cards, so the claimed existing burn/draw policy is false. Define DanGG no-burn compatibility consistently for ordinary runouts, RIMT and Rabbit.
2. Reconnect uses WebSocket `join_table` and fresh pushed snapshots, not an existing table-polling path; correct that contract.
3. Fully enumerate private table/player/nested state, including Set/Map encodings and active-hand fields omitted from the draft.
4. Define Battle action payload, Push Seat destination/cancellation, offline entry/disqualification and other incomplete HTTP bodies.
5. Define Spin registration/cohort persistence, matching, versioned rules storage and house-ledger movement identity.
6. Assign every independent Phase-5 workflow its exact server/client/router files, including table stats, casino rounds, Spin 6-Max and cash insurance UI.
7. Add the route-by-route owner/moderator authorization matrix and legacy admin mapping.
8. Define legacy tournament operation/seat identity migration and make rebuy use `rebuyChips` without contradiction.
9. Persist Share Hand starting stacks/action seats/reveal indices, define legacy behavior and single-link revocation; add the public route before the authentication guard.
10. Define Auto Fold preference commands and idempotent server execution, Cash Drop's post-merge pot identity, and the cash-insurance house scope and tie-inclusive equity formula.
11. Remove circular final-evidence hashing by excluding reviewer outputs from the pre-review source/evidence identifier.
12. Require any additional mobile component to be added to the design's write boundary before editing, and correct new-versus-modified test paths.

The design remains under repair. This round does not count toward the required two consecutive clean final rounds, and neither implementation nor EGM success is established.
