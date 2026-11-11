# Design Upgrade — Lobby, Rooms and Motion

**Date:** 2026-11-11
**Scope:** visual system, lobby hierarchy, room atmosphere, motion and accessibility.

## Direction

**Noir emerald + brass.** The official client is dark, gold-trimmed and materially rich; the clone was a flat gray table on a black field. The upgrade keeps the dark shell but adds:

- near-black green surfaces instead of neutral gray;
- brass hairlines and gold focus states;
- one clear primary CTA per surface;
- depth from layered gradients, not heavy 3D;
- motion that explains state changes instead of decorating them.

The generic purple/neon recommendation from the design system was rejected: it would move the product away from the GGPoker brand and the existing green felt.

## Lobby

- Header and top navigation use a glassy green-black gradient with a brass hairline.
- Promo hero is a framed card with a `FEATURED` badge, a `Discover` CTA, slow image drift and a restrained gold sheen.
- Filter bar and table list sit on glass panels with 10–12px radii and consistent borders.
- Table rows are 40px tall, stagger in, lift 2px on hover and show a gold left edge when selected.
- Players, stakes and estimated values keep their existing semantics; the estimated dot remains.
- Right rail uses the same panel language, a deeper felt preview, a gold rim and a last-jackpot/recent-winners block.

## Rooms

- The room image is lifted out of black with a brighter, desaturated treatment; floor and wall gradients are layered behind it.
- Felt is slightly smaller, with an inner pattern, stronger rim light and a gold inner rail.
- Ambient light pools and slow dust motes add depth without obscuring cards.
- Pot has a chip stack and a gold plaque; seats have larger avatars/plates, hover lift and an active-seat pulse.
- Card backs have a warmer brass-on-oxblood treatment; card deal and hero squeeze motion remain.
- Action bar uses taller 44px controls and a green-black gradient with a brass top edge.

## Motion

- Micro-interactions: 150–220ms, ease-out.
- Page/room entry: 350ms; table rows stagger 20ms.
- Hero drift: 22s; dust: 7–14s; jackpot/promo sheen: 5–8s.
- `prefers-reduced-motion` disables all decorative animation and transitions.
- Focus rings are visible on buttons, rows, inputs and selects.

## Accessibility

- Primary text remains light on dark; gold is used for emphasis, not as the only signal.
- Table rows are still buttons/clickable with visible selection and keyboard focus.
- Reduced-motion support is explicit.
- Cards and chips are decorative; amounts remain textual.

## Lobby navigation and carousel

- Added the official-style left rail: Game Lobby, Daily Challenge, Daily
  Leaderboard, Millionaires Club, ELO Rating, ELO Challenge, LIVE and Play Money,
  with a gold active state and a live pulse.
- The hero is now a four-slide carousel: the main promo plus official Discover
  art cards, with autoplay, pause-on-hover, previous/next controls, progress
  dots, crossfade and a per-slide CTA.

## Authentic SWF motion

The official client's SWF effects are played through **Ruffle 0.7.1**:

- `spinandgold_animation.swf` plays as the Spin & Gold intro;
- `spinandgold_congratulation.swf` plays on a Spin win;
- `mystery_jackpot_bounty_box_motion.swf` plays on a mystery bounty;
- `winEffect.swf` plays on a tournament win;
- `chipShuffle.swf` is available from the table menu as an FX preview.

The runtime is copied into `app/public/ruffle` by `tools/copy_ruffle.mjs`; the
packaged CSP allows `wasm-unsafe-eval` and blob workers. The SWF files stay
local and are not redistributed.

## Official assets used

- **Table backdrop:** decoded from the installed client's
  `table_bg/normal/Tablebg_Featured_6Ring.atf` into
  `app/public/assets/tables/featured_6ring.png`; the room now uses it behind the
  felt instead of the nearly-black room mask.
- **Card back:** extracted from the official `after_lobby/table_card.png` atlas
  (`card0032`, the green diamond back) into
  `app/public/assets/cards/back_green.png`.
- `tools/build_assets.py` now re-extracts the card back and keeps the table
  backdrop in the regenerated asset tree.

The installed client was inspected at
`~/Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/Game/assets`.
It contains 771 MB of atlases, SWFs, bitmap fonts, sounds and room art. The CSS
surface cannot execute the client's SWF/Stage3D content directly; the static
table and card assets are used, while the motion is rebuilt in CSS.

## Remaining official assets

