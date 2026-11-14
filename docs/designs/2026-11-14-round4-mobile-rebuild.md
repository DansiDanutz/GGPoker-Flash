# Round 4 — phone rebuild (owner feedback after live testing)

Reference: the owner's real-device capture
`docs/screenshots/owner-feedback/2026-11-14-owner-phone-home.jpg` (deployed 60ed28f)
and the Paper design's distinct mobile experience.
Side-by-side: `docs/screenshots/mobile-final/comparison.png`.

## What was wrong

The phone *did* have a phone shell (from #108/#109), but it was still a desktop
composition squeezed into 390 px:

- a 290 px hero carrying the wallet, the full promo art with its own text, the CTA and
  the dots — four competing elements in one banner;
- no phone chrome at all: content started under the status bar, the wallet floated over
  the hero;
- icon-only bottom bar with a raised centre orb and no labels;
- a horizontal carousel of 196 px cards rather than a thumb-scrollable feed;
- body/meta type at 10–13 px;
- the lobby's loading state rendered the desktop title bar and tabs, so a slow phone
  saw desktop chrome before the phone UI (fixed here too).

## What changed

### Phone chrome (≤760 px, designed at 390)
- `MobileShell` + `MobileTopBar`: a 56 px bar with avatar (→ My Page), centred DanGG
  wordmark, and a 44 px wallet chip (→ Cashier). Sub-pages get a 44 px back button and
  the page title instead of the brand.
- `PageShell` is phone-aware: on a phone it renders the mobile shell instead of the
  desktop title bar, brand header and account rail. `Lobby`'s loading state does the
  same, so desktop chrome can no longer flash on a phone.
- Desktop chrome (quick menu, account rail, game-lobby rail) is hidden on phones.

### Home
- Hero: **186 px tile**, one message + one CTA. The banner uses the wide key art
  (focal motif right, copy left) instead of the square promo tile with its embedded
  text. Dots are 30×44 px hit areas.
- Jackpot strip, then four 44 px quick actions (Play, Tournaments, Casino, Rewards).
- **Single-column feed**: jump-back-in card with a 44 px Join, then full-width promo
  rows (56 px art, title, subtitle, chevron), live-table rows, casino rows.
- Type: 24 px hero title, 18 px section headings, 14.5–16 px card titles, 13 px meta.

### Navigation
- Bottom bar is now the primary nav with **five labelled destinations**: Home, Casino,
  Tables, Rewards, My Page. 56 px items, 10 px labels, safe-area padding, active tab
  gold with a red indicator. The raised centre orb is gone.
- `aria-current` marks the active destination; each item is a labelled button.

### Casino phone hub
- Keeps the hero but at 176 px with a left scrim, plus the winners strip and the slots
  catalogue entry card. No desktop chrome.

## Verification

- `docs/screenshots/mobile-final/` — 35 shots, 7 routes × 320/390/768/1024/1440,
  **0 px horizontal overflow** at every width; desktop 768–1440 unchanged.
- `app/tools/touch-probe.mjs` at 390 px — **0 controls under 44 px high / 24 px wide**
  on `/`, `/casino`, `/slots`; smallest body copy 14 px (10–11 px is limited to
  uppercase ticker/age labels).
- `app/tools/a11y-probe.mjs --routes /,/casino,/slots,/rewards --widths 390,1440` —
  16 Tab stops per route/width: 0 off-screen, 0 unlabelled, 0 without an outline,
  **+0 px overflow at 200 % zoom**.
- 862 node tests pass (two navigation tests updated to the owner-specified tabs);
  `tsc --noEmit` clean; Vite build clean.
- Before/after: `docs/screenshots/mobile-final/comparison.png`.

## Still different / next

1. **Sub-page internals** (Cashier, Rewards, My Page, Slots) are responsive desktop
   pages inside the new phone shell; they read at 14 px but are not yet designed
   mobile-first like Home.
2. **Tablet band (431–760 px)** shares the phone layout; a dedicated tablet layout is
   not part of this round.
3. **Hero art** is the wide 1200×236 key art cropped to 390×186; a dedicated phone
   banner set (2:1) would be sharper.
4. **Avatar menu**: the avatar goes straight to My Page; there is no bottom sheet with
   Cashier/Settings/Support/Log out yet.
5. **Table/poker pages were not touched** (owner is live-testing them).

## Owner checklist (7 defects) — how each is closed

Measured with `app/tools/mobile-audit.mjs` at 320×780, 390×844 and 430×844.

| # | Defect | Fix | Measured |
|---|---|---|---|
| 1 | Hero too tall / desktop-ratio crop / baked-in CTA and 7sp text | Dedicated **780×420 phone banner set** (`tools/hero-art.mjs` → `phone-*.svg`), live DOM headline + CTA, `height: min(186px, 30dvh)` | 186 px = **23.8 % / 22.0 % / 22.0 %** of the viewport; CTA fully inside the viewport at 44 px |
| 2 | Floating logo/orb overlaps nav and cards | Orb removed; wordmark lives in the 56 px top bar; tab bar is a flat 5-column grid | No centre orb element; nav and cards never overlap |
| 3 | Join now 28–30 dp, dots 6–8 dp | Hero CTA and Join are 44 px; indicators are **passive** (6 px), manual control is swipe | Touch probe: **0 controls under 44 h / 24 w** on `/`, `/casino`, `/slots` at 320/390/430 |
| 4 | No safe areas / viewport units | `env(safe-area-inset-top/bottom)` on bar, nav and feed padding; app height `100vh` then `100dvh` | Audit `nav-safe-area` passes; 200 % zoom reflow +0 px |
| 5 | Ambiguous carousel clipping | For You is one full-width jump card plus a rail that is **78 % wide with 14 px peek, `scroll-snap-type: x mandatory`, and a right-edge mask fade** | Audit `rail-snap`, `rail-peek`, `rail-fade` pass at all three widths |
| 6 | Micro-copy 9–10 sp | Eyebrow 12 px, meta/seat counts 13 px, legal 12 px, slot badges 10 px, body 14 px+ | Touch/typography probe: smallest body copy 14 px |
| 7 | Balance scrolls away inside hero | Balance is a persistent chip in the sticky top bar | Audit scrolls the feed 500 px and re-checks the chip: same position, bar at top |

`app/tools/mobile-audit.mjs 320,390,430` → **PASS** on all ten checks per width.

## Final verification for this round

- 42 screenshots at **320/390/430/768/1024/1440** × 7 routes, 0 px horizontal overflow
  (`docs/screenshots/mobile-final2`); before/after in
  `docs/screenshots/mobile-final/comparison.png`.
- 862 node tests, `tsc --noEmit`, Vite build: all clean.
- Keyboard/reflow: 16 Tab stops per route at 390 and 1440 on `/`, `/casino`, `/slots`,
  `/rewards` — 0 off-screen, 0 unlabelled, 0 without outline, +0 px at 200 % zoom.
