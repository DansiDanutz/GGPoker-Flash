# Game tab bar — rounded gold-rimmed tiles (owner feedback)

Owner feedback: “I don't like so much the buttons Home, All in or Fold … they are not
rounded, being like a square it's not giving a good impression, try to be more inventive.”

## Before

Eight 156×57 image plates butted together with no gap, clipped by a 46 px bar. Square
corners, hard black seams, active state only a red plate.

## After

- **Rounded tiles**: 13 px radius (12 px ≤1100, 11 px ≤760), 1 px gold rim, soft drop
  shadow and inset top highlight.
- **Breathing room**: 8 px gap, 10 px side padding, 58 px bar (54/50 at smaller widths);
  tiles flex between 118 and 156 px so all eight fit at 1200 without clipping.
- **Hover**: lifts 2 px, gold rim brightens, plate scales 1.03, and a slow gold sheen
  sweeps across the tile.
- **Active**: full gold rim, warm outer glow, and a glowing gold underline; the red
  active plate is unchanged.
- A spacer keeps the tiles left-aligned on wide screens; the bar scrolls horizontally
  on narrow ones with the scrollbar hidden.

## Evidence

- `docs/screenshots/game-tabs-after.png` (1200), `docs/screenshots/tabs-final/1200-lobby.png`,
  `0768-lobby.png` (tablet, scrollable), `game-tabs-hover.png` (hover sheen).
