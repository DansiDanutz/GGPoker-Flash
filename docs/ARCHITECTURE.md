# Architecture

DanGG is a single Node.js process that serves the built React client, the JSON API and
the table WebSockets, backed by SQLite. A signed Electron shell and an installable PWA
reuse the same client. Production sits behind Traefik on the droplet `Dexter`.

```
Browser / installed PWA ──┐
Electron desktop shell ───┼── HTTPS + WSS ── Traefik (TLS, routing)
Other players ────────────┘                       │
                                                  ▼
                                   ┌─────────────────────────────┐
                                   │ game container (127.0.0.1:5198)
                                   │  static client  (dist/)     │
                                   │  JSON API       (/api/*)    │
                                   │  WebSocket hub  (/ws)       │
                                   │  table engine + bots        │
                                   │  SQLite (node:sqlite, WAL)  │
                                   └─────────────────────────────┘
```

## Components

### Client (`app/src`)

- **React 19 + TypeScript**, bundled by Vite. Hash routing in `App.tsx`:
  `#/`, `#/table/:id`, `#/tournaments`, `#/cashier`, `#/rewards`, `#/casino`, `#/admin`, …
- **Store** (`lib/store.tsx`) owns the session, route, toasts, lobby meta, install gate,
  first-launch state and offline-session retry. `lib/api.ts` is the typed fetch client;
  `lib/sound.ts` is the audio engine; `lib/install.ts` handles PWA install state.
- **Pages** (`pages/`) render the lobby, table, tournaments, cashier, rewards, casino,
  profile, admin console and the install / welcome / reconnect screens.
- **Game helpers** (`game/eval.ts`, `game/betting.ts`) compute hand-strength labels and
  betting presets locally; authoritative outcomes always come from the server.
- **Desktop shell** (`electron/main.cjs`) starts or attaches to the server, enforces a
  single instance, applies a strict CSP and exposes window controls through `preload.cjs`.

### Server (`app/server`)

| Module | Responsibility |
|---|---|
| `index.js` | HTTP routing, auth/session checks, origin allowlists, static hosting, WebSocket hub, table lifecycle, admin API |
| `table.js` | Table state machine: seats, blinds/antes, betting rounds, all-in and side pots, showdown, bots, timers |
| `poker.js` | Deck creation, crypto shuffle, 5/7-card evaluation, Omaha rules, Monte-Carlo equity |
| `db.js` | Schema, migrations, seed data, user/session helpers, ledger helpers |
| `security.js` | Origin/host allowlists, security headers, CSP, rate limiting helpers |
| `validate.js` | Input validation and normalisation |
| `tournament.js` | Pure multi-table seating: flights, allocation rule, canonical flight ids, chip-preserving balancing moves, table breaks |
| `tournament-room.js` | Live tournament room: owns a tournament's flight tables, seats humans across flights, assigns field-wide finish places and payouts, moves/breaks players between live tables and notifies their sockets |
| `slots.js` | Server-authoritative slot engine |
| `hand-history.js` | Hand snapshots for the history/replay view |
| `avatar.js` | PNG validation and avatar normalisation |
| `admin-platform.js` | Read-only platform report: process, sockets, live tables, tournament rooms, database/disk size (used by the admin Platform section) |
| `tournament-state.js` | Durable room snapshot save/load/delete and the settled-hand guard; the persistence boundary for the future room-owner service |
| `tournament-room-owner.js` | Owns the live room map and lifecycle (create, restart restore, snapshot scheduling, sweeps, dispose); server-specific table/DB/socket work is injected |

## Request flow

1. **Boot** — `index.js` opens SQLite (`GGPOKER_DATA`), seeds defaults when the database
   is empty, restores persistable table state, starts the HTTP server and prints
   `LISTENING <port>` (the desktop shell waits for this line).
