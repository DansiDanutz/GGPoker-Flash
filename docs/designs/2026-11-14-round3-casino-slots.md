# Round 3 — Casino / Slots catalogue

Branch `feat/mobile-gg-parity-r3` from `main` (60ed28f).
Reference: `~/Projects/PlayGG-screens/_paper/19-slots-home.jpg`, `27-casino-home.jpg`
and the Paper sections 05 (Slots) and 06 (Casino).

## Delivered

### 1. Slots catalogue (`#/slots`, `#/slots/<game>`)
- Category strip: All · New · Hot & Cold · Jackpot · Classic (driven by real game tags).
- Three summary cards: **Top win today** (live data), **Your best today** (per-account,
  live), **Daily freebie** (links to Rewards).
- **Biggest wins** ticker (today's winning `slots` transactions, marquee, pauses on
  hover, static under `prefers-reduced-motion`).
- **Only on DanGG** grid: one featured tile plus one tile per game, with badge,
  tagline, volatility and minimum bet. Selecting a tile opens that game.
- Game shell: back link, name/tagline/volatility, themed accent, 5×3 reels, the game's
  own bet ladder, SPIN, line-by-line wins.

### 2. Six real playable games (not tiles)
`app/server/slots.js` now exports `SLOT_GAMES`, `slotGame()` and `slotCatalog()`; each
entry has its own symbol weights (volatility), paytable scale (return), bet ladder and
glyph theme. The default (`olympus-gold`) keeps the original math, so existing tests and
behaviour are unchanged.

| Game | Volatility | RTP (200k spins) | Hit rate | Bets |
|---|---|---|---|---|
| Olympus Gold | Medium | 0.969 | 0.315 | 50/100/500/1000 |
| Disco Cat | Low | 0.935 | 0.338 | 25/50/100/250 |
| Robo Rush | Low | 0.947 | 0.375 | 25/50/200/500 |
| Clover Cash | High | 0.928 | 0.311 | 50/250/500/2000 |
| Seven Samurai | High | 0.925 | 0.243 | 100/500/1000/2000 |
| Wild Jungle | Medium | 0.939 | 0.366 | 25/100/500/1000 |

Tools: `tools/slot-rtp.mjs` (RTP/hit-rate simulation), `tools/slot-art.mjs`
(480×600 vector key art, no emoji/font dependency).

### 3. API
- `GET /api/games/slots` — display catalogue (never leaks weights/paytables).
- `GET /api/games/winners?limit=` — today's biggest wins across casino games, plus
  `mine` (the caller's best slots win today).
- `POST /api/games/slot` — now takes `{ bet, game }`; unknown games and stakes outside
  the game's ladder are rejected with 400.

### 4. Casino hub (`#/casino`)
- Category chips: All · Slots · Table · Arcade · Poker (filters the game grid).
- Hero carousel: three slides, auto-advance, dots, per-slide accent, CTA to the slots
  catalogue / Crash / Rewards.
- **Biggest wins** ticker (all casino kinds, live).
- "Only on DanGG" heading over the eight-game grid; cards are keyboard operable
  (`role="button"`, Enter/Space).
- The redundant Lobby/Roulette/Blackjack sub-nav was removed from the hub; the chips
  and cards are the navigation.

### 5. Phone
- Casino phone hub gains the winners strip and a **"Six slots. One floor."** entry card
  that opens the catalogue.
- The slots catalogue and game shell are responsive (2-column grid ≤760 px, featured
  tile full width, full-width SPIN), verified at 320/390.

## Verification

- `node --test server/*.test.js` → **862 pass, 0 fail** (856 before + 6 new): catalogue
  shape, per-game paytables, unknown-id rejection, catalogue payload privacy, and an
  RTP band per game (`server/slots-games.test.js`).
- `tsc --noEmit` clean; Vite build clean.
- 15 screenshots at 320/390/768/1024/1440 for `/slots`, `/slots/seven-samurai`,
  `/casino` — **0 px horizontal overflow** (`docs/screenshots/r3-final`).
- `tools/a11y-probe.mjs --routes /,/slots,/casino,/slots/disco-cat --widths 390,1440`:
  16 Tab stops per route/width, **0 off-screen, 0 unlabelled, 0 without an outline**,
  and **+0 px overflow at 200 % zoom** (reflow).
- API smoke: all six games spun end-to-end with balance changes; `Unknown game` and
  `Choose a stake: …` returned for bad input; winners feed and `mine` populated.

## Remaining differences (sections 05–06 and beyond)

1. **Reference cards** are three leaderboards/raffles with rank tables and prize pools.
   DanGG shows Top win / Your best / Daily freebie because it has real data for those
   and no persistent slots leaderboard yet. A slots leaderboard table is the next step.
2. **Category semantics**: reference has GG99, NEW, HOT & COLD, BUY BONUS, JACKPOT,
   PROMOTIONS, FREEROLLS, All. Buy Bonus, Freerolls and Promotions do not exist as
   features, so they are not shown as dead chips. Jackpot is a tag, not a progressive.
3. **Illustrated art**: the reference uses commissioned game art. DanGG uses generated
   vector emblems per game; a real art pass should replace them.
4. **Casino Live/GG99/Arcade** categories: no live-dealer or GG99 games exist, so the
   chips reflect real content (Slots/Table/Arcade/Poker).
5. **Mobile slots** runs the responsive desktop shell, not a native phone catalogue
   layout; the phone Casino hub links into it.
6. **Not touched this round**: poker tables, tournament pages, Cashier, PokerCraft,
   settings, and the remaining Paper sections.
