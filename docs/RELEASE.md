# DanGG.ro clone — release notes

Local, play-money-only desktop clone. Server-authoritative; no real-money flows.

## Run

- App: `~/Applications/DanGG.ro.app`
- Local API/UI: `http://127.0.0.1:5198`
- Tests: `cd app && pnpm test`
- Read-only smoke: `cd app && pnpm smoke`
- Build: `cd app && pnpm build`
- Package/sign: `./package_app.sh`

## Accounts

- `DansiDanutz` / `ggpoker`
- `admin` / `admin123`
- `guest` / not available

## Verified

- 46/46 node tests.
- Signed app with Developer ID (or ad-hoc fallback).
- API lobby 200.
- Desktop 1200×957 and mobile 390×844 acceptance screenshots.
- No page errors during lobby → ELO → My Page navigation.

## Major surfaces

Poker lobby, Rush & Cash, cash tables, private tables, bomb pot, tournaments,
private tournaments, Spin & Gold, Battle Royale, slots, casino, rewards,
missions, cashier with filters/CSV, leaderboards, per-variant ELO, Crash,
hand history, profile, social, DMs with live push, friend requests, notifications,
player reports with hand evidence, admin console, owner moderation.

## Remaining

- True multi-table tournament flights/balancing.
- KKPoker-specific verification (not installed/exposed).
- Complete native background catalogue.
