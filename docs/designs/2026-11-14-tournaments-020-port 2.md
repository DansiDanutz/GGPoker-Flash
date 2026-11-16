# Tournaments 020 — reference port

Reference: `docs/screenshots/desk-pass/reference-020.jpg` (Paper screen 020).
Comparison: `docs/screenshots/desk-pass/compare-tournaments.png`.

## What changed

The Tournaments feed now follows the reference layout instead of the old hero + card list:

- **Series tab strip**: the eight reference series tabs (Tournaments red/active, GGMillions
  Festival, PLO Series, GGMasters, WSOP Express, Spin & Gold, Battle Royale, Flip & Go)
  cropped from the reference into `app/public/assets/gg-creatives/series-tab-*.jpg`.
- **Filter chips**: All (white active), GGMasters, Bounty Hunters, Mystery Battle Royale,
  Spin & Gold, Flip & Go, Satellites, Live Series, with the overflow chevron.
- **Dense table** with the reference columns — Start (phase + countdown), Event Name,
  Buy-in, Players, Prize — a search field in the header, alternating row tints, a red
  left marker on the selected row, and mode colours for bounty/mystery rows.
- **Right panel**: Buy-in bands (All / Freeroll / Low / Medium / High / Super), a summary
  (events, guarantees, balance), and Tournament Lobby / Register buttons that act on the
  selected row. Double-click opens the tournament lobby.
- The 112 px account column is reserved as in the reference (our rail currently lives on
  the lobby), and the floating account name is hidden on this page so it cannot overlap
  the tab strip.

The old hero banner, category rail, toolbar and card list are replaced on desktop; the
phone keeps its own `MobileEvents` screen.

## Verification

- 1200×958 and 1440×900 captures (`docs/screenshots/desk-pass/tournaments-1200x958.png`,
  `docs/screenshots/tourn-final/1440-tournaments.png`), phone unchanged
  (`docs/screenshots/tourn-final/0390-tournaments.png`).
- `tsc --noEmit`, Vite build, 862 node tests: clean.
- 0 px horizontal overflow at 390 and 1440.

## Next

058 Table → 089 My Page → 105 Rewards → 128 Cashier → 116 Settings → remaining 05–18.
The account rail itself still needs to become global (reference shows it on every page);
that is the next structural piece after the table port.
