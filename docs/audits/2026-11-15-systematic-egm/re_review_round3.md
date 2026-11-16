# EGM re-review round 3 — complete, not clean

All eight requested reviewer responsibilities completed. The round was not clean.

## Principal findings

- The house invariant used the wrong sign for settled payouts.
- Post-commit memory/event failures were incorrectly covered by a rollback promise; no durable outbox existed.
- Quarantine cancellation lacked a receipt-derived refund policy.
- Spin's independent per-match commits lacked a durable batch journal and its command omitted queue revision.
- Battle qualification hard-coded six finalists despite configurable final-seat counts.
- Push Seat confused wait-list offers with physical seat movement.
- New endpoints incorrectly assumed cookies/seat tokens rather than the target's Bearer authentication.
- Several remaining features still lacked concrete rules/storage/tests; Blackjack and Crash needed durable active rounds.
- Checkpoint/duplicate-hand/outbox schemas and migration details were incomplete; several required files and phase build gates were omitted.

## Applied remediation

Corrected the house sign with worked examples; added durable outbox/replay and post-commit fault windows; defined queue bounds and receipt-derived quarantine refunds; added Spin batch journaling and strict workflow checkpoint/index schemas; parameterized Battle; specified physical-seat Push Seat, Spin 6-Max, permissions/disqualification, Share Hand, insurance, branded formats and active casino rounds; corrected authentication/admin boundaries; added idempotent migrations, canonical hashing, exact routes/statuses, suite manifest schema, missing source/test files and per-phase full test/typecheck/build gates.

All findings were classified **PROPOSE FIX**. This remains a review/remediation record, not EGM convergence or implementation proof.
