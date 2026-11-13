# Round 2 — Home parity: wide hero art, TV row, feed Home, tab geometry

Branch `feat/mobile-gg-parity-r2` (from `main` = 55412b5).
Reference: the Paper screen map (18 sections / 292 screens) and the local capture
library `~/Projects/PlayGG-screens/_paper` (1200×958 client screenshots).

## Delivered

| # | Item | Result |
|---|---|---|
| 1 | **Hero key art** | `tools/hero-art.mjs` generates a 1200×236 vector set (`app/public/assets/hero/*.svg`) — one per campaign, focal motif in the right third, copy keeps the left 58 %. Desktop renders it full-bleed; the phone keeps the square tile. |
| 2 | **Home feed depth** | `DanGG.TV` row of the four busiest public tables as LIVE watch cards (opens the watch-only table), plus the existing For You rail with gradient-footed cards. |
| 3 | **Table preview on Home** | Removed: the preview/Join panel now belongs to the game tabs, so Home is hero → For You → DanGG.TV → tables at full width. |
| 4 | **Game tabs** | 44–46 px parallelograms with a red active wash, clipped like the reference strip. |
| 5 | **Narrow phone (≤360 px)** | 258 px hero, 13 px gutters, 21 px section headings, 188×244 cards, 264 px live cards — the first live-table row now peeks above the tab bar. |

## Verification

- `node --test server/*.test.js` → 856 pass, 0 fail.
- `tsc --noEmit` clean; Vite build clean.
- `app/tools/shots.mjs --widths 320,360,768,1024,1440` → 35 shots, **0 px horizontal
  overflow** at every width (`docs/screenshots/r2b`, `r2c`).
- `app/tools/a11y-probe.mjs` → 14 focus stops at 390 px and 1440 px, all labelled and
  in view, all with a visible outline.
- Keyboard: tabs/buttons reachable in DOM order; carousel arrows are buttons.

## Still open (sections 05–18)

1. **Slots catalogue** — `/slots` is a single machine; the reference has a category
   strip, three leaderboard/raffle cards, a biggest-winner ticker and an "Only on GG"
   grid. Needs a game catalog + tiles; the engine (`server/slots.js`) is already
   parameterised enough to host several symbol themes.
2. **Casino hub** — category chips with icons (GG99/LIVE/ARCADE/…), hero carousel and
   the biggest-winner ticker are missing; the 9-game grid exists.
3. **Cashier, PokerCraft, settings sub-pages, tournament-lobby variants, Mystery
   Bounty** — unchanged this round.
4. **Table felt** — not touched this round.
