# Header: jackpot spacing + profile column (owner feedback)

Owner feedback: the Bad Beat jackpot was crowded against the profile circle, and the
profile circle needed to read like the reference view.

## Measured before

At 1200 px the jackpot occupied x=810–1096 and the account block started at x=1090 —
a **−6 px overlap**. The account block was also transparent, so its nickname sat on
top of the Spin & Gold / Battle Royale tab art.

## Fix

- Jackpot is a fixed 300 px (280 px ≤1280, 210 px ≤1080, 180 px ≤960) with a right
  margin, so it ends **24 px before** the profile column at 1200 (22 px at 1024).
- The profile column is a dedicated 108 px panel (104 px ≤1280) pinned to the right:
  avatar 56 px, VIP badge, nickname, dark plate with a bottom radius and shadow. It
  reads as its own column over the tab strip, like reference 038, instead of floating
  text.
- Header right padding stays 130 px so no other header control runs under it.

## Evidence

- `docs/screenshots/header-before.png` / `header-after.png` (1200), `header-1440.png`,
  `header-1024.png`; measured gaps 24 / 48 / 22 px, no overlap.