2. **Auth** — `POST /api/auth/login` verifies a scrypt hash and creates an opaque session
   row; the client stores the bearer token in `localStorage`. `GET /api/me` restores it on
   launch (retried up to three times on network errors; a 401/403 clears it).
3. **Lobby** — `GET /api/lobby` returns tables, banners, online count, jackpot, missions
   and the `demoAccount` capability flag. The client polls meta periodically.
4. **Table** — each open table page opens `/ws?token=<bearer>` and sends `join_table`
   (the server allows several tables per socket), then receives full state snapshots on
   every change. Actions are validated server-side against the seat, turn, bet limits and
   stack.
5. **Static** — `/assets/*` resolves from `public/` then `dist/`; other paths resolve from
   `dist/`, with `index.html` as the SPA fallback. `.webmanifest` is served as
   `application/manifest+json`; `sw.js` is revalidated on every load.

## Real-time table protocol

Each table page opens a WebSocket to `/ws?token=…` and joins with `join_table` (a socket
can hold several tables). Client → server message types:

| Type | Purpose |
|---|---|
| `join_table` | Take or observe a seat (`observe: true` is read-only: no seat, no bots, no hand start) |
| `action` | `fold`, `check`, `call`, `raise` (to amount), `allin` |
| `sit_out` | Leave the hand rotation and return |
| `rebuy` | Add chips between hands |
| `timebank` | Spend the once-per-hand time bank |
| `rabbit` | Reveal undealt board cards after a fold-out |
| `show_cards` | After the hand, reveal the listed hole-card indices (`cards: number[]`) to the table |
| `option` | Table options (run it twice, auto-muck, straddle, insurance); seat required |
| `chat`, `emote` | Table chat and reactions (moderation enforced) |
| `ping` | Latency/liveness |

Server → client: a `state` snapshot (players, stacks, bets, board, pot, actor, action
deadline, result) plus event frames that drive sounds, animations and overlays, including
`rebuy_offer` when a cash-table bust opens the reload window and `cards_shown` when a
player reveals hole cards. Player snapshots carry a public `shown` index list, so a partial
reveal renders one real card and one face-down slot. Every
state change is pushed; the client never guesses outcomes.

## Multi-table tournaments

A running tournament is owned by a `TournamentRoom` (`tournament-room.js`), one per event,
holding the shared tournament descriptor (prize pool, level, blind clock, mode) and the
list of flight tables:

- **Table ids** — flight 1 keeps the legacy `tourney-<id>`; flight *n* is
  `tourney-<id>-<n-1>` (`flightTableId`), so old links and the unregistration check keep
  working. The flight cap is `MAX_FLIGHTS` (24).
- **Seating** — `/api/tournaments/:id/play` asks the room; `nextFlightIndex` fills the
  lowest-numbered flight with human room and only opens the next one when every flight is
  full. Flights stay full of bots; a bot is evicted when a human arrives.
- **Places** — eliminations are recorded field-wide by the room, not per table, so a
  twenty-player event pays 20th … 1st. Payout shares are 50 / 30 / 20 % for 1st–3rd;
  satellites pay a ticket instead. The last player standing is only crowned when every
  flight is between hands (an all-in player with nothing behind is still alive).
- **Sweep** — a 2 s loop balances flights whose sizes differ by two and breaks tables
  under three players. Players in a running hand are never moved, and a table only closes
  once every player found a seat elsewhere.
- **Client contract** — a moved player's sockets receive `table_move`
  (`tableId`, `from`, `reason` = `balance` | `break`, `index`, `stack`); the table page
  navigates to the new table with `?buyin=<stack>`. `table_break` informs observers. A
  stale flight link is answered with a `table_move` redirect to the player's real table.
- **Spectating** — `GET /api/tournaments/:id/watch` returns the busiest live flight
  (`tableId`, `tableIndex`, `tables`, `playersLeft`) so a watcher can open it with
  `?observe=1`; when that table breaks, the watcher re-resolves the same endpoint and
  follows the field.

