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
| `option` | Table options (run it twice, auto-muck, straddle, insurance); seat required |
| `chat`, `emote` | Table chat and reactions (moderation enforced) |
| `ping` | Latency/liveness |

Server → client: a `state` snapshot (players, stacks, bets, board, pot, actor, action
deadline, result) plus event frames that drive sounds, animations and overlays, including
`rebuy_offer` when a cash-table bust opens the reload window. Every
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

## Data model

SQLite in WAL mode (`node:sqlite`). Main tables:

- **Accounts** — `users`, `sessions`, `user_settings`, `verifications`, `player_notes`,
  `friends`, `friend_requests`, `reports`, `table_mutes`, `notification_reads`.
- **Game** — `tables`, `hands`, `tournaments`, `tourney_regs`, `elo_ratings`, `elo_history`.
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
