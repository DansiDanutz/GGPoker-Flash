# Table chrome pass (live hand)

Reference: `docs/screenshots/desk-pass/reference-table.jpg`.
Comparison: `docs/screenshots/desk-pass/compare-table.png`.

Gameplay, betting logic, sockets and payout motion were **not touched**. This is a
visual/materal pass plus two small UX additions.

## What changed

- **Bot faces**: bots without an uploaded avatar get a deterministic preset portrait
  (`/assets/avatars/gg-01..20.jpg` hashed from the nick), so seats read as people
  instead of initials. The demo hero keeps the real avatar.
- **Felt**: layered green gradient, deeper inset vignette, gold rim, slow sheen sweep,
  brighter watermark and a lit top edge.
- **Seat pods**: 74 px avatar ring, larger plate with gold hairline, gradient fill,
  inset highlight, stronger name/stack hierarchy, warm glow for the active seat and a
  gold rim on the winner.
- **Cards**: hero hole cards 56×78 with a gold-warm edge; other seats 40×56; a darker
  navy/red card back with a gold monogram instead of the flat candy stripe.
- **Bets/pot**: wager chip stacks keep their native sprites with a deeper drop shadow;
  the pot pill is now gold-rimmed with a warm glow.
- **Action bar**: 48 px targets, green Check/Call, red Raise, dark Fold, gold All-in,
  stronger press/lift feedback; the slider is thicker.
- **Tablet portrait guard**: 600–1100 px in portrait shows a clear “Rotate your device”
  prompt instead of the squeezed desktop table (poker tables are landscape).

## Evidence

- `docs/screenshots/table-shots/1200-final.png` (hero A♥ 10♦, pot $50, Fold/Check/Raise),
  `1440-final.png`, `1024-table.png`, and the portrait guard at `768-table.png`.
- Live hand played against bots; action bar exposes Fold / Check / Raise / Time bank.
- 0 px horizontal overflow at 1440/1024/768.
- 864 node tests, `tsc --noEmit`, Vite build: clean.

## Remaining gaps vs the reference

- Pod plates/flags and the LIVE badge are still smaller than the reference.
- Board cards and the tournament info bar at the top-left can be richer.
- Deal/chip/payout motion already exists in the engine but needs the same material
  review next.