## Tournament runtime and the player connection path

```
 Lobby / Tournaments page
   ├─ POST /api/tournaments/:id/play ──► TournamentRoom.seat(player)
   │                                      ├─ nextFlightIndex / ensureFlight
   │                                      └─ Table in LIVE_TABLES
   └─ WSS /ws (tableId) ───────────────► live Table: seats, hand clock, actions
                                           │ bust / winner
                                           ▼
                                        TournamentRoom.onBust / onFlightSettled
                                           │ 2 s sweep (balance / break)
                                           ▼
                                        table_move → player sockets
```

- **One process owns both planes.** `index.js` serves HTTP, the static client and the
  `/ws` hub; `LIVE_TABLES` maps table ids to live tables and `TOURNAMENT_ROOMS` maps
  tournament ids to rooms. A tournament's flights are ordinary tables whose `cfg` shares
  one tournament descriptor (blind clock, level, prize pool).
- **Tournament entry** goes through `/api/tournaments/:id/play`; the room seats the human
  in the lowest-numbered flight, evicts a bot if needed and returns the table id. The
  client then opens `/ws` for that table (or follows a `table_move` after balancing).
- **Blind clock** is shared by every flight: the first table to tick advances
  `tournament.level` and each flight recalculates its blinds from `baseSb`/`baseBb`
  (`1.5^(level-1)`). `TournamentRoom.syncLevel` catches a late first flight up.
- **Reconnect** reuses the same table id; a player whose table broke receives
  `table_move` and navigates with `?buyin=<stack>`. A stale flight link is redirected to
  the player's real table.
- **Restart recovery** — running rooms snapshot their flights, seats, stacks, blind clock,
  finished places and winner to `tourney_state` after every settled hand, after
  start/seating and balance/break moves, every 15 s and on graceful shutdown. The server
  restores every `running` event before accepting connections, so a restart keeps the field,
  stacks and level; `/play` returns the original table. A hand that was in progress at the
  crash is voided (the last settled snapshot is restored), not replayed. Rooms are
  snapshotted **before** the shutdown closes live tables; otherwise the snapshot would be
  empty. This removes the old "rooms re-created empty after a restart" limitation; a hard
  crash can still lose the current hand and up to ~15 s of out-of-hand changes.

## Platform administration and observability

The owner console (`#/admin`) has a **Platform** section backed by two admin-only,
read-only endpoints:

| Endpoint | Returns |
|---|---|
| `GET /api/admin/platform` | server version/build, Node/PID/uptime/environment, RSS/heap, CPU count/load, disk free/total/used %, WebSocket clients and distinct users, live tables/seats/connections, tournament rooms/players/flights plus each room's recovery snapshot (`snapshot`/`restoredAt`), SQLite size/WAL and row counts |
| `GET /api/admin/tournaments/live` | the same tournament-room list alone (name, level, current blinds, next level ETA, players left/humans, flights, finishes, winner) |

The UI refreshes every 10 s and can download the report as JSON for an incident. The
tournament table also shows each room's **Recovery** state: the last settled-hand snapshot
(time and size), whether this process restored the room after a restart, and a red **stale**
marker (plus `tournaments.stale` and a banner) when a room with players has had no snapshot
for five minutes. Empty rooms are not flagged.

Two admin actions can force a recovery snapshot: `POST /api/admin/tournaments/:id/snapshot`
for one room and `POST /api/admin/tournaments/snapshot-all` for every running room (the
Platform has **Snapshot** per row and **Snapshot all** in the header). Both are audited and
skip a room with a hand in progress or a finished room rather than writing an inconsistent
state. Snapshot persistence lives in `tournament-state.js`, separate from `index.js`, so the
room-owner boundary can move behind a dedicated service without rewriting the admin API.

