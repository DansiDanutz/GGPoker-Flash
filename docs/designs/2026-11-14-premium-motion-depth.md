# Premium motion + depth pass (owner feedback: “we are a 7, the original is a 10”)

Owner feedback: no motion, no shading, no pro UI/UX. This pass adds a motion and
material layer across the shell and the Home, while keeping the reference layout.

## Motion

- **Jackpot count-up** in the header: eases 0 → $1,990,266.35 on first paint and to any
  new value in 1.3 s (cubic ease-out), static under reduced motion.
- **Home reveal choreography**: hero enters with scale + fade; sections rise 22 px with
  a blur-to-focus and staggered 60 ms delays; cards pop in with their own stagger.
- **Hero ken-burns**: the campaign art drifts and scales on a 28 s loop, with floating
  gold motes, a 9 s foil sweep and a pulsing live “Ends in N days” chip.
- **3D tilt with specular glare** on the hero, For You, TV, tournament, feature and
  casino cards: pointer position drives ±9°/±11° rotation and a radial highlight.
- **Hover depth**: cards lift 4 px, the gold rim brightens, plates scale, TV cards reveal
  a breathing play button.
- **Ambient bokeh**: six blurred gold orbs drift behind the feed; a cursor spotlight
  follows the pointer across the Home at 7% opacity.
- **Game tabs** (previous pass) keep their sheen sweep and gold underline.

## Shading

- Layered surfaces: gold hairline, top inner highlight, 12→22 px shadow stack and a
  gradient fill instead of flat #161618.
- Section titles use a white→gold gradient with a glowing diamond marker and rule.
- The shell gets a slow ambient aurora; the Home gets its own green/red/blue glow bed.
- Jackpot edge breathes on a 5.5 s cycle.

## UX

- Global `:focus-visible` gold ring on every interactive element.
- Press feedback on buttons/cards/tabs (`translateY(1px) scale(.995)`).
- All effects are disabled under `prefers-reduced-motion: reduce` (verified: the hero’s
  computed animation is `none`), and the spotlight/bokeh are hidden.

## Evidence

- `docs/screenshots/premium/1200-home.png` (default), `1200-tilt.png` (pointer tilt +
  glare on the Fish card), `1200-reduced.png` (reduced motion), `0390-lobby.png`,
  `0768-lobby.png`, `1440-lobby.png`; 0 px overflow at all widths.
- `tsc --noEmit`, Vite build, 864 node tests: clean.
