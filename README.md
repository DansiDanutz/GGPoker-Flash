# DanGG

**Play-money poker room — live at [dangg.live](https://dangg.live).**

DanGG is a working, server-authoritative poker room rebuilt from the GGPoker desktop
client's artwork, fonts, sounds and interaction design: a React 19 + TypeScript client,
a Node.js/SQLite game server, real-time WebSocket tables, a signed Electron desktop
shell, and an installable phone app (PWA) for Android and iPhone.

[![CI](https://github.com/DansiDanutz/GGPoker-Flash/actions/workflows/ci.yml/badge.svg)](https://github.com/DansiDanutz/GGPoker-Flash/actions/workflows/ci.yml)

> **Play money only.** No real-money deposits, withdrawals or cash value. Not affiliated
> with GGPoker. Original artwork/audio remain the property of their owners and were
> extracted from a locally installed client for reverse-engineering and interoperability
> purposes; they are not redistributed in this repository.

---

## Contents

- [Live service](#live-service)
- [Quick start](#quick-start)
- [Accounts and access](#accounts-and-access)
- [Feature tour](#feature-tour)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Development](#development)
- [CI and release flow](#ci-and-release-flow)
- [Deployment and operations](#deployment-and-operations)
- [Security model](#security-model)
- [Reverse engineering](#reverse-engineering)
- [Documentation index](#documentation-index)
- [Scope and limitations](#scope-and-limitations)

---

## Live service

| | |
|---|---|
| **Site** | https://dangg.live (and https://www.dangg.live) |
| **Health** | `GET https://dangg.live/healthz` → `{"ok":true,…}` |
| **Host** | DigitalOcean droplet **Dexter** (`46.101.219.116`), 2 vCPU / 8 GB, Frankfurt |
| **Runtime** | Docker Compose project `dangro` → `dangro-game-1`, bound to `127.0.0.1:5198` |
| **TLS / edge** | Shared Traefik v3 on the host, Let's Encrypt certificates, HTTP→HTTPS redirect |
| **Data** | SQLite on the `dangro_game-data` volume |
| **Admin** | Private SSH tunnel only: `ssh -N -L 5198:127.0.0.1:5198 dexter`, then http://127.0.0.1:5198 |
| **Always-on** | Container restart policy, boot-time Docker, `/healthz` watchdog (cron, 2 min), nightly SQLite backup, off-host copies on Nano |

Operational detail lives in [`deploy/README.md`](deploy/README.md),
[`deploy/ALWAYS-ON.md`](deploy/ALWAYS-ON.md), [`deploy/DNS.md`](deploy/DNS.md) and
[`deploy/MONITORING.md`](deploy/MONITORING.md).

The public repository ships **source code and tooling only**. Extracted GGPoker art,
sounds and fonts are generated locally with `tools/setup_assets.sh` and are not published.

---

## Quick start

Requirements: **Node 26**, **pnpm 10.32+**. Everything else is installed by pnpm.

### Web client + game server (development)

```bash
cd app
pnpm install
pnpm dev            # Vite on :5199, API + WebSocket on :5198
```

Open http://localhost:5199. The Vite dev server proxies `/api` and `/ws` to the game
server, and the service worker is not registered in dev.

```bash
pnpm build          # production bundle → app/dist
pnpm start          # serve app/dist + API on :5198
pnpm test           # server suite (106 tests)
pnpm smoke          # read-only smoke test against a running server
```

### Desktop app (Electron)

```bash
./package_app.sh    # build, package, sign and relaunch ~/Applications/DanGG.app
```

The app starts its own local server on `127.0.0.1:5198` and opens a frameless,
resizable window (default 1200×961, minimum 360×640) with the same client. It is
signed with a Developer ID identity (ad-hoc fallback if unavailable).

`GGPOKER_SERVER_URL=https://dangg.live` makes the desktop shell load the live server
instead of starting a local one; admin access stays on the private tunnel.

### Phone app (installable PWA)

A new account created **on a phone** lands on the **Download App** step instead of the
lobby:

- **Android / Chrome** — *Download App* opens Chrome's native install prompt. If the
  prompt is unavailable (other browser, dismissed, no service worker yet) the screen
  shows the manual path: **⋮ → Install app / Add to Home screen**.
- **iPhone / iPad** — Safari has no install API, so *Download App* reveals
  **Share → Add to Home Screen** and a confirmation button.
- **Continue in browser** is always available and remembered; desktop sign-ups skip the
  step, and launching from the home-screen icon skips it too.

The installable shell is `app/public/manifest.webmanifest`, `app/public/sw.js` and the
icons in `app/public/pwa/`. The service worker registers only in production builds,
never caches `/api` or `/ws`, and drops old hashed assets on activation.

**Installed-app first launch:** opening from the home-screen icon restores the saved
session straight into the lobby (one-time welcome sheet), insets the layout by the
device safe areas, and shows a retry screen — not a logout — when the server is
unreachable.

---

## Accounts and access

Local/development installs seed demo accounts (production does not — see below):

| Account | Password | Notes |
|---|---|---|
| `DansiDanutz` | `ggpoker` | demo player, $10,000 play balance, VIP 5 — shown by *Use demo account* |
| `admin` | `admin123` | full admin console (`#/admin`) |
| `guest` | `guest` | guest account |

**Production:** `GGPOKER_SEED_DEMO=0` and `NODE_ENV=production` mean no demo or guest
rows are created; the login screen only offers **Create account** and **Play as guest**
(browse/spectate). New accounts receive the welcome bonus automatically. The admin
password comes from `GGPOKER_ADMIN_PASSWORD` (minimum 16 characters, required on first
production start); only allowlisted loopback/tunnel addresses may reach the admin API.

---

## Feature tour

### Lobby
- Frameless macOS window with the client's title bar, traffic lights, online counter and
  icon strip.
- Original POKER / TOURNAMENTS / SLOTS / CASINO header pills and Bad Beat Jackpot ticker.
- Game tabs built from the client's tab artwork: **Home, All-in or Fold, Rush & Cash,
  Hold'em, PLO/PLO5/PLO6, Short Deck, Spin & Gold, Mystery Battle Royale**.
- Promotional carousel (Flipout banner), live lobby chat, notifications, guest browsing.
- Cash-game table list with stake/seat/speed filters, search, favourites, sortable
  columns, animated mini-table preview, buy-in range, Join/Open, Table View / Group View.
- On phones the list scrolls with momentum and a single tap opens the buy-in sheet.

### Poker tables
- Server-authoritative No-Limit Hold'em engine: blinds, antes, betting rounds, min-raise
  rules, all-in and side pots, showdown, split pots, hand evaluation, dealer button,
  turn timers and time banks.
- Variants: **Hold'em, PLO/PLO5/PLO6 (2+3 rule), Short Deck (36 cards), All-in or Fold,
  Rush & Cash, Spin & Gold SNG, Mystery Battle Royale**.
- Bot opponents with Monte-Carlo equity fill empty seats; stacks persist across hands.
- Buy-in modal (min/max, percentage presets, seat choice), cash-out on leave, rebuy and
  auto-rebuy, spectating, private tables and bomb pots (admin/host options).
- Rake (5%, capped) on cash pots; tournaments and Spin & Gold are rake-free.
- Player notes, friends list, four-colour deck, animations, all-in flash, hand-strength
  label, win overlay, chip/card animations, rabbit hunt, sit-out, table chat and emotes,
  hand-history link, ten table themes.
- Multiple humans can join the same table from different devices; bots fill the rest.

### Tournaments
- Seeded tournament list with buy-in, guaranteed prize pool, entrants, status and filters.
- Detail view with overview, blind structure and prize table; registration/unregistration
  debits and refunds through the ledger.
- Playable events: 6-max tables, starting stack, blind levels on a real clock, late
  registration, eliminations, top-3 payouts and a winner presentation.
- A pure multi-table seating engine (`app/server/tournament.js`) plans flights, balancing
  moves and table breaks with chip conservation; the live scheduler/table-break wiring is
  the remaining step.
- Private host tournaments with invite links; Spin & Gold with a prize wheel.

### Casino and slots
- Slots (5×3, 10 paylines, server-authoritative payouts), roulette (single-zero, full bet
  set), blackjack (3:2, hidden dealer card), baccarat, Dragon Tiger, Sic Bo, Crash and
  Prop Bet markets with server-side settlement.

### Cashier, rewards and profile
- USD / P$ / T$ / Gem balances, deposit/withdraw, payment methods, full transaction
  ledger and bonus offers.
- Daily freebie, GGPass, 10-step reward track, daily missions, Fish Buffet wheel,
  leaderboards, VIP benefits, Ocean Rewards gem store, GG Care, Honeymoon.
- Hand history with filters and replay, My Page hub, profile stats, avatar picker,
  nickname change, security settings, responsible-gaming limits.
- Identity verification submission and review.

### Settings
Language (20 locales), sound channels and volume, animations, run-it-twice, auto-muck,
four-colour deck, time bank, table themes, card backs/fronts and room backgrounds,
betting shortcuts, stack display, auto top-up, hotkeys and password/session management.

### Admin console (`#/admin`)
Dashboard (users, hands, tables, tournaments, live tables, turnover, jackpot, online,
recent transactions), user management (balances, credit/debit, ban, reset password,
delete), cash-table and tournament editors, promotions/banners, missions, game settings,
branding uploads, verification review, CSV exports, transaction ledger, audit log and
lobby announcements.

---

## Architecture

```
Browser / installed PWA ──┐
Desktop shell (Electron) ─┼── HTTPS/WSS ── Traefik ── game container (:5198)
Other players ────────────┘                           │
                                                      ├─ HTTP API (JSON)
                                                      ├─ WebSocket rooms per table
                                                      └─ SQLite (node:sqlite)
```

- **Client** — React 19 + TypeScript, Vite build, hash-based router in `src/App.tsx`.
  The app store (`src/lib/store.tsx`) owns session, route, toasts, install state and the
  first-launch gate; pages under `src/pages/` cover lobby, tables, tournaments, cashier,
  rewards, casino, profile, admin and the install/welcome/reconnect screens.
- **Server** — `app/server/index.js` is the HTTP API, WebSocket hub, static host and
  game supervisor; `table.js` is the table state machine; `poker.js` handles decks,
  shuffles and hand evaluation; `db.js` owns the SQLite schema, seeding, sessions and
  ledger; `security.js`/`validate.js` handle origin checks and input validation.
- **Realtime** — each open table page opens a WebSocket to `/ws?token=…` and sends
  `join_table`; the server can carry several tables on one socket. Clients send
  `action`, `chat`, `emote`, `option`, `rebuy`, `sit_out`, `rabbit`, `timebank` and
  `ping`; the server pushes every state change, and the client turns events into sounds
  and animations.
- **Persistence** — SQLite in WAL mode. Tables include `users`, `sessions`, `tables`,
  `hands`, `transactions`, `tournaments`, `tourney_regs`, `missions`, `banners`,
  `settings`, `audit_log`, `chat_messages`, `direct_messages`, `friends`,
  `friend_requests`, `player_notes`, `elo_ratings`, `elo_history`, `reports`,
  `verifications`, `brand_assets`, `bonus_claims`, `daily_claims`, `player_claims`,
  `table_mutes`, `notification_reads`, `user_settings`.
- **Money** — every balance change goes through the ledger helpers inside a SQLite
  transaction; cash-game pots are raked, tournament pots are not. Play money has no
  cash value.
- **Desktop** — `app/electron/main.cjs` supervises the local server, enforces a single
  instance and applies a strict CSP; `preload.cjs` bridges window controls. The packaged
  app is `~/Applications/DanGG.app`.
- **Phone** — a PWA shell (manifest + service worker + safe-area handling) that installs
  from the same client. Navigation is network-first, hashed assets cache-first, API and
  WebSocket traffic never cached.
- **Edge** — Traefik terminates TLS and routes `dangg.live`/`www.dangg.live` to the
  loopback-bound container. A watchdog restarts a hung container; backups run nightly on
  the host and are pulled to a second droplet.

Deeper detail — request flow, data model, table protocol, invariants and failure modes —
is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Repository layout

```
app/
  src/                 React client (pages, components, store, API, game helpers)
  server/              HTTP API, WebSocket hub, table engine, SQLite, tests
  electron/            Desktop shell (main/preload) and CSP
  public/              Brand assets, manifest, service worker, PWA icons, ruffle
  dist/                Production client build (generated)
deploy/                Docker Compose, Traefik/Caddy notes, DNS, backups, watchdog
docs/                  Architecture, CI, releases, designs, audits, reviews
research/              Reverse-engineering evidence and decoded client assets (local)
tools/                 Asset extraction, ATF decoding, UI automation and packaging
package_app.sh         Build, sign and relaunch the desktop app
```

---

## Development

```bash
cd app
pnpm install         # dependencies
pnpm dev             # Vite + API/WebSocket
pnpm test            # node --test server/*.test.js (106 tests)
pnpm exec tsc --noEmit -p tsconfig.json
pnpm build           # production client
pnpm smoke           # read-only API smoke test (needs a running server)
```

Useful environment variables:

| Variable | Purpose |
|---|---|
| `PORT` | Game server port (default 5198) |
| `GGPOKER_DATA` | SQLite/data directory |
| `GGPOKER_DEV` | Development mode (allows Vite origin) |
| `GGPOKER_SEED_DEMO` | Seed demo/guest accounts (on unless `0`; always off in production) |
| `GGPOKER_ADMIN_PASSWORD` | Admin password (≥16 chars in production) |
| `GGPOKER_ADMIN_ALLOW` | CIDR allowlist for admin endpoints |
| `GGPOKER_PUBLIC_ORIGIN` / `GGPOKER_ALLOWED_HOSTS` | Origin/host allowlists |
| `GGPOKER_BIND` | Bind address (default `127.0.0.1`) |
| `GGPOKER_DISCONNECT_GRACE_MS` | Seat hold after a dropped connection |
| `GGPOKER_TRUST_PROXY` | Trust proxy headers behind Traefik/Caddy |
| `GGPOKER_SERVER_URL` | Desktop shell: use a remote server instead of starting one |

Desktop development: `pnpm dev` plus `GGPOKER_DEV=1 pnpm desktop:dev`.

---

## CI and release flow

Every push to `main` and every pull request runs the **CI** workflow
(`.github/workflows/ci.yml`):

| Job | What it runs |
|---|---|
| **Server tests** | `node --test server/*.test.js` (106 tests) |
| **Typecheck and build** | `tsc --noEmit`, then `vite build` |

`main` is protected by the `protect-main` ruleset: both checks are required, force-pushes
and branch deletion are refused. Changes land through a pull request
(`git switch -c …`, push, `gh pr create`, `gh pr checks --watch`, `gh pr merge --squash`).
Full detail: [`docs/CI.md`](docs/CI.md).

Recent history is recorded in [`CHANGELOG.md`](CHANGELOG.md).

---

## Deployment and operations

Production is the Docker Compose stack in [`deploy/`](deploy/):

```bash
# on Dexter, from ~/dangro/deploy
cp .env.example .env       # DOMAIN, GGPOKER_PUBLIC_ORIGIN, admin allowlist/password
docker compose build game
docker compose up -d game
curl -fsS https://dangg.live/healthz
```

- `game` runs the production image (Node 26, pnpm build → `dist`, server + SQLite) bound
  to `127.0.0.1:5198`; Traefik owns 80/443 and routes the domain.
- The official extracted assets are gitignored; sync `app/public/` from the Mac before a
  fresh build (or the app falls back to CSS/brand placeholders).
- Backups: nightly `VACUUM INTO` via `deploy/backup.sh`, pulled off-host to Nano.
- Always-on: restart policy + boot-time Docker, `/healthz` watchdog every 2 minutes with
  a 5-minute cooldown, external uptime checks from Nano, Let's Encrypt auto-renewal.
- Roll back by redeploying the previous image or restoring the latest verified backup;
  keep the failed database for analysis.

See [`deploy/README.md`](deploy/README.md), [`deploy/ALWAYS-ON.md`](deploy/ALWAYS-ON.md),
[`deploy/DNS.md`](deploy/DNS.md) and [`deploy/MONITORING.md`](deploy/MONITORING.md).
Scale planning lives in [`deploy/SCALE-PLAN.md`](deploy/SCALE-PLAN.md).

---

## Security model

- Passwords hashed with **scrypt** (per-user salt); sessions are opaque bearer tokens
  stored in SQLite with per-device revoke and password-change invalidation.
- Origin and host allowlists on every request; strict security headers and a CSP for
  HTML; request-body size caps; rate limiting on auth and sensitive endpoints.
- Admin API restricted to an allowlist (loopback/tunnel by default); no public admin
  hostname.
- Server-authoritative game outcomes; the client never sets balances, cards or winners.
- No real-money payment processing, KYC or cash value — identity verification is a
  play-money demo surface only.
- Extracted third-party art/audio stay out of the public repository.

---

## Reverse engineering

The installed client is an **Adobe AIR/Flash application**:

- `/Applications/GGPoker.app` is a thin NCF launcher; the real client lives in
  `~/Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/` (`Loader/GGPoker.app`
  and `Game/51/IronDesktop.swf`, AIR SDK 51).
- `string_table.json` provides 11,632 localised UI keys; `Game/assets/` ships ~1.4 GB of
  PNGs/atlases, MP3s, Spine animations and bitmap fonts.
- The SWF was decompiled with **JPEXS FFDec 26.4** into 8,694 ActionScript classes.
- Sprite atlases were sliced with the TexturePacker JSON; Stage3D **ATF** textures were
  decoded with a custom DXT5 decoder (`tools/atf_decode.py`).
- The client's Roboto / Roboto Condensed fonts and 73 table/lobby sounds were exported.

The evidence trail, file inventory and commands are in
[`research/REVERSE_ENGINEERING.md`](research/REVERSE_ENGINEERING.md). Reproduce assets
locally with `bash tools/setup_assets.sh`.

---

## Documentation index

| Document | What it covers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Components, request flow, data model, table protocol |
| [`docs/CI.md`](docs/CI.md) | CI workflow, required checks, branch protection, PR flow |
| [`docs/RELEASE.md`](docs/RELEASE.md) | Release checklist, verified surfaces, known gaps |
| [`CHANGELOG.md`](CHANGELOG.md) | Dated history of shipped work |
| [`deploy/README.md`](deploy/README.md) | Production deployment and rollback |
| [`deploy/ALWAYS-ON.md`](deploy/ALWAYS-ON.md) | Restart policy, watchdog, backups, uptime checks |
| [`deploy/DNS.md`](deploy/DNS.md) | DNS records, TLS, Traefik routing |
| [`deploy/MONITORING.md`](deploy/MONITORING.md) | Monitoring checklist and incident rules |
| [`deploy/SCALE-PLAN.md`](deploy/SCALE-PLAN.md) | Capacity planning beyond one SQLite writer |
| [`docs/designs/`](docs/designs/) | Design-of-record, parity backlog, reviews |
| [`docs/audits/`](docs/audits/) | 2026-11-11 full client audit |

---

## Scope and limitations

- Faithful **functional** clone: layout, art, audio, tab structure, game flow and
  interactions are reconstructed from the shipped client; server-driven content (player
  counts, promotion copy, schedules) is seeded and editable in the admin console.
- Bots are intentionally imperfect and play for play chips only.
- No real-money payments, KYC or account connectivity; play money has no cash value.
- Multi-table tournament flights/balancing: the seating/balancing engine is implemented and
  tested, but the live scheduler and table-break orchestration are not wired yet. The
  native background catalogue is not complete.
- SQLite is a single writer: suitable for a small play-money launch, not thousands of
  concurrent players (see the scale plan).

## License

[MIT](LICENSE). Third-party artwork, audio and trademarks remain the property of their
owners and are not included in this repository.
