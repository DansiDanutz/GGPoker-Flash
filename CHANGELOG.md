# Changelog

Notable changes to DanGG, newest first. Dates are local (Europe/Bucharest).
The project started as a local desktop clone and became the live play-money room at
[dangg.live](https://dangg.live).

## 2026-11-12

### Betting
- **Enter-to-bet, with the native "Always confirm" option.** While it is your turn,
  Enter bets the amount on screen (all-in at the ceiling), including from the amount
  field; chat and nickname inputs keep their own Enter. A new Settings → Betting switch,
  **Always confirm bets**, makes Enter and the bet button ask first — the table shows a
  confirm bar with Confirm/Cancel and Escape cancels. Off by default, so the previous
  one-click behaviour is unchanged.
- A pending confirmation is cleared when the hand, street, turn or amount changes, so a
  stale Enter can never fire a bet from an earlier decision.
- Tests: a pure `enterBetRequest` case covers the turn/raise/ceiling/confirm decisions.
  Full suite 145/145.

### Spectating
- Watching a table is now truly read-only. `join_table` with `observe: true` no longer seeds
  bots or starts a hand, so opening a quiet private table no longer spawns a bot game and
  watching a tournament flight can no longer add players to the field.
- Table-wide actions need a seat: a watcher can no longer flip the straddle or run-it-twice,
  and cannot trigger a rabbit hunt for the players.
- The table header shows a **Spectating** pill, and the lobby side panel's **Open** button is
  now **Watch**.
- New `GET /api/tournaments/:id/watch` returns the busiest live flight; the tournament
  detail offers **Watch live**, and a watcher whose table breaks follows the field to the
  next flight automatically.
- Tests: four new HTTP/WebSocket cases (no bot seeding, hidden hole cards, refused actions
  and options, tournament watch endpoint and flight follow). Full suite 144/144.

### Tournaments
- **Multi-table tournaments are live.** The pure seating engine (`app/server/tournament.js`)
  is now driven by a tournament room (`app/server/tournament-room.js`) against the live
  tables:
  - humans fill flight 1 before flight 2 opens, and a bot steps aside for a human; flight
    1 keeps the legacy `tourney-<id>` id, later flights are `tourney-<id>-<n>`;
  - every flight shares one blind level and clock, so a flight opened late starts on the
    current level instead of level 1;
  - finish places and payouts are computed field-wide: a twenty-player event pays
    20th … 1st, not 6th … 1st, with the same 50/30/20 % shares (tickets for satellites);
  - balancing runs every 2 s: a flight two or more players bigger sends one across, and a
    table under three players breaks into the others. A player in a running hand is never
    moved, a table only closes after every player found a seat, and stacks plus connection
    state travel with the player;
  - the last player standing is only crowned when every flight is between hands, so an
    all-in player with nothing behind still counts as alive;
  - a moved player gets a `table_move` socket message and the table view follows
    automatically; a stale flight link redirects to the player's real table, and the
    header shows **Table 2/3 · 14 left** for multi-flight events.
- The scheduled-start scheduler opens the room at the start time so the blind clock begins
  then; `/play` seats the player through the same room and unregistration checks every
  flight.
- The engine itself was added in this pass too: flights sized within one seat of each
  other, chip-preserving balancing moves off the biggest table, the `nextTableIndex`
  allocation rule, canonical `tournamentTableIds`/`flightTableId`, and table breaks that
  retire a short table only when every player has a seat elsewhere.
- Tests: 31 new cases across the allocation helpers, the tournament room, an engine↔room
  integration test and a live HTTP/WebSocket test that seats eight entrants onto two
  flights, checks the snapshot counters and the stale-link redirect. Full suite 140/140.

### Design
- Added the consolidated replica gap analysis (Codex evidence → DanGG build plan) in
  `docs/designs/replica-gap-analysis.md`.

### Sign-up and login experience
- Rebuilt the sign-up/login screen: segmented Log in / Create account tabs, an
  account headline and helper copy, explicit field hints, autocomplete attributes and a
  clearer error state.
- Moved the hero copy onto the table artwork and constrained it to the art panel so it no
  longer collides with the form on narrow desktop widths.
- The account-ID field is labelled for the live site: **Your DanGG.Live ID**.

### Brand
- Renamed the app and all UI strings from **DanGG.ro** to **DanGG** (window title, PWA
  title, welcome/install/reconnect screens, splash).
- New metallic-gold GG app icon used by the desktop build and the PWA.

## 2026-11-11

### Mobile experience
- Fixed the phone lobby: the table list now scrolls with momentum instead of being
  clipped after the first few tables.
- One tap on a table row opens the buy-in sheet on touch devices; desktop keeps
  select/double-click.
- “Play as guest” enters the lobby immediately.
- Added a phone seat ring so the hero’s avatar, cards and stack stay above the action bar;
  hid the desktop status/hotkey line and the “Pop out” control on phones.
- Landscape phones get a usable lobby, compact action bar and no 125px tab bar overlap.
- Toasts sit above the tab bar; title-bar traffic lights are hidden on touch devices;
  login links meet a 44px tap target.

### Installable phone app (PWA)
- Web app manifest, 192/512/maskable icons, Apple touch icon and iOS standalone meta.
- Service worker: network-first navigation, cache-first hashed assets, API/WebSocket
  never cached, old caches dropped on activation.
- New accounts created on a phone land on **Get the DanGG app → Download App**:
  Android/Chrome gets the native install prompt (manual menu path as fallback), iPhone
  gets Share → Add to Home Screen and a confirmation.
- “Continue in browser” is remembered; desktop sign-ups skip the step.

### Installed-app first launch
- Opening from the home-screen icon restores the session straight into the lobby.
- One-time welcome sheet with three quick tips and a start-playing action.
- Safe-area insets in standalone mode (status bar, notch, home indicator).
- A saved session is no longer cleared on a network error: launch retries `/api/me`
  three times and shows a **Can’t reach DanGG** retry screen; only 401/403 logs out.

### Operations
- Added an always-on watchdog (`deploy/keepalive.sh`, cron every 2 minutes, 5-minute
  cooldown) that restarts the game service when `/healthz` stops answering.
- Documented the full hosting layers in `deploy/ALWAYS-ON.md` (restart policy, boot-time
  Docker, nightlies, TLS, DNS, disk headroom).
- Off-host backups: Nano pulls Dexter’s SQLite snapshots nightly (30-day retention).
- External uptime monitoring from Nano with Discord alerts.
- Earlier in the day: production deployment on Dexter behind Traefik with Let’s Encrypt,
  loopback-only admin via SSH tunnel, Docker health checks, backup/preflight scripts and
  the CI/PR workflow with required checks.

### Security and correctness
- Removed public demo/admin credentials from the login footer; the demo shortcut now only
  appears when the advertised credential actually authenticates (`/api/lobby.demoAccount`).
- Session handling, origin allowlists and admin allowlists hardened as part of the
  2026-11-11 audit (betting order, all-in/side-pot handling, rake and leave-table bugs;
  chip-minting paths; hand-history privacy; local-server attack surface).
- Server suite grown to **109** `node:test` cases, including chip-conservation simulations
  and a PWA-shell test; `tsc --noEmit` and the production build run in CI.

## Earlier — 2026-11-11

- Production stack: Dockerfile, Compose (game + Caddy notes), Traefik router with
  Let’s Encrypt, `/healthz`, SQLite volume, preflight and scale-plan docs.
- Reverse-engineered the installed GGPoker AIR client (SWF decompilation, sprite atlases,
  ATF/DXT5 textures, fonts, 73 sounds) and rebuilt the lobby, tables, cashier, rewards,
  tournaments, casino and admin console from the decoded assets.
- Added the Electron desktop shell, local server supervisor, packaging/signing script and
  the `~/Applications/DanGG.app` build.
- Design-of-record and Elephant-Goldfish reviews under `docs/designs/` and `docs/audits/`.
