# Changelog

Notable changes to DanGG, newest first. Dates are local (Europe/Bucharest).
The project started as a local desktop clone and became the live play-money room at
[dangg.live](https://dangg.live).

## 2026-11-12

### Daily Leaderboard ribbon at the table
- Cash tables now show a "{stake} Daily Leaderboard" ribbon with Total Prize, My Points and your
  rank, as in GGPoker. Click it to see today's top ten and what each place pays.
- You earn one point for each raked hand you put chips into at that stake (UTC day). The prize is
  500 big blinds, paid to the top ten (30/20/15/10/8/6/4/3/2/2%) once the day is over.
  Tournaments, Spins and private tables do not count.

### Time Bank Cards that refill
- The time bank is now a set of cards, as in GGPoker cash games: you start with 3, one more is added
  every 20 hands you are dealt in, up to 5 held. Each card adds 15 seconds, and up to 2 can be used
  on one decision. The Time bank button shows how many cards you have.
- The old per-player seconds slider in Settings is replaced by these rules. The native labels come
  from the GGPoker client; the numbers are server-side there, so these values are DanGG rules.

### Bad Beat Jackpot that pays
- The header jackpot now grows: a quarter of the rake from every raked cash hand goes into the pool.
- When a strong hand loses at showdown (Hold'em: quad 8s or better, using both hole cards; Omaha:
  a straight flush), 10% of the pool is paid straight into stacks. The player who was beaten gets
  half, the player who beat them a quarter, and everyone else dealt in shares the last quarter.
- A native-style "BAD BEAT JACKPOT!" banner shows the total and the Bad Beat Winner, Bad Beat
  Opponent and Rest of Players rows. Not on AoF, Short Deck, tournaments or Spin & Gold.
- The roles, labels and exclusions come from the GGPoker client; the trigger hands and the split are
  server-side there, so these values are DanGG rules.

### Wait for Blinds and the faster sit-out clock
- While sitting out you can tick "Wait for Blinds": after Deal Me In you are dealt back in
  when the big blind reaches your seat, and you post only that blind. "Post now" cancels the
  wait. Without the box you still post at once ("Post Blind(s)").
- The sit-out countdown runs twice as fast while players wait for a seat at the table
  (native TablePlayer.kickOutTimeRemaining).
- The meaning of WaitForBlinds is inferred from the client flag name (REA evidence,
  medium confidence); it is not spelled out in the client.
- 585 tests, type check and build pass; browser check of the box, the waiting banner and
  being dealt in as the big blind.


### Native straddle and sit-out (reverse engineered with REA)
- Straddle works like GGPoker: before the cards, every eligible player gets "Straddle to $X"
  / "All-in to $Y" with a 5-second TIME badge; the first Yes posts and opens a new round at
  double the amount (4, 8, 16, ...). A short stack can only go all in. "Auto-straddle" in the
  table menu posts without asking. No straddles heads-up, in bomb pots, Spins or tournaments.
  Action opens left of the last straddler.
- Sitting out in a cash game shows a 02:00 countdown over the board; at zero the seat is
  released and cashed out. "I'm back" is now "Deal Me In" and needs at least 2 big blinds.
- A returning player's forced post reads "Post Blind(s)".
- Evidence: `docs/rea/straddle-sitout.json`. REA (morluto/rea 6.8.0) has no SWF provider,
  so the client was read with exported ffdec sources and a small ABC disassembler. The 5 s
  ask and the 2:00 countdown come from the live table; they are not in the client.
- Not done: "Wait for Blinds" (its meaning is only inferred from the flag name), the 2x
  countdown speed when a waiting list exists, and the maximum number of straddles.
- 581 tests, type check and build pass; browser check of the prompt, the posted straddle,
  the countdown and Deal Me In.


### Table rules parity pass (checked against the GGPoker REA contracts)
- Chips: a player who leaves mid-hand gets back the part of their bet nobody matched.
- Pots are settled the native way: layers with the same players merge, an uncalled layer
  goes back to its owner without rake, and odd chips go clockwise from the button.
  This fixes an 18/16 split on a 34-chip tie and chips lost in run-it-twice.
- Antes are dead money and no longer count towards the bet to call.
- Returning from sit-out in a cash game posts a big blind (not in tournaments, Spin,
  heads-up, or from the blinds).
- Auto top-up fires between hands and stays inside the table's buy-in limits.
- Show cards: anyone dealt in can show after the hand, folded players too, once per hand.
- The bet field selects on focus and accepts typing; the amount is clamped to min/max.
- Only your own seat turns red in the last 5 seconds (opponents keep the normal glow).
  Folded seats darken the avatar instead of fading the whole seat, a stack of 0 reads
  "All-In", long names are cut at 15 characters and Time Bank appears only in the last
  10 seconds of your turn.
- At the end of each street, bets slide into the pot (400 ms, ease-out).
- Still open: payout animation per pot, clock banks, the take-seat popup, live side-pot
  piles and the waiting-list UI. The PLO short-blind pot cap was left out deliberately:
  it is a tournament rule (TDA) and was not observed on the native client.
- 535 tests, type check and build pass.


### Codex clone feature parity pass
- Lobby AvgPot, VPIP and H/hr are now measured from the last 20 hands of each table
  instead of estimated demo numbers.
- At showdown the winning five cards lift and the rest dim (native best-five focus).
- The last 5 seconds of a turn pulse red on your own seat.
- Player notes use the 11 native colours, and you can name ten of them on My Page.
- SB and BB markers sit beside the blinds.
- Each table can keep its own felt and background from the table menu.
- Hotkeys cover 13 actions in three groups with F1–F4 and Ctrl+1–4 defaults; assigning a
  key that is already in use moves it and tells you which action lost it.
- "Don't round to nearest blind" in Settings → Betting; pot-fraction shortcuts otherwise
  round up to the small blind.
- Clicking an opponent shows a HUD: VPIP, PFR, hands, wins and recent hands at this table.
- Hand history shows positions and a per-street detail view.
- Owners can set the action time per cash table and keep bounded database snapshots.
- The Spin & Gold lobby panel shows Info, Blind Structure and Payout.
- Fixed: mucked hole cards were sent to every player in the live showdown event.
- Verified in a real browser against a temporary server with bots: markers, best-five
  focus, HUD, per-table look, hotkeys, Don't round, label titles, Spin panel and
  measured lobby stats; 507 tests, type check and build pass.

## 2026-11-12

### REA runtime verification of the admin console
- Used REA's CDP browser tools against a pre-authenticated headless Chrome on the disposable
  test instance: target listing (`ev_9fbe9044…`), page inspection (`ev_a0af0030…`) and a
  viewport screenshot (`ev_0c342def…`). The observation confirmed the Platform heading,
  **Snapshot all**, per-room **Snapshot** / **Level +1**, **Recovery** values and
  **restored** markers, `GET /api/admin/platform` 200, and no console events in the window.
- Recorded the setup, evidence, findings and limitations in
  `docs/REA-ADMIN-VERIFICATION.md`; this complements the static server inventory and the
  production SQLite inspection. No credentials, bodies, headers or storage values were
  captured. No production change; unit suite 428/428.

## 2026-11-12
### Multi-room crash soak
- `tools/tournament-soak.mjs --rooms N` now creates N two-player events per cycle (unique
  users/tournaments), waits for a settled-hand snapshot in every room, `SIGKILL`s the server
  once, restarts on the same data and verifies every room's players, `restoredAt`, snapshot
  and original table id on reconnect.
- Local run: **2 cycles × 3 rooms passed** (six events, players 9,900/10,100 each). The
  nightly workflow now runs `--cycles 2 --rooms 3`; `--rooms` is documented in the runbook.
  The unit suite is unchanged at 428/428.

## 2026-11-12
### Room-owner boundary extracted
- `TournamentRoomOwner` now owns the live room map and its lifecycle: creation, restart
  restore, snapshot scheduling, sweeps, snapshot-all and disposal. `index.js` injects
  `makeRoom` and the snapshot callbacks, so a future dedicated room-owner process is an
  implementation change behind this boundary instead of a rewrite of the admin/tournament
  APIs.
- Behavior preserved: the crash/restart soak passed **2/2** cycles after the refactor
  (players, stacks, level and table id restored), and the test server restored its rooms.
  New unit tests cover ensure/restore, completed events, dispose, snapshot/all, missing
  rooms and sweep-triggered saves. Full suite 428/428.

## 2026-11-12
### Admin blind-level control
- New audited **`POST /api/admin/tournaments/:id/level`** (body `delta`, 1–20): advances the
  shared blind level between hands. It refuses a room with a hand in progress or a finished
  room, resets `levelStartedAt`, applies the new blinds to every flight and then writes a
  recovery snapshot. The Platform's Actions column has **Level +1** with a confirmation and
  shows the new level/blinds.
- Logic lives in `tournament-controls.js` (shared 1.5× blind curve, clamp at level 100),
  with unit tests for the advance, mid-hand/finished refusal and the curve, plus an
  admin-only/missing-room HTTP test.
- Verified on the test server: QA room advanced to **level 6 / blinds 759–1519**, audit row
  `tournament_level`; UI shows Snapshot + Level +1. Full suite 423/423.

## 2026-11-12
### Public operational health and external warning alerts
- `GET /healthz` now returns a compact, non-sensitive summary: version/build, uptime,
  `rooms: {total, stale}`, `disk: {usedPct, freeBytes}` and a `warnings` array. Warnings are
  a room with players and no settled-hand snapshot for five minutes, and disk ≥90% used.
- The Nano watchdog (`deploy/nano-uptime-check.sh`) reads the body and sends a Discord alert
  when the warning text changes, including a cleared-warnings notice, alongside its
  down/recovered state alerts (python3 on Nano for the JSON parse; uptime still works
  without it). Runbook documents the payload.
- Tests: health warnings unit test and a `/healthz` HTTP test (version/uptime/rooms/disk/
  warnings). Full suite 419/419.

## 2026-11-12
### Admin snapshot controls and the room-owner boundary
- New audited admin actions: **`POST /api/admin/tournaments/:id/snapshot`** and
  **`POST /api/admin/tournaments/snapshot-all`**. The Platform has a **Snapshot** button per
  running room and **Snapshot all** in the header; both return bytes/players and skip a hand
  in progress or a finished room instead of persisting an inconsistent state.
- Extracted snapshot save/load/delete and the settled-hand guard into `tournament-state.js`,
  separating the persistence boundary from `index.js` for a future dedicated room-owner
  service. Tests: settled-room write, mid-hand/finished skip, malformed load, admin-only
  endpoint and missing-room 404.
- Verified on the test server: single snapshot `376 B / 2 players`, snapshot-all `4/4 saved`,
  audit rows `tournament_snapshot` / `tournament_snapshot_all`. Full suite 417/417.

## 2026-11-12
### Recovery staleness alert and automated restart soak
- The Platform report now flags a running room with players as **stale** when its last
  settled-hand snapshot is older than five minutes (or missing): `snapshotAgeMs`/`stale`
  per room, `tournaments.stale` in the summary, a red “stale” marker in the Recovery column
  and a warning banner. Empty rooms are not flagged.
- `tools/tournament-soak.mjs` is an automated crash/restart soak: it starts disposable
  servers on random ports with temp databases, creates a two-player event, waits for a
  settled snapshot, `SIGKILL`s it, restarts on the same data and asserts the room, players,
  level and original table id. Two cycles passed locally (players 9,900/10,100, 382-byte
  snapshot, `restoredAt` set, same `tourney-soak-*` table); documented in
  `deploy/ALWAYS-ON.md`.
- Tests: staleness unit test (fresh/old/missing snapshot, empty room). Full suite 413/413.
- A nightly GitHub Actions workflow **Tournament soak** runs the two-cycle crash/restart
  soak at 03:00 UTC and supports manual dispatch.

## 2026-11-12
### Disk pressure: admin visibility and weekly cleanup
- The Platform report now includes the filesystem backing the container (`disk`:
  total/free bytes and used %); the admin shows a **Disk free** stat and a `Server → Disk`
  row (`22 GB free of 96 GB`), so capacity pressure is visible before a deploy fails.
- Incident: one production deploy failed with `no space left on device` at 100% disk. The
  Docker build cache (16.6 GB) and old rollback images were pruned, freeing ~22 GB;
  `deploy/prune-docker.sh` now keeps the three newest `dangro-game:rollback-*` tags, prunes
  the build cache and dangling images, and is installed as a Monday 04:17 cron job.
  `deploy/ALWAYS-ON.md` documents the failure mode and the job.
- Tests: `diskUsage` unit test. Full suite 412/412.

## 2026-11-12
### Platform recovery visibility and SIGKILL verification
- The admin **Platform** tournament table now has a **Recovery** column: last settled-hand
  snapshot time and size per room, plus a “restored” marker when the process rebuilt the
  room after a restart. The API exposes `snapshot: {at, bytes}` and `restoredAt`, and the
  header counts recovery snapshots. Small snapshot sizes are shown in bytes.
- Verified a hard crash: with a hand in progress, `SIGKILL` left the snapshot unchanged
  (both players at 9,700/10,300); restart logged `tournament restore seated qa-restore-1 2`,
  reported `playersLeft 2`, level 2 / blinds 150–300, the same table id on `/play`, and a
  376-byte snapshot. The interrupted hand was discarded, as designed.
- REA `inspect_sqlite_database` on a production `VACUUM INTO` snapshot confirmed the
  `tourney_state` schema and sampled rows (evidence `ev_3ddc2239…`; offline sample, not an
  integrity proof). Full suite 411/411.

## 2026-11-12
### Durable tournament rooms (restart recovery)
- Running `TournamentRoom`s now snapshot their flights, seats, stacks, blind level/clock,
  finished places and winner into a new `tourney_state` table. Snapshots are written after
  every settled hand, after start/seating and balance/break moves, every 15 s and on a
  graceful shutdown. A hand in progress is never snapshotted: the last settled state is kept
  and an interrupted hand is voided rather than replayed.
- On boot the server restores every `running` event before accepting connections: flights
  and live tables are rebuilt, seats/stacks/flights/places come back, the shared blind clock
  resumes, and a player's `/play` returns their original table. Malformed or older snapshots
  are ignored.
- Fixed the shutdown order: rooms are now snapshotted **before** the live tables close (it
  used to close the tables first, which saved empty rooms).
- Verified with a live two-player event: graceful kill → both players and 10,000 stacks
  restored, `playersLeft: 2`, same table id on reconnect, level/blinds intact. Room
  snapshot/restore unit tests added. Full suite 411/411.

## 2026-11-12
### Platform administration: live server and tournament observability
- New admin-only, read-only endpoints **`GET /api/admin/platform`** and
  **`GET /api/admin/tournaments/live`**, surfaced in a new **Platform** section of the owner
  console: version/build, Node/PID/uptime/environment, RSS/heap, CPU/load, WebSocket clients
  and distinct users, live tables/seats/connections, tournament rooms with level, current
  blinds, next-level ETA, players/humans left, flights, finishes and winner, plus SQLite
  size/WAL and row counts. The section refreshes every 10 s and can download the report as
  JSON.
- The report is assembled only from the running process and database (no new state, no
  mutations); tournament levels are read through the same `syncLevel` clock the tables use.
- Architecture: documented the tournament runtime and player connection path, the admin
  observability boundary, a static REA inventory of the server (62 files / 711 items, with
  its evidence id and limitations) and the capacity/scale-out caveats (in-memory rooms,
  single process, why a dedicated tournament service would need durable room state).
- Tests: platform report unit tests and an admin-only HTTP test. Full suite 409/409.

## 2026-11-12
### All-in-or-Fold tables now play by AoF rules
- AoF tables were showing the full preflop bar (Call, bet presets, slider, Raise), which the
  engine rejects. They now show only **Fold** and **All-in** (with the stack), the F1/F4
  hotkeys, and an “All-in or fold only” note; check/call/raise hotkeys are disabled in AoF.
- The “out of chips / Reload” banner no longer appears while an all-in hand is still
  running; it waits until the player is out of the hand.
- Verified: clicking All-in on a live AoF table put the seat all-in with no errors, the
  normal cash table kept its full Fold/Call/Raise bar, and the runout no longer shows the
  reload offer.

## 2026-11-12
### Chip shuffle wheel scrub
- While the chip shuffle is playing, the wheel over the table scrubs the native 16×16
  frames (six per notch) and pauses the auto-play; the art fades after a short idle. The
  Other cue now plays when the shuffle finishes or is dismissed.
- Wheel over the action bar still sizes the bet, so the two gestures do not fight.

## 2026-11-12
### Tournament hero art
- Tournament series without dedicated artwork no longer fall back to the Flipout promo
  art, whose baked "DAILY $100,000 FLIPOUT" text collided with the series title. They use
  the neutral room background with a gold radial; series with their own art are unchanged.

## 2026-11-12
### Mobile lobby polish and native bet slider
- The full-art promotion banner no longer draws a duplicate text overlay on phones; the
  baked artwork keeps its own title, with the Discover button and dots over it.
- The phone filter row is compact and shows a **TABLES** label when the selected tab has no
  category pills; the table list clears the fixed bottom navigation.
- The bet slider now uses the native poker-chip thumb (with a phone-sized variant).
- Removed 43 sync-duplicate `"… 2/3/4.ext"` files from the working tree, which also fixes a
  local `tsc` duplicate-declaration error caused by a duplicated `vite-env.d.ts`.

## 2026-11-12
### Login-first startup and update-before-login
- A fresh app open now always lands on the **login screen**. Opening the app discards the
  old session token but keeps the saved credentials; a reload in the same tab keeps the
  session, so the forced-update reload does not log the player out.
- **Remember me** is on by default and stores the account ID and password on this device
  (play-money only; uncheck it to delete them). The next open is prefilled and ready.
- Pressing **Log in** now checks the deployed build **before** creating the session: if the
  client is stale it clears its caches, updates and reloads, then uses the saved credentials
  to finish the login automatically — the player enters the game on the latest version.
- Tests: the fresh-open/login/reload/new-tab flow and a deploy-while-on-login run were
  exercised in headless Chrome (old client → update → auto-login → lobby).

## 2026-11-12
### Version numbers and forced updates
- Every build now has a visible version: the app is **v1.1.0** and each deploy stamps a
  numeric build id (`YYYYMMDDHHmmss`, shown as a readable date/time). The version appears in
  the login footer and at the bottom of the table menu.
- The server exposes the deployed identity at `GET /api/version`, and the client compares it
  on every launch and every time the app returns to the foreground. If the build differs, the
  client deletes the old caches, unregisters the service worker and reloads itself; if that
  still cannot bring it current, it blocks the app behind an **Update required** screen with
  the two build numbers and an update button. There is no way to keep playing a stale build.
- The Vite build writes `dist/version.json`, compiles the same version/build into the client
  and stamps the service-worker cache name (`dangro-<build>`), so each deploy is a new worker.
- Tests: `/api/version` response + no-store header, and build-label formatting.

## 2026-11-12
### Mobile table fixes and self-updating installs
- The phone seat chrome no longer collides: avatar rings clear the hole cards and the
  name plates, and the exact bet amount moved onto the seat's stack line; the felt shows
  only the chip pile, so wager pills can never touch the pot or the plates.
- Phones that were still showing an old cached build now update themselves: the service
  worker cache version was bumped, the client checks for an update on load and reloads once
  when the new worker takes over, and `index.html` plus `sw.js` are served with `no-store`.
  The stale build showed the old white dealer pill, gold pot coins, small cards and the
  desktop “Pop out”/status rows — all gone after the update.

## 2026-11-12
### Battle Royale
- Mystery Battle Royale is disabled, capture-gated (P0 slice B0). The `br-*` rows played as plain Hold'em under the label; the native rules and payout format have not been captured, so no format is invented. New `app/server/battleroyale.js`: new databases seed no `battleroyale` tables, and every boot runs `disableBattleRoyaleTables` (`UPDATE … SET enabled = 0 WHERE game = 'battleroyale' AND enabled = 1`; idempotent, rows kept, other games untouched). `lobbyTables()` (so `/api/lobby` and `/api/tables`) never lists a `battleroyale` row even if one is re-enabled; `join_table` (seat or observe) answers `Battle Royale rules are not available in DanGG yet` before any buy-in; `getLiveTable` never builds a live Battle Royale table, so none can start; `parseTableConfig` (admin table save) rejects the game with the same error, and private hosting already only allows cash games. The lobby's Mystery Battle Royale tab shows an honest empty state ("Battle Royale is not available in DanGG yet" / "Native rules and payout format have not been captured; no format is invented here.") with no rows, list header or Join (`UNAVAILABLE_TABS` in `app/src/lib/lobbyFilters.ts`; `filterTables` also drops `battleroyale` rows from every tab). Tests: new `battleroyale.test.js` (6 cases: migration unit + idempotence, validation, boot seeds none and disables legacy rows across reboots, lobby with a force-re-enabled row, join/observe refused with no chips moved, admin create refused) and `client-logic.test.js` +1 (empty-state copy, no Battle or Home rows).

### Spin & Gold
- Spin insurance is disabled (`Insurance — not available` in the table UI; the server rejects it) until the native premium/payout settlement is observed; no invented insurance math remains.
- Live Spin & Gold now follows the verified blind schedule (P0 slice S1c). The invented "×1.5 every 8 hands" bump is gone: the draw records `spinStartedAt`, and before every Spin deal `table.js` calls `spinBlindLevel(multiplier, {startedAt, now, completedHands})` and sets the small/big blind (and min raise) from the 26-level `spinSmallBlinds` ladder: minute steps for the 2x–5x rows (1/2/2/3 min), completed-hand steps for 10x and up (10/15/15/20 hands), capped at level 26 (1,500/3,000). A level change emits `blinds_up` with the level. The snapshot's `spin` now carries `blindLevel`, `smallBlind` and `bigBlind` (null before the draw); a reset Spin clears the clock. Non-Spin tables, payouts and table seeds are unchanged. The spin clock is injectable (`table.spinClock`) for tests. Tests: `spin-table.test.js` +5 (2x by minutes, 10x by completed hands, cap on both units, reset clears the level, non-Spin blinds untouched).
- Live Spin & Gold now uses the verified table (P0 slice S1b). The invented multiplier list is gone: when the first hand is dealt (all three seats filled, observed stake only) the table draws a `crypto.randomInt(100000000)` ticket and calls `spinOutcome(buyIn, ticket)`, setting the multiplier, `prize = buyIn × multiplier` and three place payouts. Busting players are paid 3rd/2nd, the last player 1st (two busts in one hand take 2nd/3rd in seat order, like single-table tournaments). Spin chips are no longer cash: each place payout (`spin_payout`, or a zero `session_close` for an unpaid place) closes the seat's buy-in session on its unique `out:<session>` reference, so a later cash-out, bust close or repeated award is skipped (no double pay). Leaving a running Spin takes the lowest open place; a dropped connection is blinded out like a tournament seat. Nobody can join a Spin after the draw, unobserved stakes never deal and refuse seating, and a finished or human-less Spin resets to a fresh table. The snapshot carries `spin.payouts`, `buyIn`, `finished`, multiplier and prize; the intro wheel shows the observed multipliers and the paid places. Seed/migration: the 15,000 3-max and 30,000 6-max rows are no longer seeded and are disabled on boot (never deleted); eight 3-max play-money tables (`spingold-5000-1..4`, `spingold-10000-1..4`, level-1 blinds 10/20) are inserted only when missing. Starting chips and time-bank cards stay unobserved (the seat stack is still the buy-in); the blind clock is unchanged (`spinBlindLevel` not wired yet). New `app/server/spin-ledger.js`; tests: new `spin-table.test.js` (9 cases: full 1st/2nd/3rd payout with an injected ticket summing to the pool and no double pay, double bust, mid-Spin leave, snapshot, reset, invalid stake, three-seat start, seed across two boots, legacy disable + backfill).
- Ported the verified play-money Spin & Gold table as a pure module (P0 slice S1a, new `app/server/spin.js`, port of Codex `engine/spin.mjs` + `prizeAmounts`). **No behaviour change: not wired into `table.js` yet**; the live multiplier list is untouched until slice S1b. Outcomes per 100,000,000 tickets, in order: 20,000× 5 (50/30/20, levels every 20 hands), 100× 4,000 (60/30/10, 15 hands), 50× 8,000 (60/30/10, 15 hands), 10× 2,450,000 (80/20, 10 hands), 5× 2,800,000 (100, 3 min), 4× 3,000,000 (100, 2 min), 3× 44,124,010 (100, 2 min), 2× 47,613,985 (100, 1 min). Only the observed 5,000 and 10,000 stakes are accepted (anything else is a `RangeError`). `spinPayouts(buyIn)` returns whole-chip prizes for 3 places summing to `buyIn × multiplier`; `spinOutcome(buyIn, ticket)` maps an integer ticket in [0, 100,000,000) to its row with starting chips and time-bank cards left `null` (unobserved); `spinBlindLevel(multiplier, {startedAt, now, completedHands})` steps the 26-level `spinSmallBlinds` ladder by minutes or hands per row and caps at level 26. Tests: new `spin.test.js` (11 cases, matching Codex `spin-test.mjs` 1:1: frequency total, exact rows, payout sums, every ticket boundary, invalid tickets/stakes, minute and hand transitions, cap, unknown multiplier).

### Leaderboard
- Cross-room leaderboard metrics (P1 slice L1, new `app/server/leaderboard.js`). `GET /api/leaderboard?metric=vip|elo|xp` (default `vip`, anything else 400) ranks every active player by VIP points, cross-room Elo (`users.elo`) or XP, ties by nick, top 50, banned and deleted accounts excluded. Each row has `rank`, `nick`, `avatar`, `vip_level`, `value`, and keeps the old `vip_points`/`xp` fields (plus `elo`) for existing callers. A logged-in caller also gets `me: { rank, value }`, counted over all active players so it is right outside the top 50; anonymous, banned or deleted callers get `me: null`.
- The Leaderboard page (`app/src/pages/Rewards.tsx`) has VIP points / Elo / XP tabs that refetch on change, a subtitle per metric, top-3 cards with the metric value, a `# · Player · VIP · <metric>` table with the current player highlighted, and a "Your rank" line. Labels and formatting live in the pure `app/src/lib/leaderboard.ts`.

### Admin console
- Queued backup restore (P1 owner console, slice A7, new `app/server/admin-restore.js`). `POST /api/admin/restore` takes `{ data: <base64>, confirm: 'RESTORE' }`; anything but the exact confirm word, invalid base64, a file that does not start with `SQLite format 3\0`, fails `PRAGMA integrity_check` or lacks the `users`, `hands` and `tables` tables is 400, and more than 6 MB decoded is 413. The upload is written to a `mkdtemp` dir in the OS temp dir (`GGPOKER_BACKUP_TMP` override), opened with `DatabaseSync` and checked there, then atomically staged as `<DATA_DIR>/restore-pending.db` (write to a hidden temp name, then rename); the temp dir is always removed. A `restore_queued` audit row records the size and the answer is `{ ok: true, requiresRestart: true }`. The request never touches the live database and the server keeps running on it. On the next start `app/server/db.js` applies the pending file **before** opening the DB: it re-validates it, renames `ggpoker.db` (plus `-wal`/`-shm`) to `ggpoker.db.pre-restore-YYYYMMDD-HHMMSS` (UTC), moves the pending file into place, opens and migrates normally, and writes a `restore_applied` audit row naming the kept copy. An invalid pending file is logged and left in place, and the live database is untouched. No hot restore. Admin-only (401 anonymous, 403 non-admin, 405 other methods) behind the `/api/admin` network gate. Admin → Dashboard has a **Restore backup…** picker next to **Download backup** (`app/src/components/AdminRestore.tsx`): pick a `.db`, type `RESTORE`, **Queue restore**; the toast says "Restore queued — restart the server to apply". The UI never restarts the server. Tests: new `admin-restore.test.js` (9 cases, including a real child-process restart that applies the pending DB and keeps the pre-restore copy, and an invalid pending file ignored at startup).
- Users list search, status filter and pagination (P1 owner console, slice A6, new `app/server/admin-users-list.js`). `GET /api/admin/users` accepts `q` (case-insensitive substring of login, nick or email; `%` and `_` are literal), `status=all|active|admin|banned|muted` (`active` = not banned, `muted` = chat muted; anything else 400), `limit` (default 50, clamped to 200; invalid values fall back to 50) and `offset` (default 0). Deleted accounts are never listed, rows stay ordered by id, every value is a bound SQL parameter, and rows still go through `publicUser`. The JSON keeps `users` and adds `total` (all matches, ignoring paging), the applied `filters` and `activeAdmins` (unbanned admins, so the last-admin guard keeps working with one page loaded). Over-long `q` (>200 characters) is 400; admin-only (401 anonymous, 403 non-admin, 405 other methods) behind the `/api/admin` network gate. Admin → **Users** has a search box (login, nickname or email, debounced), a status select, a 25/50/100 per-page selector, an "x–y of N users" count, Prev/Next and an empty state; avatar, balance, ±$1k credit, Edit, Mute and Make/Revoke admin are unchanged and reload the current page with the current filters. Tests: new `admin-users-list.test.js` (11 cases).
- Transaction filtering and CSV export (P1 owner console, slice A5, new `app/server/admin-transactions.js`). `GET /api/admin/transactions` accepts `q` (case-insensitive substring of the user's login or nick or the memo; `%` and `_` are literal), `kind` (exact transaction kind) and `limit` (default 300, clamped to 1000; invalid values fall back to 300). Filters combine with AND, rows stay newest first, joined to `users`, and every value is a bound SQL parameter. The JSON keeps the `transactions` array with the same row shape (every ledger column plus `login` and `nick`) and adds the applied `filters`. `format=csv` answers `transactions.csv` (`content-disposition: attachment`, UTF-8 BOM) with header `id,user_id,login,nick,kind,amount,currency,memo,created_at`, CRLF lines and RFC 4180 quoting; text cells starting with `= + - @` get a leading `'`, numbers (including negative amounts) are written as-is. New `GET /api/admin/transactions/kinds` lists the distinct kinds. Over-long filters (>200 characters) or another `format` are 400. Admin-only (401 anonymous, 403 non-admin, 405 other methods) behind the `/api/admin` network gate. Admin → **Transactions** (`app/src/components/AdminTransactions.tsx`) has a filter row (Search login, nick or memo; a kind dropdown from the kinds endpoint, falling back to the loaded rows; a Last 50/100/300/500/1000 selector; Apply, Reset, Export CSV of the applied filters), the same table columns and an empty state. The Dashboard's recent-transactions card and the generic `/api/admin/export/transactions` are unchanged. Tests: new `admin-transactions.test.js` (11 cases).
- Database backup download (P1 owner console, slice A4, new `app/server/admin-backup.js`). `GET /api/admin/backup` makes a consistent snapshot with SQLite `VACUUM INTO` a unique `mkdtemp` directory in the OS temp dir (override with `GGPOKER_BACKUP_TMP`; a temp root inside the data dir is refused at startup), streams it as `application/vnd.sqlite3` with `content-disposition: attachment; filename="dangg-backup-YYYYMMDD-HHMMSS.db"` (UTC), `content-length` and `cache-control: no-store`, and deletes the temp directory in `finally`. Each download writes a `backup` audit row (`<filename> <size> bytes`). The live database path never appears in headers, body or audit detail; failures answer 500 "Backup failed". Admin-only (401 anonymous, 403 non-admin, 405 other methods) behind the `/api/admin` network gate. Admin → Dashboard has a **Download backup** button next to the CSV exports (`api.admin.backup()`), with a success or failure toast. No restore. Tests: new `admin-backup.test.js` (8 cases).
- Audit-log filtering and CSV export (P1 owner console, slice A3, new `app/server/admin-audit.js`). `GET /api/admin/audit` accepts `actor` and `action` (exact match), `q` (case-insensitive substring of `detail`; `%` and `_` are literal) and `limit` (default 200, clamped to 1000; invalid values fall back to 200). Filters combine with AND, rows stay newest first, and every value is a bound SQL parameter. The JSON keeps `log` and adds the applied `filters`. `format=csv` answers `audit.csv` (`content-disposition: attachment`) with a header row `id,actor,action,detail,created_at`, CRLF lines, RFC 4180 quoting (commas, quotes, newlines) and a leading `'` on cells that start with `= + - @`, so player-supplied text cannot run as a spreadsheet formula. Filters over 200 characters or another `format` are 400. Admin-only (401 anonymous, 403 non-admin) behind the `/api/admin` network gate. Admin → **Audit log** (`app/src/components/AdminAuditLog.tsx`) has a filter row (Actor, Action, Search detail, a Last 50/200/500/1000 selector, Apply, Reset, Export CSV of the applied filters), the same table and an empty state. Tests: new `admin-audit.test.js` (10 cases).
- Admin chat moderation (P1 owner console, slice A2, `app/server/admin-chat.js`). `GET /api/admin/chat?tableId=<id>&limit=100` lists recent persisted table-chat lines newest first (`id`, `channel`, `user_id`, `nick`, `text`, `created_at`; all table channels when `tableId` is omitted, never lobby lines) with the tables that have chat (name, line count, last activity); `limit` is capped at 500 and a bad table id is 400. `POST /api/admin/chat/:id/delete` removes the line, writes a `chat_delete` audit row with the channel, sender and text in one transaction, and drops that table's cached history so players who join later no longer see it (404 for an unknown id). Both are admin-only (401 anonymous, 403 non-admin) behind the `/api/admin` network gate; the announcement `POST /api/admin/chat` is unchanged. Admin → **Chat moderation** has a table selector, recent lines with time, table, nick and text, a confirmed **Delete** and **Mute player** (the existing mute action), Refresh and an empty state. Players already at the table keep a deleted line on screen until they reload; no new chat frame was added. Tests: new `admin-chat.test.js` (7 cases).
- Admin role management (P1 owner console, slice A1, `app/server/admin-roles.js`). `POST /api/admin/users/:id` accepts `{ action: 'set_admin', admin: true|false }`, admin-only (401 anonymous, 403 non-admin). An unknown or deleted target gets 404 and a non-boolean `admin` 400; an unchanged role answers `changed: false` without an audit row. Revoking the last active admin (flagged, not banned, not deleted) is refused with 409 "Cannot remove the last remaining admin. Make another player an admin first." Each change writes a `grant_admin` or `revoke_admin` audit row with the actor's login and `user <id> (<login>)` in one transaction, and returns the target as `publicUser`. Admin → Users shows a gold **Admin** tag and a **Make admin** / **Revoke admin** button behind a confirm; it is hidden for the last active admin, the list reloads after a change, and revoking your own role refreshes your session. Tests: new `admin-users.test.js` (6 cases).

### Rush & Cash
- Fair Rush queue service (P0 slice R5, `app/server/rush-pool.js`). Each pool (`game:sb/bb`) now has one FIFO ordered by arrival time (`since`, then arrival sequence). An open seat anywhere in the pool goes to the oldest waiting player who can take it, never across stakes or games. A player who folds while others are waiting in their pool joins the back of the queue instead of taking an open seat first, and a player who is re-queued from the same table keeps their place and original `since` (previously reset each hand). A waiting player whose old table is mid-hand can be passed over by a newer arrival for at most `RUSH_MAX_PASSES` = 2 flushes; after that the pool's open seats are held for them until their hand ends. A player whose old seat is gone leaves the queue. New read-only `poolQueue(poolKey)` view (position, `since`, passes); `waitingList()` keeps its shape. The quick-fold transfer when the queue is empty, socket frames (`rush_queued`, `rush_move`), the 900 ms sweep and the Cash Drop are unchanged. Tests: `rush-pool.test.js` +9 (20 queued players across two pools with seats opening in random order over 5 seeds → service order equals arrival order per pool and no cross-pool move; a new folder does not jump the queue; a re-queue keeps its place; the starvation bound holds; a stale entry does not block the next). 8 of them fail on the previous implementation; the existing 18 Rush tests pass unchanged.
- Rush pool lobby (P0 slice R3, new `app/server/rush-lobby.js`). `/api/lobby` keeps `tables` and adds `rushPools`: one row per pool (`game:sb/bb`, so Rush PLO pools stay separate from Hold'em at the same stake) with `game`, `sb`, `bb`, `seats`, buy-in range, `players` summed across the pool's tables, `pros` (0 until a pro player is defined), `handsPerHour` (real: hands saved across the pool in the last hour), `firstFree` (the first table with a free seat, or null), `wait` (table queues plus the pool's group queue) and the group wait-list key, ordered by stakes descending with Hold'em before PLO. It also adds `rushLeaderboard`: today's (UTC) top 10 real players by chips won, from `cashdrop` ledger rows plus Rush pot wins in saved hands (bots, earlier days and non-Rush hands excluded), with nick and country. The Rush tab now lists one native row per pool instead of one per table (`app/src/components/RushPoolRow.tsx`): Promotion badge, Games chip, Stakes, Buy-in, Players pill with Wait, Pros, Hands/hr and Action. **Join** opens the existing buy-in sheet on the pool's free table; a full pool shows **Join Wait List** on the existing group wait list. The All / Hold'em / PLO pills and the Filters popover still apply, and the hero counts pools and players from the pool rows. The right panel shows a Rush leaderboard (Flag / Player / Chips won, your row highlighted) and a **Rush & Cash Information** dialog explaining quick fold, a new table each hand and the DanGG Cash Drop rule with the configured rate and amount. R2 rules, seating and the Cash Drop algorithm are unchanged. Tests: `http.test.js` +2 (pool aggregation: summed players, PLO separate, stakes order, firstFree, wait, real hands/hr; leaderboard sources and exclusions) and `client-logic.test.js` +5 (`app/src/lib/rushPools.ts`: pool sort, filter visibility, Join/Join Wait List mapping, formatting, leaderboard rows).
- Rush stake ladder and PLO Rush (P0 slice R2). A boot migration (`ensureRushLadder()` in `app/server/db.js`) inserts only the missing pool tables, keyed by deterministic ids, so a second boot adds nothing: Hold'em 50/100, 100/200, 250/500, 500/1000 (the existing eight `rush-platinum` tables) and 1000/2000, plus PLO 100/200 and 500/1000; new pools get 4 six-max tables with a 20–100 BB buy-in. New game id `rushplo`: `PokerTable` deals four hole cards, applies the pot-limit cap and keeps the Rush quick fold (`rush` flag via `isRushGame` in `app/server/validate.js`); Cash Drop and the lobby `pro` flag cover both Rush ids, and Elo files `rushplo` hands under `rush`. Rush Hold'em behaviour is unchanged. Client: `rushplo` tables list under the Rush tab with a "Rush & Cash PLO" label and use Omaha hand evaluation on the felt; the pool lobby is slice R3. Tests: `engine-rules.test.js` +3 (Rush PLO deals 4, pot-limit cap, quick fold with Rush Hold'em unchanged) and new `rush-ladder.test.js` (two real boots on one database insert nothing the second time; a partial ladder is backfilled row by row).
- Extracted the Rush pool module (P0 slice R1, no behaviour change). The fold-and-move queue (`RUSH_WAITING`), the transfer to the emptiest table, the 900 ms queue sweep and the Cash Drop roll moved out of `app/server/index.js` into `createRushPool()` in `app/server/rush-pool.js`; `index.js` keeps thin `moveRushPlayers`/`flushRushQueue` delegates. Pools are keyed by `poolKeyOf({game, sb, bb})` (`rush:500/1000`), so a transfer or queued seat never leaves its pool or crosses stakes (target tables now match `game`, `sb` and `bb`; the seeded Rush tables are one pool, so nothing changes today). Socket frames (`rush_queued`, `rush_move`, `cashdrop`) and APIs are unchanged. Tests: `rush-pool.test.js` +5 (pool key, same-pool emptiest target with emptier other-stake tables present, full pool waits then flushes within the pool, flush waits for the running hand, Cash Drop only on Rush hands and never to bots); existing Rush tests pass unchanged.
- Made the Rush Cash Drop rule admin-configurable instead of inventing it in code (P0 slice R4, **DanGG rule** until a native capture exists). New `app/server/rush-pool.js` reads `rush_cashdrop_rate` (default 0.12) and `rush_cashdrop_amount_bb` (default 5, a flat big-blind multiple per stake that matches the old 5,000 cap at 500/1,000; no longer 50% of the pot) from `settings`, rolls with `crypto.randomInt` instead of `Math.random()`, and writes one `cashdrop` ledger row per hand keyed `cashdrop:<handId>`, so a retried hand save never pays twice. `POST /api/admin/settings` rejects out-of-range or non-numeric values with 400 and writes nothing; `GET` lists both keys with their defaults. Admin → Game settings has a **Rush & Cash Drop · DanGG rule** card with inline validation. `/api/lobby` returns `rushCashDrop` and the Rush hero shows the configured rate instead of a hardcoded 12%. The felt banner moved to `app/src/components/table/CashDropBanner.tsx` and shows the DanGG rule label. Tests: new `rush-pool.test.js` (seeded RNG within ±1% of the rate over 100k trials, amount = bb × multiple, one ledger row per drop, idempotent retry, admin validation over HTTP) and `client-logic.test.js` cases for `app/src/lib/cashDrop.ts`.

### Wait lists
- Added a pure, immutable wait-list model (`app/server/waitlist.js`, P0 slice W1): FIFO table and group queues with DanGG caps (10 per table, 25 per group, 4 per player), 30 s seat offers that pass to #2 on expiry, and group joins that resolve to the first free table.
- Wired the wait-list model into live tables (P0 slice W2). A player who joins a full table is queued (the old inline `WAITLISTS` map is gone). When a seat frees up, it is offered to #1 over the table socket (`waitlist_ready`) and the notification stream (`waitlist_offer`), and the seat is held for them. Bots and other players can't take a held seat (`PokerTable.setHolds`/`isHeldFor`/`freeSeatFor`, `seatHuman` returns `seat held`). A 1 s sweep expires offers, tells the old holder (`waitlist_expired`) and passes the seat to #2. Rejoining the table accepts the offer. `GGPOKER_WAITLIST_HOLD_MS` overrides the 30 s hold (used by tests).
- Added the wait-list HTTP API (P0 slice W3, `app/server/waitlist-http.js`): `POST`/`DELETE /api/tables/:id/waitlist`, `POST`/`DELETE /api/lobby/groups/:key/waitlist` (key `game:sb/bb:seats`, URL-encoded) and `GET /api/waitlists/me` (queues with position and size, plus held-seat offers). A join that finds room answers `status: 'seat'` instead of queueing; seated players get 409, a full queue or the 4-queue limit get 409 with `status: 'full' | 'limit'`. All routes need a login, are rate limited to 10 joins/leaves per 10 s per player (429), and validate ids and group keys (`parseTableId`/`parseGroupKey` in `validate.js`). Private tables answer 404 to everyone but the owner and invitees (players who opened the invite link or sit at the table) and never join a public group.
- The lobby now shows the **real** wait-list length (`wait`) and the caller's position (`myWait`, 0 when not queued); the synthetic hash-based wait is gone.
- Queue changes push a `waitlist_update` (`queueKey`, `kind`, `tableId`/`groupKey`, `position`, `size`; position 0 = no longer queued) over the existing notification stream to every player in the changed queue.
- `app/src/lib/api.ts` gained the wait-list client methods and types (`joinTableWaitlist`, `leaveTableWaitlist`, `joinGroupWaitlist`, `leaveGroupWaitlist`, `myWaitlists`, `WaitlistUpdateEvent`, `LobbyTable.myWait`). The lobby UI is slice W4.
- Lobby wait-list UI, part one (P0 slice W4a). The Table View **Wait** column shows the real queue length in muted gold (`0` when empty, never `-`) with a gold dot when you are queued there. The selected-table side panel now shows "**N** Players on Waiting List" (hidden at 0), "You are #n" when queued, and one primary action: **Join** while a seat is free, **Join Wait List** on a full table, **Leave Wait List** when queued, or a disabled **Join Wait List** with the native "Waiting list is currently full." reason when the queue is at its cap; **Watch** sits below it. Rows get no new button, matching native Table View. Join/leave errors (full, 4-queue limit, rate limit) show as toasts. The pure `waitlistActionFor(table, myWait)` and `waitCount` helpers live in `app/src/lib/waitlist.ts` with tests in `client-logic.test.js`. The header chip, seat-offer modal and table-page banner are slice W4b.
- Lobby wait-list UI, part two (P0 slice W4b). A global `WaitlistProvider` (`app/src/lib/waitlistState.tsx`) holds the player's queues and live seat offer, loaded from `/api/waitlists/me` and kept current by `waitlist_update`, `waitlist_offer` and `waitlist_expired` on the notification stream, so every route agrees. The header shows a gold **Waiting List · n** chip while you are queued (`WaitlistChip.tsx`); its popover lists each table or group queue as "#3 of 5" with a **Leave** button and closes on Esc or an outside click. A held seat opens **Seat available at *table*** (`SeatOfferModal.tsx`) with a live 30 s countdown ring (gold, red with the number still white in the last 10 s, number only under reduced motion), **Pass** and **Take seat**; Take seat opens the held table and sits you down. It is a focus-trapped `alertdialog` off the tables and a non-modal toast with a countdown bar over another table; screen readers hear the countdown at 30, 10 and 5 s only. Expiry closes it with a "Seat offer expired" toast. The table page's observer banner now reads the same state ("You are #2 of 4 on the waiting list…", or the held seat with its countdown) instead of its own local position. Group View cards switch between **Join**, **Join Wait List** for a full group (`joinGroupWaitlist`) and an outline **#n · Leave** once queued. New pure helpers in `app/src/lib/waitlist.ts` (`offerSecondsLeft`, `formatCountdown`, `isOfferUrgent`, `offerProgress`, `chipCount`, `waitlistChipLabel`, `queuePositionLabel`, `groupKeyOf`, `queueName`, `applyQueueUpdate`, `groupActionFor`) are covered in `client-logic.test.js`.
- Admin wait-list monitor (P0 slice W7, `app/server/admin-waitlist.js`). `GET /api/admin/waitlists` returns every non-empty table and group queue with its key, table or group name, length, positions (nick + position + time waiting), held seats (holder, table, seat, time left) and the oldest wait, plus totals. `POST /api/admin/waitlists/clear` with `{tableId}` or `{groupKey}` empties that queue and releases its held seats (a freed seat is offered on as usual, e.g. to the table's group queue); it writes a `waitlist_clear` audit-log row and notifies affected players over the notification stream (`waitlist_update` with position 0 for waiting players, `waitlist_expired` with `reason: 'cleared'` for seat holders). Both routes are admin-only (`is_admin`, 403 otherwise) behind the existing `/api/admin` network gate; bad bodies get 400 and an empty queue 404. Join times are tracked next to the pure model (`trackJoinTimes`), not inside it. The admin console has a new **Wait lists** section (`AdminWaitlists.tsx`): Queues / Waiting players / Held seats metrics, a queue table with a confirmed **Clear queue** button, an empty state and a refresh after each clear. Tests: new `admin-waitlist.test.js` (6 cases).

### Tournament start
- Tournament soak tool (P0 slice T3, `tools/soak-tournament.mjs`, not part of `npm test`; opt-in CI recipe with `SOAK=1` in `docs/CI.md`). It seats a 60-entrant bot field through `TournamentRoom.seatRegistrants` and plays real `PokerTable` flights on a virtual clock with fast blinds, checking chip conservation, single seating, unique places and completed table breaks on every sweep, then finishing order and payouts = prize pool; it exits non-zero with a failure summary on any breach. It passes 3 consecutive runs after the fixes below.
- Tournament places and payouts settle correctly (P0 slice T3 fixes, found by the soak). **Stale `inHand`**: a table clears every seat's `inHand` once a finished hand's delay runs out (`PokerTable.clearHandFlags`, also before a managed flight reports it is settled), and `TournamentRoom.movePlayer`/`balance` only refuse a player who is in a hand that is still running, so a one-player flight is balanced or broken instead of stalling the event; a busted seat waiting to be cleared is never moved and its table is never half broken. **Simultaneous busts**: `onBust` ranks every busted, uncleared seat on any settled flight in one pass and gives each a unique place counted down from the players still seated; the smaller starting stack finishes lower, then the seat farther clockwise from its button (`compareBustOrder`, flight index then id as deterministic fallbacks); a table reporting an already-ranked player gets `null`. **Final hand**: `checkWinner` waits until no flight is in its post-hand delay and no bust is unranked, so the runner-up's bust is recorded and paid before the winner is declared, and the ledger equals the prize pool. Payout bands (DanGG rule), betting rules and chip handling are unchanged. Tests: `tournament-room.test.js` (+7: stale flag vs running hand, no half break with a busted seat, real table clears `inHand`, two-table simultaneous busts by starting stack, button tie-break, winner waits for the showdown delay, real heads-up finish pays 6250/3750 = pool); two existing tests updated to the new semantics.
- Every registrant is seated at the scheduled start, online or not (P0 slice T1). The scheduler (and an early `/play`) flips `registering → running` through one `startTournament()` that calls the new `TournamentRoom.seatRegistrants(regs)`: each `tourney_regs` row, in registration order, goes through `nextFlightIndex` (fill one flight, then open the next) and sits down `away` and sitting out, with no bots added. Elimination tables deal sitting-out players in, so an absent player auto-folds or auto-checks and is blinded out; their bust goes through the room, so they finish in the right place across the whole field. `/api/tournaments/:id/play` returns the seat a player already has instead of seating them again. Each seated registrant gets an SSE `tournament_started {id, name, tableId, index}`; the stream re-sends it on connect for any seat the player has not opened yet, so a late opener is told too. The client (`store.tsx`) shows one "Your tournament started" toast per event with a **Go to table** button that opens the player's real flight; toasts with a link stay 15 s. Opening the table clears `away` and sits the player back in. A dropped connection in a tournament now blinds the player out after the grace period instead of forfeiting the seat; cash tables still cash out. `GGPOKER_TOURNEY_SCHEDULER_MS` overrides the 15 s scheduler tick (used by tests). Tests: `tournament-room.test.js` (14 absent registrants seated 6/6/2 across three flights; a re-run keeps every seat; an absent heads-up pair on real `PokerTable`s blinds down and the first out finishes 14th) and `tournament-live.test.js` (scheduled start over HTTP, SSE to an online registrant, a late opener's SSE and `/play` land on flight 2, joining sits them in).
- Payout table (P0 slice T2). New pure `payoutTable(entrants, prizePool, { mode, ticket })` in `app/server/tournament.js` returns every paid place as whole chips that sum exactly to the prize pool (rounding remainder to 1st) and never increase down the table. The native payout bands are not captured yet (T0), so the bands are the **DanGG rule** (`DANGG_PAYOUT_BANDS`): the existing 50/30/20 for 3+ entrants and 62.5/37.5 for a two-player field (the 50/30 split renormalised; a two-player event previously paid 80% and lost 20% of the pool). Satellites pay a single seat, the ticket, to 1st and no chips (2nd and 3rd no longer receive cash). `TournamentRoom.payouts()` and the single-table path in `table.js` settle from it instead of inline percentages, and ledger descriptions use real ordinals ("finished 4th", not "4rd"). `GET /api/tournaments/:id` now returns `prizePool`, `payouts`, `placesPaid`, `bubble` and, while running, `playersLeft`; table snapshots carry `tournament.payouts`. The tournament detail **Prizes** tab lists every paid place from that table (replacing a client-side guess that disagreed with settlement) with the pool, places paid and, during play, players left and "Bubble: 4th" / "In the money". The table header shows the same bubble pill. Any paid finish shows "Finished 3rd · *nick* wins *amount*" as a toast, and the hero's own paid finish opens the winner presentation titled with the real place ("FINISHED 2ND") and amount. Pure display helpers in `app/src/lib/tournamentPrizes.ts`. Tests: `tournament.test.js` (sum = pool for 2..1000 entrants across 7 pools, monotonic, remainder to 1st, satellites pay tickets, ordinals), `tournament-room.test.js` (20 entrants → places 1–3 each credited once and the ledger equals the pool; satellite room pays no chips), `client-logic.test.js` (prizes, bubble and finish formatting); two-player expectations in `tournament-room`/`tournament-flight` tests updated to 6250/3750.

### Lobby filters
- Group View is now native stake rows (P0 slice F2). The cash list folds into one row per `game + sb + bb + seats` (private tables never fold in), ordered by stakes descending, replacing the per-table Group View rows; Table View is unchanged. Each row shows the summed players across the whole group, the real wait (the group's table queues, plus the group queue once you are in it) and one action: **Join** opens the first table in the group with a free seat, a full group shows **Join Wait List** on the existing group wait-list API, and "#n · Leave" once queued. Filters decide which rows appear; sums and the free seat cover every public table in the group. The W5a per-tab columns and the Table Size / Games chips stay. Pure `groupTables` and `tableGroupKey` in `app/src/lib/lobbyFilters.ts`; 6 new `client-logic.test.js` cases (sums, ordering, private excluded, group key, first free seat / Join Wait List).
- Native lobby filters and columns (P0 slice W5a). The Rush, PLO and All-in or Fold tabs show the native pill row, left-aligned above the column header: **All / Hold'em / PLO**, **All / PLO / PLO-5 / PLO-6** and **All / Hold'em / Omaha**. Pills filter the list and, with the stake/seat/speed dropdowns and ★ Favorites, are remembered per tab (`localStorage` key `ggpoker.lobbyFilters`, validated on read). Rush and AoF pools have one `game` id for every variant, so their variant comes from the table name; no Omaha AoF or PLO Rush pools are seeded yet, so those pills show the new "No tables match these filters." state with a **Reset filters** link.
- Group View is now a native row list with each tab's column set: Hold'em *Promotion · Table Size · Stakes · Buy-in · Players · Action*, Rush *Promotion · Games · Stakes · Buy-in · Players · Pros · Hands/hr · Action*, PLO adds the Games chip before Table Size, and AoF (unobserved) uses the Rush set without Pros and Hands/hr. Table Size is a green **6-Max** / yellow **9-Max** chip, Games a per-variant chip, rows carry the native variant accent bar, and Players is the outlined green pill. The Action cell keeps the W4b Join / Join Wait List / "#n · Leave" button. Table View keeps its eight native columns. Promotion shows the table's stake tier (or Featured) until DanGG has per-table promotions; grouping rows by stake is slice F2.
- The filter logic moved out of `Lobby.tsx` (669 → 638 lines) into the pure `app/src/lib/lobbyFilters.ts` (`filterTables`, `sortTables`, `pillsFor`, `columnsFor`, `variantOf`, `tableSizeChip`, per-tab prefs helpers), covered by 8 new tests in `client-logic.test.js`. New `LobbyPills.tsx`, `LobbyGroupRows.tsx` and `lobby-filters.css` (lobby tokens from the visual brief). The Filters popover with Hide full / Has seats is slice W5b; until then the dropdowns wrap onto a second line on tabs with pills.
- Lobby Filters popover (P0 slice W5b). The stake / seats / speed dropdowns, search and ★ Favorites moved out of the bar into one **Filters** popover (`LobbyFiltersPopover.tsx`) at the right of the pill row, next to **+ Host**, so the bar is one line again on every tab. Inside, in order: Stakes, Seats and Speed as segmented pill rows, a search field, then **Hide full**, **Has seats** and **★ Favorites** checkboxes, with **Reset** (clears the popover filters, keeps the selected pill) and the table count in the footer. **Hide full** drops tables with every seat taken; **Has seats** keeps only tables you can sit at right now (a free seat and nobody on the wait list). The button reads "Filters · n" in gold while n popover filters are active. The popover closes on Esc (focus returns to the button) or an outside click. Search, Hide full and Has seats are now remembered per tab with the other filters (`ggpoker.lobbyFilters`; search capped at 64 characters, bad stored values fall back to defaults). New pure helpers `activeFilterCount` and `resetExtraFilters` in `lobbyFilters.ts`, with 5 new tests in `client-logic.test.js`. On phones the pills scroll inside the bar so the popover isn't clipped.

### Tournament filters
- Tournament categories and filters (P0 slice W6 / plan F3). The Tournaments page has a category rail (**All series**, WSOP Express, GGMasters, Mystery Bounty, Spin & Gold, Flip & Go, Bounty Hunters, Satellites) and a filter row with **Game** (NLH / PLO, PLO-5/6 count as PLO), **Buy-in** band (Freeroll, Micro ≤ $5, Low $5–$25, Mid $25–$100, High $100+, buy-in plus fee), **Status** (Registering, Late reg = running inside the late-registration window, Running = late reg closed), **Speed** (Regular, Turbo ≤ 6 min levels, Hyper ≤ 3 min; a "Turbo"/"Hyper" name wins) and **Registered only**, plus the search field, which now actually filters (it was unwired). Categories match the server `mode` first (MYSTERY, FLIP, BOUNTY, SATELLITE) and fall back to the name. Filters are remembered in `localStorage` (`ggpoker.tournamentFilters`, validated on read, search capped at 60 characters). The row shows "Filters · n" for active filters and a **Reset**; an empty list reads "No tournaments match these n filters." with **Reset filters**. The duplicate subnav quick-filters (All / Register now / Running / Hold'em / PLO / Freeroll) are gone, folded into the row. The row status tag now reads **Late reg** for running events still open to entry. Rows, the hero and the detail modal are unchanged. Pure logic in `app/src/lib/tournamentFilters.ts`, UI in `TournamentFilterBar.tsx` + `tournament-filters.css`, 10 new tests in `client-logic.test.js`.

### Table chat
- Dealer log (slice C4, **DanGG extra, not parity**: native table chat is still uncaptured, C0). The server writes one `Hand #N started` line when a hand starts (`hand_start` event) and one `<nick> wins <amount> with <hand>` line when the hand result is saved (fold wins omit the hand; split or run-it-twice pots are summed per player and joined with `;`). New `addSystemLine(tableId, text, { key })` in `app/server/chat.js` appends a line with `kind: 'dealer'` and nick `Dealer` to the table ring buffer and `chat_messages` (new `kind` column, default `'chat'`, added by a boot migration), and broadcasts the normal `chat` frame with `kind: 'dealer'`. It never touches the per-sender limiter, and a repeated key (hand id + start/result) for the same table is a no-op. Lines are only written while someone is connected to the table, so unattended bot tables do not grow `chat_messages`. Player `chat` frames now carry `kind: 'chat'`; history rows carry `kind`. Client: the table chat header has **Chat / Dealer** tabs (panel-local state, default Chat, so the table never re-renders); dealer lines render muted and italic, have no Mute/Report, no seat bubble or sound, never raise the unread badge and survive a local mute. Player chat limits, cash and tournament rules are unchanged. Tests: `chat.test.js` +4 (text format, persist + broadcast + history `kind`, per-key idempotency, limiter independence) and `client-logic.test.js` +4 (dealer parsing, Chat/Dealer filtering, system styling and role, no unread).
- Server chat module (P0 slice C1, `app/server/chat.js`). `validateChat` trims, turns line breaks into spaces, strips control and bidi-override characters and accepts 1–280 characters (longer messages are rejected, not cut). `validateReaction` accepts only the integer IDs 1–3 (Angry, Listening, Laughing); `"1"`, `1.5`, `null`, `[1]`, `{}` and unknown integers are rejected. Each table keeps a 50-line ring buffer persisted to `chat_messages` with `channel = 'table:<id>'` and rebuilt from the database after a restart. A per-sender 1 s limit replaces the shared 6-per-5 s socket limiter; one sender's clock never resets another's. Every `join_table` path (seated, observing, tournament rail, wait list) now sends a `chat_history` frame with the last 50 lines. Observers are read-only until capture C0: their `chat`/`reaction`/`emote` frames get an error. Account and table mutes still drop chat and reactions silently. Text is stored and echoed verbatim (no HTML handling server-side). The inline handlers in `index.js` became one delegate. New `{type:'reaction', id}` frame; the legacy `emote` frame is still accepted and mapped to a reaction ID (😠😡🤬😤 → 1, 👂🎧🤔 → 2, 😂🤣😆😄 → 3), other glyphs are dropped. Reactions broadcast as `emote` events with `reactionId`, `label` and a fallback glyph so the current client keeps rendering them until C2/C3. Tests: new `chat.test.js` and four WS cases in `spectator.test.js`.
- Docked table chat and reactions (P0 slice C3). The topbar Chat/emoji buttons and the 10-emoji tray are gone. A **Chat** button docked at the lower left of the felt shows a red unread badge (99+ cap) and opens a 300 px panel (`TableChat.tsx`): the last 50 lines, kept at the bottom only while you are already there, sender names in gold for you and blue for others, text-only rendering that wraps long words, a 280-character input with a live counter in the last 40 characters (red in the last 10), and Enter to send, which never reaches Enter-to-bet. The `chat_history` frame fills the log on join and reconnect, deduplicated by line id. Hover, focus or tap a line for **Mute** (hides the player's lines, bubbles and reactions on this device; the table host's mute also writes `table_mutes`) and **Report** (the report modal, now `ReportPlayerModal.tsx`, opens with "Abusive chat" and the line prefilled). **React** next to Chat opens a grid of the three allowlisted reactions (`ReactionPicker.tsx`, `{type:'reaction', id}`); a reaction shows beside the sender's seat for 4 s with a short pop-in (`SeatReaction.tsx`, still with reduced motion) and is recorded in the log as "Laughing". Reaction artwork is used when C2 has extracted it to `/assets/reactions/<id>.png`; until then each reaction is a labelled CSS chip, never an emoji. Spectators read chat but the input and React are disabled ("Spectators can read chat only"). Chat bubbles over seats still last 4.5 s. Chat state lives in an external store (`useTableChat.ts`, `useSyncExternalStore`), so incoming lines and reactions re-render only the panel and the seat overlays, not the table page, action bar, bet draft or confirm dialog. **Settings → Table** has **Show chat bubbles** and **Show reactions** (`ggpoker.chatBubbles`, `ggpoker.reactions`, both on by default). Colours are WCAG AA on the panel (contrast ratios noted in `table-chat.css`). `TablePage.tsx` went from 1452 to 1406 lines. The pure `chatReducer` (append, cap 50, history merge without duplicates, unread reset on open) and frame parsers live in `app/src/lib/tableChat.ts`, with 6 new tests in `client-logic.test.js`. No dealer log (C4 skipped).
### Welcome and login: the DanGG Poker Lounge design
- The welcome/login screen now uses the approved **Poker Lounge** artwork: the lounge
  hero (headline “The table is waiting.”) on the left of the desktop layout and a
  full-width hero above the card on phones, with the mobile art taken from the approved
  mobile composition.
- The card was rebuilt to the design: Log in / Create account tabs, “Welcome back”,
  account and password fields with icons and a show/hide control, **Remember me**
  (persists the login id), Forgot password, the red **Log in →** CTA, the “or” divider,
  **Play as guest**, and the play-money disclaimer.
- Working chrome: **Help** (support details), a **language** menu (all 30 languages),
  **Terms** and **Privacy** dialogs, and a footer with the hairline segments.
- Login and guest flows were exercised in headless Chrome; the mobile layout scrolls to
  the card bottom and footer at 390×844. The artwork is host-local (gitignored) and copied
  to the deploy host like the other official art.

### Mobile table layout and the native turn clock
- The table now genuinely fits **portrait phones, landscape phones and tablets**:
  - portrait 390×844: two-row action bar, scaled seat rings/cards, no overflow;
  - landscape 844×390: the top and hero seats lie on their side as compact rows, the
    board drops its empty reserved height, and the action bar is a single 48px row;
  - tablet 768×1024: compact seats and a wrapped action bar with no clipped raise button.
  Verified in headless Chrome at all three sizes with the flop on screen: zero overflowing
  controls, the pot above the board and the hero above the bar.
- The dealer button and native clock stay on-screen for seats at the left edge, and the
  wager pills pull further toward the pot on narrow screens so they no longer sit under the
  nameplates.
- **Native turn clock**: the acting player now shows the clone's clock frame with its LED
  digit glyphs (hot/orange under five seconds), fed by the existing action deadline.
- The desktop hero moved up slightly so their stack plate clears the action bar.
- Full suite 155/155.

## 2026-11-12
### Table fidelity: taking the best of both
- Audited the reference clone's table view against DanGG's
  (`docs/designs/table-fidelity-audit.md`) and adopted the native pieces DanGG lacked while
  keeping DanGG's responsive ring, themes and action bar:
  - **Native chip sprites** for the pot and wagers, with denomination columns (9-chip pot,
    4-chip wager cap); the pot pile now hugs the pot label.
  - **Native dealer disc** instead of the “D” pill.
  - **Native 46-frame WIN APNG** on winners, with the final frame when animations are off.
  - **Dealer-origin board throw** and a staggered flop, replacing the uniform centre slide.
  - **Larger fanned hole cards** (58×81, 66×92 for the hero) with a phone fallback.
- Tests: added the wager cap assertion. Full suite 155/155.

## 2026-11-12
### Showdown sequencing and native reserved actions (ported from the Codex clone)
- Showdowns now present like the clone: revealed hands turn in **seat order over about two
  seconds**, then the win badge, chip flights and win sound follow instead of appearing at
  once. The plan is a pure `showdownPlan`/`showdownComplete` helper, and the reveal uses the
  clone's flip timing.
- Anticipatory **Fold / Check-Fold / Check / Call** are now the native reserved-action
  buttons, using the recovered background, box, hover, selected and check sprites with the
  same pressed/checked states. They remain one-shot and cancel when the call price changes.
  AOF-specific reserved sprites and the native clock/bet-widget artwork remain open.
- Tests: the reveal plan ordering, completion and empty cases. A headless browser run
  verifies the reserved buttons and catches the staggered showdown reveal. Full suite
  155/155.

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
