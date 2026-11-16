# Motion + material everywhere (not just Home)

Extends the premium language from Home to every non-table screen and adds real
route transitions.

## Route transitions

`navigate()` now commits through the **View Transitions API** (`flushSync` the route
change so the new DOM is captured): the old page lifts 6 px and blurs out in 200 ms,
the new page rises 12 px from a 4 px blur in 380 ms on the house spring. Skipped for
`/table/*` (the live table owns its motion) and under `prefers-reduced-motion`.
Verified: tab navigation and browser Back both keep the correct page.

## App-wide material

- `.page .card` now uses the same gold hairline + top highlight + 10→16 px shadow
  stack as Home, with a hover lift.
- `.page-title` is a white→gold gradient.
- Buttons get a foil sweep on hover, warmer red/gold glows and a real press.
- Account window: glass tab strip, gradient menu/pane, menu items slide 4 px on hover.
- Tournaments: rows get a gold inset edge on hover/selection, series tabs lift.
- Tables: gradient headers and a warm row hover.

## Evidence

- `docs/screenshots/premium/1200-tournaments.png`, `1200-my-page.png`,
  `1200-rewards.png`, plus 390/768 captures (`premium/0390-*`, `0768-*`).
- 0 px horizontal overflow at all captured widths; navigation/Back verified.
- 864 node tests, `tsc --noEmit`, Vite build: clean.
