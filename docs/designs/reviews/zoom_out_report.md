# Stage 5 — Initial Zoom Out Review

**Target:** `docs/designs/dangro-clone.md` (full file)
**Standard:** `zoom-out-standard.md`
**Mode:** REVIEW — Skeptical Architect / YAGNI & Simplicity
**Reviewer:** fresh-context EGM Goldfish (`egm-zoom-out`)

## Verdict

Fails on **Context Sufficiency (§0)** and **Root Problem Focus (§1)**. Conditional on **Leverage Existing (§4)** and **Altitude (§3)**. The document is factually rich but reads as an implementation changelog in a design document's clothes, and its stated problem does not justify its stated scope.

### F1 — Blocker · Context Sufficiency · Whole document

**Finding:** Nothing states whether this is a forward plan, a design being approved, or a retrospective record of code that already exists. The status says "In Review" while every entry in the "Detailed Implementation Plan" is `(Modify)` except the document itself. The context already describes the system as shipped, with run instructions and a packaged app.
**Recommendation:** Add a header block: what exists today, what this document decides, what review is requested, and links to `README.md` and `research/REVERSE_ENGINEERING.md`.

### F2 — Blocker · Root Problem Focus · L23–L49

**Finding:** "The Problem" names two unrelated problems ("cannot be studied", "cannot be administered locally"), then Goals demand eight poker formats, six casino games and a dozen reward programmes. Sic-bo, Honeymoon, GG Care and Ocean ranks are not required to study or administer anything; they are content parity, a different objective.
**Recommendation:** Split the contract into (a) the reverse-engineering record and (b) a minimal clone contract — lobby, one cash game, cashier/ledger, admin. Justify any further surface separately.

### F3 — Major · YAGNI · L40–L45, L113–L119, L163–L178, L247–L259

**Finding:** For a loopback-only, single-operator, play-money demo the design carries identity verification with document upload and admin review, session/device inventory with expiry and revoke, branding uploads stored as data URLs in SQLite, four CSV exports, friends, notes, chat and full audit logging. KYC against a real authority is a Non-Goal while a verification document flow is implemented.
**Recommendation:** Tier the surface. Tier 1: login, balance, ledger, tables, admin edits. Tier 2 (defer with a trigger): verification, branding upload, exports. State that verification is a UI-parity mock with no real identity checks.

### F4 — Major · Root Problem Focus · L51–L58 vs L40–L45

**Finding:** Non-Goals are contradicted by Goals and by the plan: "entire slot and tournament content catalogue" excluded while six casino games are goals; "multiplayer across machines" excluded while the WebSocket layer supports two clients.
**Recommendation:** Restate the boundary with concrete in-scope and out-of-scope examples, then delete objectives that fail it.

### F5 — Major · Altitude Drop (Weeds) · L300–L372

**Finding:** The "Detailed Implementation Plan" is a per-file changelog: `scryptSync(password, salt, 32)`, CDP port 9333, `ELECTRON_RUN_AS_NODE=1`, guarded `ALTER TABLE`, BOM-prefixed UTF-8, an 18-table inventory, and edits to nine file groups. It is already true in the repository.
**Recommendation:** Keep only process topology, trust boundary, ledger invariant and the WS contract. Move or delete the rest.

### F6 — Major · Simplicity / Drift Risk · L163–L178, L182–L205, L302–L350

**Finding:** The same surface is inventoried three times — schema, HTTP routes, WebSocket protocol — plus a fourth prose list of pages. They already disagree: 471 translated strings versus 11,632 string-table keys; "18 tables" versus a 15-row table plus a catch-all row of five.
**Recommendation:** One canonical appendix, ideally generated from code, referenced by the architecture prose. Redundant inventories rot.

### F7 — Major · Leverage Existing · L333–L339, absent section

**Finding:** No reuse section exists, and a real duplication is undocumented: two hand evaluators — server `app/server/poker.js` and client `app/src/game/eval.ts`. If they disagree, players see a strength label the engine contradicts.
**Recommendation:** State once that server evaluation is canonical and the client evaluator is display-only and derived, not independently written. Add a reuse section naming the sanctioned helpers.

### F8 — Major · Unresolved Decisions · L60–L73, L352–L356

**Finding:** Four Open Questions remain in a document that calls itself the EGM contract. Asset licensing gates distribution and cannot remain open.
**Recommendation:** Convert to decisions with owner/date or move to Risks. Resolve licensing now; mark the rest non-blocking.

### F9 — Nit → Major · Premature Machinery · L198–L205, L247–L259

**Finding:** A CDP remote-control port (9333) retained in the shipped main process has no stated justification and is a live automation surface in production.
**Recommendation:** Justify or gate behind a dev flag.

### F10 — Nit · Factual Consistency · L38, L150, L296, L309

**Finding:** "Signed" app and "Developer ID signature" versus instructions for stripping quarantine from an unsigned build. `app.setName('DanGG.ro')` against a userData path of `GGPoker Clone`.
**Recommendation:** Reconcile names and signing state.

### F11 — Nit · Housekeeping · L5, L352–L356

**Finding:** Forward-dated (2026-11-11); item 8 proposes creating the document containing it; no statement of bundle size given a 1.4 GB extracted asset set.
**Recommendation:** Remove the self-referential item, correct the date, add one line on bundle size.

## What is genuinely minimal (do not change)

- No framework tax: `node:http` + `ws` + `node:sqlite`, hand-rolled static handler and MIME map.
- No speculative performance work; Monte-Carlo equity is a gameplay requirement, not an optimisation.
- One source of state, one push channel: server-authoritative state plus one WebSocket per table.
- `settings` table instead of config files.
- Alternatives A/B/C are real alternatives with real trade-offs.

## Fix priority

1. F1 — restore context.
2. F2–F4 — reconcile problem and scope; tier the surface.
3. F5–F6 — demote the implementation inventory and schema dump.
4. F7 — add the reuse/canonical-evaluator rule.
5. F8–F11 — decisions, CDP gate, names, housekeeping.
