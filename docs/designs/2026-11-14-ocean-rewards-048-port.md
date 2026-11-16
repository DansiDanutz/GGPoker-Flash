# Ocean Rewards 048 — reference port

Reference: `docs/screenshots/desk-pass/reference-048.jpg` (Paper screen 048).
Comparison: `docs/screenshots/desk-pass/compare-ocean.png`.

## What changed

`/rewards` is now the Ocean Rewards account window from 048 instead of a generic
“My Rewards” tab page:

- **Window chrome**: My Page / Prop Bet / **Ocean Rewards (active red)** / My Promo /
  Game Settings / close, plus the reference left menu (My Ocean Level, GEM Store,
  About Ocean Rewards) and the global 112 px account rail.
- **My Ocean Level pane**: underwater hero using `assets/ocean/Banner_Ocean_Whale.png`,
  gem counter, “Every journey starts here” bubble, current rank character from
  `assets/ocean/Ocean_Rewards_Rank_0..7.png`, cashback line, TP progress bar and the
  “Rank up to Shrimp…” caption.
- **Tier parchment**: eight tiers Fish → Shark with rank art, TP milestones, GEM
  multipliers (×1.5 → ×5) and cashback (~16% → ~80%); the current column is highlighted.
- **About Ocean Rewards** pane explains TP, the GEM multiplier and cashback.
- **GEM Store** keeps every existing reward feature: DanGG Pass track, daily missions,
  Prize Wheel, fish ranks/history and the leaderboard, under the same window.

TP is the player's XP, so the bar and caption are live: Fish → Shrimp at 10,000 TP.
The reference's 894 / 10,000 is one player's snapshot, not a fixed design value.

## Responsive

- ≥1025: full window, hero 360 px, 8-column parchment, global rail.
- 768–1024: 200 px menu, compact tier cells, rail hidden.
- ≤760: horizontal tabs/menu, hero 250 px, parchment scrolls horizontally inside its
  card (page itself never overflows), 44 px menu/tab targets.

## Verification

- Captures at 320/390/768/1200/1440/1920 (`docs/screenshots/ocean-final`), 0 px page
  overflow at every width, 5 tier rows rendered; GEM Store pane verified separately
  (`1200-gem-store.png`).
- 864 node tests, `tsc --noEmit`, Vite build: clean.
