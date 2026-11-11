# Stage 9 — Codebase Details: Remediation Design

**Target:** `docs/designs/remediation.md` L239–330
**Reviewer:** fresh-context EGM Goldfish (`egm-codebase-details`)

## Blockers

- **False current state: disconnect policy exists.** WS close marks `disconnected`, stands the seat and writes `cashout`; `disconnected` is already in snapshots. C.3's grace window replaces this behavior; Phase 1's "close session on cash-out" and Phase 2's grace window contradict.
- **"No version" is false for events.** Every event carries `evt.seq`/`evt.at`; only `snapshotFor` lacks one. Say whether `stateVersion` reuses `messageSeq`, and handle restart reset with an epoch.
- **Mandatory `Idempotency-Key` breaks all cashier/admin callers.** `api.deposit`/`withdraw`/`admin.credit` send none; `Cashier.tsx`/`Admin.tsx` are in no phase. Define key minting, scope, missing-key status and retry reuse.
- **File lists miss required files.** Phase 3 token transport needs `TablePage.tsx:89`; Phase 4 rake removal touches `table.js` and breaks `engine.test.js`; `money()` cleanup lines 146/165 are percentage/T$ math, not display; `api.ts` is listed with no step.
- **Six of nine verification rows have no home.** HTTP/WS tests need an importable app; `index.js` listens at import and owns the only `WebSocketServer`.

## Majors

- Production hooks are inline in `getLiveTable()`; places 2/3 fire from `tick()` and need busted seats + fake clock. Extract `createHooks(db)`; 1st is `tourney_win`, 2nd/3rd `tourney_payout`.
- Sessions ignore rebuy, admin close and tournament seats (tournaments must not open sessions).
- Lobby projection has no source for `avgPot`/`vpip`/`handsPerHour`; keep JSON keys and `running`; define "cosmetic".
- Origin/Host allowlist breaks Vite dev (Origin `localhost:5199`, no `GGPOKER_DEV`); port is configurable, allowlist/nonce/curl hardcode 5198.
- Rake fallback removal changes behavior and breaks the test that asserts it; `getSetting('rake_cap',300)` masks a missing row; `CUSTOM_CFG` never sets `rakeCap`.
- Caps undefined; tablegame pays 60×; F's leaderboard/GG Pass payout does not exist.
- RNG scope incomplete: `Math.random` also drives roulette, sic bo, prop bets, daily and wheel; `seededRandom` exists but is unexported.
- Login throttle key is weak (login OR nick, loopback/proxy).

## Nits

- Nonce env name/dbPath unstated; `sandbox:false` appears twice; `package_app.sh` is environment-mutating; `tsc` only covers `src`; test counts in README/REVIEW_STATUS need updating.
