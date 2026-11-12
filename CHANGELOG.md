# Changelog

Notable changes to DanGG, newest first. Dates are local (Europe/Bucharest).
The project started as a local desktop clone and became the live play-money room at
[dangg.live](https://dangg.live).

## 2026-11-12

### Chip Shuffle and native pot denominations (ported from the Codex clone)
- **Shuffle chips** is in the table menu. It plays the clone's native 16×16 chip-shuffle
  sprite (frames 37–245) over the pot with the Up/Combine sounds, auto-stops, and is
  broadcast to everyone at the table through a `chip_shuffle` event (3 s rate limit).
  Settings → Table & cards → **Chip shuffle effects** hides it locally.
- The middle pot pile now follows the clone's `playChipLayout` idea: the pot is decomposed
  into **1 / 5 / 25 / 100 BB** denominations, one column per denomination, at most nine
  chips per column, with gold/red/green/black colours. The label still carries the exact
  amount. This replaces the earlier one-chip-per-big-blind approximation.
- Tests: denomination decomposition and per-column caps, plus the 16×16 sprite frame
  mapping. A headless browser run verifies the pot columns and the shuffle start/mid/stop.
  Full suite 154/154.

### Card Squeeze (ported from the Codex clone)
- The reference clone's **Card Squeeze** is now in DanGG. With **Settings → Table &
  cards → Card squeeze on a fresh deal** enabled, a fresh hand opens the native squeeze
  panel: the 61-frame compositor, per-format masks and the inner card-face sheet are the
  clone's own assets (Hold'em, PLO4, PLO5, PLO6), with wheel, hover, press and drag
  gestures and the green **Open** button.
- Your seat cards stay hidden and the action bar plus hotkeys are locked while the cards
  are closed; the panel fades out after the reveal and play resumes. Escape dismisses it,
  and a hand already in progress when the page connects never replays the effect.
- The setting is off by default. The squeeze artwork is official host-local art (like the
  table assets), so it is not committed; the deploy copies `app/public/assets/squeeze/` to
  the host.
- Tests: the ported frame helpers (`cardOrdinal`, wheel/drag curves) plus a headless
  browser run of the panel (frame 0 → Open → frame 60 → close and unlock). Full suite
  154/154.

### Table menu
- Every item in the table **Menu** now does what it says:
  - **Sit out next hand** finishes the current hand and sits out at the next deal,
    with Cancel sit out / Post blinds to reverse it.
  - **Rabbit hunt** is only enabled after a hand ends with an incomplete board, says why
    when disabled, and the revealed cards clear at the next deal.
  - **Auto-muck losing hand** now has an engine effect: winners show at showdown and
    losing hands muck by default; turning it off shows the losing hand too. The seat's
    preference is sent when a player joins, so it survives reconnects.
  - **Official FX preview** (and the win/spin/mystery SWF effects) works again: Ruffle
    compiles a self-hosted WebAssembly module, which the page CSP blocked. `script-src`
    now allows `'wasm-unsafe-eval'` only — no eval and no remote script.
  - **Table settings** opens the Table & cards tab instead of the General tab.
  - Seat-only items (rebuy, sit out, straddle, run it twice, auto-muck, rabbit, spin
    insurance) are disabled for spectators with a "Take a seat first" hint.
- Tests: deferred sit-out, immediate sit-out between hands, and showdown
  reveal/muck with auto-muck on and off. Full suite 153/153.

### Betting controls (ported from the Codex clone)
- The reference clone's **Betting options** are now in Settings → Betting: mouse-wheel
  direction (scroll up to increase or decrease), the wheel/step unit (big or small blind),
  and Enter **Always confirm / Never confirm** — defaulting to Always, as the clone does.
  Wheel over the presets, slider or amount changes the bet by the chosen unit; arrow keys
  and the +/- steppers use the same unit.
- The earlier single "Always confirm bets" switch is migrated: only an explicit off setting
  disables confirmation.
- A new [port ledger](docs/designs/codex-clone-port.md) records what the clone has that
  DanGG still lacks (Card Squeeze, Chip Shuffle, native chip denominations, showdown
  sequencing, native reserved-action artwork, owner backup) so the gap is tracked rather
  than summarised.
- Tests: betting-option parsing, unit selection and the fallback to native defaults.
  Full suite 150/150.

### Showing cards
- **Show one card or both.** After a hand ends, a player who was dealt in can tap any of
  their hole cards and press **Show** (or **Show all**) to reveal them to the whole table.
  A partial reveal shows exactly the picked cards and keeps the rest face down for everyone
  else; the owner always sees their own hand. Folded players cannot show, and the option is
  gone as soon as the next hand is dealt.
- The table announces the reveal ("Nick shows A♠ K♥") and marks shown cards with a green
  ring; showing is merged per card, so a player can show one card now and the other later.
- Tests: engine case covering the hand-over gate, folded players, partial and full reveals
  and the broadcast payload. Full suite 149/149.

### Table controls
- **Bet steppers.** − and + buttons now sit either side of the bet amount and move it one
  big blind per press, clamped to the legal raise range; the number field's own arrows use
  the same step. Presets and the slider are unchanged.
- **Reload after a bust.** When a cash-table player loses their stack, the next hand is held
  for about ten seconds and a **Reload** dialog opens with a live countdown and the exact
  allowed add range. The table also shows an "Out of chips" row with a Reload button.
  Reloading clears the hold, and once every busted player has reloaded the next hand deals
  1.5 s later instead of waiting out the window. Tournaments and Spin & Gold still
  eliminate — no window, no rebuy.
- **The pot pile grows.** The chip pile in the middle of the felt is now sized from the
  pot — one chip per big blind, at least three and at most twelve, with gold, red and black
  denominations — instead of a fixed five chips, so each betting round visibly adds money.
- Tests: reload-window cases in the engine suite and a pot-pile case in the client-logic
  suite. Full suite 148/148.

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
