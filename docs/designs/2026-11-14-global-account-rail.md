# Global account rail (structural step for sections 07–10)

Reference: screen 038 (`~/Projects/PlayGG-screens/_paper/38-profile.jpg`) and every
captured desktop screen — the 112 px account rail is present on all of them.

## What changed

- Extracted the rail from `Lobby` into `src/components/AccountRail.tsx` (wallet rows,
  Cashier, guest Log in / Sign up, Prop Bet, Rewards, My Promo, My Page, Missions,
  Leaders, DanGG Pass).
- `PageShell` now renders it on **every desktop screen** next to the page content
  (`app-content.has-rail > app-page + AccountRail`), so My Page, Rewards, Cashier,
  Tournaments, Slots, Casino and the rest no longer lose the wallet or shortcuts.
- `Lobby` keeps the rail in its own flex row, using the same component.
- Rail rules: 112 px wide, labels fit at 9.5 px, hidden below 1100 px so the tablet
  layout keeps the full content width.

## Verification

- 18 captures at 320 / 390 / 768 / 1024 / 1440 / 1920 for `/my-page`,
  `/tournaments`, `/cashier` → 0 px horizontal overflow
  (`docs/screenshots/rail-final`).
- Rail visible at 1440 and 1920, hidden at 1024 and below (tablet band).
- 862 node tests, `tsc --noEmit`, Vite build: clean.

## Next

Port 038 My Page (left menu + profile/avatar pane) on top of the global rail, then
040 My Wallet, 042 Transaction History, 105 Rewards, 128 Cashier.
