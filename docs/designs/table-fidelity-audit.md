# Table fidelity audit: Codex's clone vs DanGG

Date: 2026-11-12. Reference: `~/Documents/ChatGPT/REA/GGPoker` (`network.mjs`,
`felt.css`, `home-art/`). DanGG: `app/src/pages/TablePage.tsx`, `app/src/design-v2.css`,
`app/server/table.js`.

## Method

Compared the clone's **SixRingSetting** anchors (`sixPositions` in `network.mjs`,
1700×1200 space, each with a seat, `bet` and `dealer` anchor), its native chip/dealer/WIN
artwork, and its `.felt` CSS against DanGG's percentage seat ring, card sizes, chip
rendering and animation timings. Checked both in headless Chrome at 1280×900 and against
the clone's reference captures (`local-card-squeeze-table.png`, `local-reserved-actions.png`,
`native-win-*`).

## Findings and decisions

| Area | Codex clone | DanGG before | Decision |
|---|---|---|---|
| Seat ring | Exact native anchors (hero 850,952; seats at 10.9–89%) | Percentage ring (50/80, 12/71, 16/32, 50/17, 84/32, 88/71) | **Keep DanGG's** responsive ring (phone/tablet variants); it is within ~1–3% of the native anchors and adapts better. |
| Hole cards | Native 122×162 faces, fanned above the portrait | 44×62 mini cards, unfanned | **Take the clone's scale**: 58×81 (66×92 hero) with a small fan. Kept DanGG's compositor and four-colour support. |
| Pot chips | 36×35 native sprites, 9-chip columns, denominations | CSS gradient circles, 15px | **Take the clone's artwork and caps**: native `native-chip-1/5/25/100` sprites in 9-chip columns, hugging the pot label. |
| Wagers | Native chip piles (7-chip cap, mirrored anchors) | Text pill + one generic icon | **Take the clone's piles**: denomination columns at the seat (4-chip cap) plus the exact amount pill. |
| Dealer | `dealer-disc.png` (40×38) at the dealer anchor | White “D” pill | **Take the native disc.** |
| WIN | `native-win-effect.png` (46-frame APNG) + final frame | CSS text overlay + SWF | **Take the native APNG** on the winner, with the final frame under reduced motion. |
| Board | 200 ms throw from the dealer, flop spread | Slide from the centre, uniform delay | **Take the dealer throw** and the flop stagger; keep DanGG's 0.3 s easing. |
| Showdown | Seat-order reveal ~2 s, delayed badge | Immediate reveal and badge | Already ported in #32. |
| Reserved actions | Native 9-slice buttons | Native buttons | Already ported in #32. |
| Table themes | Limited palette | Full DanGG theme set + backgrounds | **Keep DanGG's** themes and responsive layout. |
| Clock / bet widgets | Native digits and bet widget art | DanGG timer bar + slider | Keep DanGG's (functional, accessible); native widget art remains open. |

## Shipped in this pass

- Native pot and wager chip sprites with denomination columns; the pot pile now anchors to
  the label instead of floating above it.
- Native dealer disc.
- Native 46-frame WIN APNG on winners (final frame when animations are off).
- Dealer-origin board throw with the flop staggered.
- Larger, fanned seat cards (58×81, 66×92 hero) with a phone fallback.

Verified with headless screenshots at 1280×900 and the existing test suite; assets are
host-local (gitignored) and copied during deploy like the other official art.

## Still open

Exact native seat anchors at very wide/narrow aspect ratios, portrait/name-plate frames,
clock digits and bet-widget artwork, AOF/Rush reserved layouts, and frame-exact board
timings. The clone's own `network-browser-test.mjs` remains the best source for those
pixel checks.