`TournamentRoomOwner` now owns the live room map and lifecycle (construction, restore,
snapshot scheduling, sweep, dispose). `index.js` injects `makeRoom` and the snapshot
callbacks, so moving room ownership into a dedicated process is an implementation change
behind that boundary rather than a client/admin-API rewrite.

Admins can also advance the shared blind level with
`POST /api/admin/tournaments/:id/level` (**Level +1**, with a confirmation). It is audited,
refuses a hand in progress or a finished room, resets `levelStartedAt`, applies the new
blinds to every flight and then writes a recovery snapshot. The
report is assembled only from the running process (`process.memoryUsage`, `wss.clients`,
`LIVE_TABLES`, `TOURNAMENT_ROOMS`, `fs.statSync`) — it adds no new state and performs no
mutations. Tournament levels are read through `TournamentRoom.syncLevel(now)`, so the
report reflects the same shared clock the tables use.

Access is the existing admin boundary: `/api/admin` is restricted by the
`GGPOKER_ADMIN_ALLOW` network allowlist, requires an `is_admin` account, and admin actions
are audited. The platform report itself is read-only.

### REA inventory

The server module graph was inventoried with **REA** (`morluto/rea`, the MCP server in
this session) on 2026-11-12: `analyze_javascript_application` on `app/server` examined
62 files / 711 items (evidence `ev_21df2f40033fbc25eba5628f75bed6ec6e02764f158b7154857a2141ee001803`,
summary view `ev_4a1b9723…`). The graph is static and partial (semantic-node ceiling,
8,801 residual unknowns); it was used to map module boundaries and confirm the
admin/tournament HTTP surface, not as a runtime monitor. Live values in the Platform
section come from the server's own process state and the database.

A runtime REA observation of the test admin console (`docs/REA-ADMIN-VERIFICATION.md`)
confirmed the rendered Platform controls, the recovery/snapshot/level actions and the
`GET /api/admin/platform` call, with attach-window-only limitations; it did not capture
credentials, bodies, headers or storage values.

A second REA run inspected a production `VACUUM INTO` snapshot with
`inspect_sqlite_database` (evidence `ev_3ddc2239…`, authority shipped-artifact, confidence
observed): it confirmed the `tourney_state` schema (`tournament_id` primary key, non-null
`state`, `updated_at` default `datetime('now')`) and sampled three rows whose JSON carries
`version`, `savedAt`, `level`, `levelStartedAt`, `entrants`, `winner`, `finished` and
`flights`. The sample is bounded and the inspection is not an integrity or atomicity proof;
it verifies the recovery table the admin report reads, not the whole database.

### Public health

`GET /healthz` is intentionally small and non-sensitive: service identity, version/build,
uptime, `rooms: {total, stale}` and `disk: {usedPct, freeBytes}`, plus a `warnings` array
(`N stale tournament room(s)`, `disk N% used` at ≥90%). The external Nano watchdog polls
it and alerts on HTTP state changes and warning-text changes; it is not a substitute for the
admin Platform's process/DB detail.

## Capacity and scaling

Today production is one game container on `Dexter` (SQLite WAL, in-memory tables/rooms,
Traefik in front). This is sufficient for the play-money load but has a single
failure/scale unit:

- **Disk headroom** — every deploy adds a `dangro-game:rollback-*` image and the build cache
  grows; `deploy/prune-docker.sh` keeps the newest three rollbacks and prunes the cache on a
  weekly Monday cron, and the Platform section shows disk free/used %. A full disk makes
  `docker compose build` fail while the previous container keeps serving.
- **Vertical first** — the container can use the droplet's CPU/RAM; the keepalive script
  restarts a hung process; nightly backups and off-host pulls cover data loss.
- **Horizontal scale is not implemented** — tables, tournament rooms and WebSocket
  fan-out are process-local. Running two containers would split rooms and require sticky
  WebSocket routing plus shared state (rooms, queues, table ownership). The Platform
  report is per-process, so a future multi-process deployment needs an aggregator.
