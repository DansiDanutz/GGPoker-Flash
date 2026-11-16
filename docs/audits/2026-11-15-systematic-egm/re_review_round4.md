# EGM re-review round 4 — complete, not clean

All eight requested reviewer responsibilities completed. This was not a clean round.

## Principal findings and applied repairs

- Required a synchronous process-wide SQLite writer boundary and revalidation of all receipts/revisions/balances/exposure after `BEGIN IMMEDIATE`; added shared-account/house/queue race tests.
- Added committed snapshots for every mutated coordinator so ordinary-cash and terminal transitions recover after commit→install crashes.
- Replaced cash quarantine net-session refunds with validated hand-start stack/escrow treatment that does not reverse earlier settled hands.
- Added immutable rules/engine binding, durable outbox sequence high-water marks, recipient acknowledgement/replay rules and client duplicate suppression.
- Removed the unjustified mandatory capacity soak while retaining deterministic queue/recovery/cleanup gates.
- Defined nested private table/workflow checkpoint shapes, Spin 3-Max/6-Max identities and persisted mode/seats, cash side-game checkpoints, role/re-entry/Rabbit/Share Hand/push-seat/tournament storage, and exact API rules.
- Corrected the existing admin table route, leaderboard source fields, Auto Fold eligibility/thresholds, Battle prize validation, Bet-and-Muck transport/rank artifact, cash-insurance formula/lifecycle and casino abandonment timers.
- Corrected baseline timestamp/proof claims and expanded remaining assertions and matrix generation.

All findings were **PROPOSE FIX**. The revised document needs another fresh complete review; implementation and EGM convergence are not established by this report.
