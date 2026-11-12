# Release notes and checklist

Play-money only. Server-authoritative. No real-money flows.

## Artifacts

| Artifact | Where |
|---|---|
| Web client + API/WS | `app/dist` served by `app/server/index.js` on `:5198` |
| Desktop app | `~/Applications/DanGG.app` (built/signed by `./package_app.sh`) |
| Phone app | Installable PWA from the same client (`manifest.webmanifest` + `sw.js`) |
| Production stack | `deploy/` (Docker Compose + Traefik), live at https://dangg.live |

## Commands

```bash
cd app
pnpm test                 # node --test server/*.test.js — 150 tests
pnpm exec tsc --noEmit -p tsconfig.json
pnpm build                # → app/dist
pnpm smoke                # read-only API smoke against a running server
./package_app.sh          # build, sign, relaunch the desktop app (from repo root)
```

## Accounts

Local/development (seeded unless `GGPOKER_SEED_DEMO=0`):

- `DansiDanutz` / `ggpoker` — demo player
- `admin` / `admin123` — admin console
- `guest` / `guest` — guest account

Production (`NODE_ENV=production`, `GGPOKER_SEED_DEMO=0`): no demo/guest rows. Players
create an account from the login screen; the welcome bonus is credited automatically.
The admin password comes from `GGPOKER_ADMIN_PASSWORD` and admin is reachable only through
the allowlisted loopback/SSH tunnel.

## Verified before a release

- `pnpm test` — 150/150.
- `pnpm exec tsc --noEmit` and `pnpm build` (also enforced by CI on every PR).
- Login → lobby → table join → first hand → fold/call/raise on desktop 1200×957 and phone
  390×844.
- Phone: sign-up → Download App screen (Android prompt / iOS Add to Home Screen);
  installed launch restores the session; offline launch shows the retry screen.
- Lobby list scrolls at 360×640, 390×844, 820×1180, 844×390 (landscape) and desktop.
- `/healthz` 200 after deployment; service worker active and manifest installable on the
  production origin.
- Desktop app rebuilt after UI changes (`./package_app.sh`) — the packaged shell does not
  pick up web changes by itself.

## Major surfaces

Poker lobby, Rush & Cash, cash tables, private tables, bomb pots, tournaments, private
tournaments, Spin & Gold, Mystery Battle Royale, slots, roulette, blackjack, baccarat,
Dragon Tiger, Sic Bo, Crash, Prop Bet, cashier, rewards/missions/GGPass/Fish Buffet/Ocean
Rewards/GG Care/Honeymoon, leaderboards, per-variant ELO, hand history, profile, social,
direct messages with live push, friend requests, notifications, player reports with hand
evidence, identity verification, admin console, owner moderation, install/first-launch
screens, offline retry.

## Remaining / known gaps

- Multi-table tournaments are live (flights, field-wide places and payouts, balancing and
  breaks, `table_move`/`table_break`). Still open: seating absent registrants at the
  scheduled start, payouts beyond the top three places, and a long bot-play soak test.
- Spectating is read-only (lobby **Watch**, tournament **Watch live**); native spectator
  counts and observer-chat rules are not evidenced.
- KKPoker-specific parity was not verified (client not installed/exposed).
- Complete native background catalogue.
- SQLite is a single writer — move to managed PostgreSQL/Redis before a 1,000-concurrent
  target (see `deploy/SCALE-PLAN.md`).
- Some clone-specific labels outside the original string table remain English in
  non-Romanian locales.
