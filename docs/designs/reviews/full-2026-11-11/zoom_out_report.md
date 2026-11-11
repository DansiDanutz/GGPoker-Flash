# Stage 5 — Initial Zoom Out Review (full project)

**Target:** `docs/designs/dangro-clone.md` (542 lines)
**Standard:** `zoom-out-standard.md`
**Reviewer:** fresh-context EGM Goldfish (`egm-zoom-out`)

## Verdict

Context sufficiency passes. The document is high-altitude for most of its length, but three of its own clauses did not hold in the code it claims to describe. One Blocker and two Majors required code or contract changes before the design could be used as a change gate.

## Findings

### B1 — Blocker · Admin balance set bypassed the ledger

The contract says `balance`, `play_chips`, `tickets` and `gems` change only through `addTransaction`, and the ledger test asserts a continuous `balance_after` chain. `POST /api/admin/users/:id` with `action: "set"` wrote those columns with a direct `UPDATE`, no ledger row. CUJ 5 advertises admin balance edits as Tier 1, so the document guaranteed and contradicted the invariant in adjacent sections.
**Resolution:** Changed to compute a server-side delta and write it through `addTransaction(..., 'admin_set', delta, ..., currency)`. `xp`/`vip_*` remain direct because they are not money. Verified: the admin set produced an `admin_set` ledger row with the new `balance_after`.

### M1 — Major · Lobby publishes synthetic numbers beside real state

`players`, `avgPot`, `vpip`, `handsPerHour` and `online` are a hash/sine projection; `running` is real. The design did not record this. `LIVE_TABLES` and `WAITLISTS` already know true occupancy.
**Resolution:** Documented in Risks: these columns are cosmetic and decisions must use `LIVE_TABLES`. A projection from live registries remains a follow-up.

### M2 — Major · Money can be minted by bots and Spin prizes; Spin cashability contradicted

Bots are seated without a debit and re-staked to max buy-in; their chips become USD on cash-out. Spin & Gold adds `min_buyin × multiplier` to the winner's stack, and the leave path cashes out because Spin is not a tournament. The document said "Spin stacks are not cashable" — false.
**Resolution:** Documented synthetic liquidity: bot stacks are minted and accepted inflation; Spin prizes are minted into the stack and cashable through cash-out; tournament chips are not cashable. If minting is unwanted, it is a code change, not a doc change.

### M3 — Major · Blackjack settlement trusted the client

`POST /api/games/blackjack` accepted `action: "settle"` and credited `body.amount` verbatim: any authenticated user could mint balance. Phase 3's proposed `play(kind, bet, rng)` could not express the two-phase game.
**Resolution:** Server now holds the shoe, player, dealer and bet per user. `deal` debits the bet; `hit` and `stand` are server-decided; `settle` is rejected. Blackjack pays 3:2 on a natural, 2× on a win, 1× on a push. Verified: the old settle call returns `unknown action`, and stand settles server-side.

### M4 — Major · Conventions described as enforced, but not enforced

`t()` has zero callers; the DOM observer carries 100% of translation. The `money()` rule is violated in `Lobby.tsx` and `Rewards.tsx`. Single-instance and admin authorization are decisions without mechanical checks.
**Resolution:** Documented the observer as the current mechanism and `t()` as the forward API; the claim that new UI "must" use `t()` is now a convention, not an invariant. Formatting cleanup remains a follow-up.

### M5 — Major · Tier 2 justified by sunk asset cost

"Cheap because assets" is not a budget rule. The marginal cost is runtime surface, and `index.js` is already ~1,395 lines.
**Resolution:** Open. Recommendation: freeze Tier 2 or require any addition to delete comparable surface.

### M6 — Major · Phase 3 was pitched as implementation, with guessed signatures and a reuse miss

`play(kind, bet, rng)` cannot absorb the heterogeneous handlers; six claim blocks already share `daily_claims` + `addTransaction`, so the minimal fix is one `claimPeriod()` helper, not a new `rewards.js`.
**Resolution:** Partially fixed: Phase 3 now names `casino.js`/`rewards.js` and exports, but the reviewer's simpler `claimPeriod()` recommendation remains the better design.

### N1 — Nit · Decisions restated three to five times

Rake, ledger atomicity, CDP gating and table rendering each appear in multiple sections. One decisions table should be the single source.

### N2 — Nit · Volatile detail and one wrong invariant

Test enumerations, API-level `scryptSync` arguments and "1,384-line router" duplicate code and rot. `pot` was described as "minus rake"; it is gross, with rake reported separately.
**Resolution:** Pot clause corrected; volatile details remain.

### N3 — Nit · Undecided operational edges

`package_app.sh` falls back to ad-hoc signing silently; a failed child server still loads a blank window; the `3 × bb` rake fallback is dead in production because `rake_cap` is always 300.
**Resolution:** Documented the dead fallback and the signing fallback. The server-failure UX remains open.

## What holds up

Fresh-reader context, the study/operate split, Alternatives A–D with rejection costs, concrete Non-Goals, and honestly stated known gaps.

## Disposition

Stage 5 is complete. Stage 6 was not run in this pass because the Blocker required a code change and the two money paths were fixed first. The remaining findings are tracked in `REVIEW_STATUS.md`.