The official card-face atlas is a set of 53 large frames (face cards and backs),
not a clean 52-card rank/suit map. The official flag atlas likewise has 820
unnamed frames. Those two remain a mapping exercise; the table backdrop and one
official card back are already in use.

## Resizable desktop shell

- Removed the fixed 1200×961 stage. `.app-window` now fills the native window;
  the Electron shell is borderless at every size and the browser preview no
  longer applies a scale transform.
- Responsive breakpoints at 1280, 1120, 980, 900, 760 and a short-height rule
  at 780.
- Lobby left rail collapses at 1120; side preview collapses at 980; table
  columns collapse from eight to six and then five; game tabs scroll.
- Login stacks/hides art, admin tables scroll, tournament rows collapse,
  action rows wrap, and cards/tables scale down.
- The game-tab art was re-cropped from the official lobby at the real
  separators (`141, 276, 410, 545, 680, 815, 949, 1084`): Home, All-in or Fold,
  Rush & Cash, Hold'em, PLO, Short Deck, Spin & Gold and Mystery Battle Royale
  now fit without clipped labels or an over-wide Home highlight.
- On phones the filter bar wraps into two rows (three selects, then search +
  favorites) instead of clipping the search field.
- The header avatar now uses the shared `Avatar` gradient/initials component, so
  a missing upload still renders a finished profile mark instead of a flat
  letter.
- The right rail was rebuilt as currency cards, a gold Cashier action and
  chevron menu rows. Below 1120px it is replaced by the avatar-triggered account
  drawer, so the rail no longer gets squeezed into a clipped 139px strip.
- The account drawer carries the avatar, VIP, four balances, Cashier and the
  full shortcut grid (Prop Bet, GG Left, My Promo, My Page, Missions, Leaders,
  GGPass).
- The bottom navigation appears through 1100px so tablet portrait still has
  Lobby, Events, Cashier, Rewards and My Page.
- Verified by resizing the packaged app to **1000×720**, **1200×830**, 
  **1440×900**, and a phone viewport of **390×844**; lobby, room and cashier
  screenshots are in `research/screens/deliverable/mobile_*.png` and
  `responsive_*.png`.

## Phone and tablet

- The Electron window minimum is now **360×640**, not 980×720.
- At ≤760px the UI switches to a phone layout: compact header, horizontally
  scrolling game tabs, promo carousel, table cards instead of rows, a fixed
  five-item bottom navigation, and a bottom-safe-area inset.
- The room uses smaller seats, scaled felt, compact top bar and wrapping action
  controls; the bottom navigation is hidden while seated.
- Tablet widths use the 980/1120 desktop rules (side preview hidden, table
  columns collapsed) rather than the phone card layout.

## Card size and animation

- Table cards are larger: board cards **74×104px** (from 62×88), hole cards
  **44×62px** (from 38×54), with larger rank/suit glyphs.
- **Menu → Card animation** offers **Deal**, **Flip**, **Slide** and **Off**;
  the choice is stored in `ggpoker.cardAnim`.
- Deal uses the existing centre-deal motion; Flip rotates the card in 3D; Slide
  rises into place; Off and the global animation toggle both remove motion.
- Phones keep proportionally scaled cards.

## Table action templates

Three selectable locations for betting controls, persisted per device in
`ggpoker.buttonLayout`:

- **Bottom bar** — the original full-width tray under the felt.
- **Side panel** — a compact vertical glass panel docked to the right of the
  felt, with actions, quick-bet grid, slider and amount stacked.
- **Floating** — a rounded, centred tray floating above the player seat.

The table menu exposes them under **Button layout**. Phones always fall back to
the safe bottom tray.

## Brand wordmark

- Replaced the previous wordmark with the supplied premium DanGG wordmark.
- It is used in the header, login, and as the fallback chrome logo.
- `crop_chrome.py` no longer overwrites the brand logo when regenerating chrome.
- The splash, login, header and favicon all use a cache-busted brand URL, so a
  fresh launch does not reuse the previous cached wordmark.
- The macOS app icon is generated from the same wordmark (dark emerald tile,
  gold border) and refreshed on every `package_app.sh` run.

## Limits

- The room is still a CSS/2D composition over the decoded room texture, not the Stage3D scene.
- No live-dealer video.
- The upgrade does not add custom licensed fonts; it uses the existing UI stack.
- A full screen-by-screen parity audit against the installed client remains future work.