- **Tournament service separation** — the recommended next architectural move if
  tournament load grows: extract `TournamentRoom` + table engine behind a room-owner
  service with durable room state, while `index.js` keeps HTTP auth/lobby and proxies WS.
  The current module boundary (`tournament-room.js` + `ops` interface) already isolates
  the seating/sweep logic for that move.

## Data model

SQLite in WAL mode (`node:sqlite`). Main tables:

- **Accounts** — `users`, `sessions`, `user_settings`, `verifications`, `player_notes`,
  `friends`, `friend_requests`, `reports`, `table_mutes`, `notification_reads`.
- **Game** — `tables`, `hands`, `tournaments`, `tourney_regs`, `tourney_state` (restart
  snapshots of running tournament rooms), `elo_ratings`, `elo_history`.
- **Economy** — `transactions` (ledger), `bonus_claims`, `daily_claims`, `player_claims`,
  `missions`.
- **Content** — `banners`, `brand_assets`, `chat_messages`, `direct_messages`, `settings`,
  `audit_log`.

**Ledger invariant:** every balance change is written inside a SQLite transaction through
`addTransaction`/`addTransactionEx`; the ledger row and the balance move together. Cash
pots are raked; tournament and Spin & Gold pots are not. Play money has no cash value.

## In-game rules enforced by the engine

- Action starts left of the big blind pre-flop; post-flop action starts left of the button.
- Uncalled bets are returned; hands that end before the flop are not raked.
- A short all-in does not reopen betting for players who already acted.
- Short Deck ranks a flush above a full house and counts A-6-7-8-9 as a straight.
- PLO is pot-limit; PLO5/PLO6 use the 2+3 rule (two hole cards + three board cards).
- All-in or Fold is shove-or-fold, with no post-flop decisions for the shover.
- A dropped connection keeps the seat for `GGPOKER_DISCONNECT_GRACE_MS` (60s by default);
  quitting the desktop app cashes every seat out at its real stack.

## Client delivery modes

- **Browser** — the built client from `dist/`, served by the game server.
- **Installed PWA** — manifest (`display: standalone`), service worker, safe-area insets,
  install screen after phone sign-up, one-time welcome on first standalone launch.
  Navigation is network-first (a deploy lands on the next launch); hashed assets are
  cache-first; `/api` and `/ws` are never cached; old caches are dropped on activation.
- **Desktop** — Electron loads the local server (or `GGPOKER_SERVER_URL` for remote mode),
  enforces a single instance and injects a strict CSP.

## Security boundaries

- Passwords: scrypt with per-user salt; constant-time comparison.
- Sessions: opaque tokens in SQLite; logout, password change and per-device revoke.
- HTTP: host/origin allowlists, security headers, CSP for HTML, body-size caps, rate
  limiting on auth and sensitive endpoints.
- Admin: `GGPOKER_ADMIN_ALLOW` CIDR allowlist (loopback/tunnel by default); admin password
  required to be ≥16 characters in production; admin actions are audited.
- Assets: extracted third-party art/audio stay out of the public repository; the build
  falls back to CSS placeholders when they are absent.

## Failure modes and operations

- **Process crash / OOM** — Docker `restart: unless-stopped`, Docker enabled at boot.
- **Hung event loop** — `deploy/keepalive.sh` probes `/healthz` every 2 minutes and
  restarts the game service with a 5-minute cooldown.
- **Data loss** — nightly `VACUUM INTO` snapshot on the host, pulled to Nano, 14/30-day
  retention.
- **Host loss** — off-host backups plus external uptime checks from Nano.
- **TLS expiry** — Traefik renews Let's Encrypt certificates automatically.
- **Client offline** — the installed app shows a retry screen and keeps the session; the
  service worker serves the shell offline.

See [`deploy/ALWAYS-ON.md`](../deploy/ALWAYS-ON.md) for the operations runbook.
