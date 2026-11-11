# Stage 6 — Comprehension Test: Remediation Design

**Target:** `docs/designs/remediation.md` L1–238
**Reviewer:** fresh-context EGM Goldfish (`egm-comprehension`), design-only

## Paraphrase

**What this proposes.** A remediation spec for an already-built local clone. It catalogues eight defects (crash-stranded buy-ins, cashier replay, port 5198 takeover, unversioned WS snapshots, unstated local threat model, minted bot/Spin chips, unguarded balance movers, router domain logic) and turns them into six release-blocking goals (G1–G6) plus two opportunistic ones (G7–G8). It specifies idempotency keys and `table_sessions`, a port probe plus `serverNonce` and `/api/health`, `stateVersion`/`resync` and a 30 s disconnect policy, Origin/Host checks and a WS subprotocol token, injectable RNG, per-subsystem invariants, and ID'd documentation. Admin `set` and server-authoritative blackjack are declared already fixed.

**How the system works per the document.** An Electron main process takes a single-instance lock, polls `/api/lobby`, then loads the renderer; a child Node server owns HTTP/WS on 5198 and SQLite. Money is an append-only `transactions` table written atomically by `addTransaction`, with no idempotency key and no seat-to-buy-in record. The renderer stores a bearer token in `localStorage`, sends the WS token in the query string, and receives snapshots with `handNo`/`street`/`now` but no version or resume. Blackjack is now server-authoritative; bots and Spin use `Math.random` and mint chips outside the ledger.

## Findings

1. **Major — no architecture baseline.** The topology (Electron + child server + renderer + SQLite) is never introduced; every blocker is about a process boundary. Add a 4–6 line system-shape paragraph or a precise predecessor pointer.
2. **Major — "chips", "balance", "stack" carry two meanings.** G6's conservation test, E3's accepted inflation and table stacks vs ledger balances cannot all be the same invariant. Name the quantities and which invariant binds which.
3. **Major — crash refund amount/accounting undefined.** A3 refunds the original buy-in, not the stack; it does not say what happens to chips won/lost in the session or to blinds. G1's "refund or restore" leaves two designs open.
4. **Major — idempotency contract inconsistent.** G2 says "accept", A2 says "require"; key scope is global vs `(user_id, reference)`; reuse with a different amount/kind is unstated; `response TEXT` is undefined; `kind` is unenumerated.
5. **Major — `sinceVersion` is decorative and restart-unsafe.** Resync always sends a full snapshot; a per-table counter resets on restart while clients hold old versions, so stale-drop would discard fresh state. Define origin and compare rule.
6. **Major — "one invariant and one test row" names no artifact.** Database rows, design-table rows, or tests? F's counts (five groups, "six claim blocks", no verification rows) disagree.
7. **Major — reward vocabulary and period key undefined.** `prop bets`, `GG Care`, `Honeymoon`, `season` and `periodKey` need definitions; `UNIQUE(user, kind, periodKey)` is untestable without allowed `kind` values and key format.
8. **Major — disconnect policy vs action deadline.** Which timer wins, whether the auto-action is a fold/check, how it is logged, and whether a sat-out session survives restart are unstated.
9. **Major — `sandbox` requirement has no decidable outcome.** "Enable if the preload bridge still works, otherwise accept in writing" is an open question, not a decision.
10. **Major — money units and `money()`/`chips()` semantics undefined.** Balances in minor units, divided by 100 only at render; the two helpers' difference is never stated.
11. **Nit — "EGM" and "design-of-record" unexpanded/unlinked.**
12. **Nit — "eight defects and three structural gaps" does not reconcile with the list.**
13. **Nit — "capped" payouts give no cap value.**
14. **Nit — dev-origin allowlist unspecified and query-token dev exception tension.**
15. **Nit — dead rake fallback cannot be located (`bb`, `rake_cap` owner).**
16. **Nit — forward references and `buyin`/`buy-in`, `cashout`/`cash-out` drift.**

**Note:** B, D and H read cleanly; Alternatives is the clearest section. The common habit is naming artifacts (helpers, tables, IDs, protocols) without saying what one looks like, while the remediation claims every rule gains a mechanism.
