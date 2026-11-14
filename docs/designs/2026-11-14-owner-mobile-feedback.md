# Owner phone feedback — dangg.live mobile (2026-11-14)

Source: Dan's real phone screenshot at `docs/screenshots/owner-feedback/2026-11-14-owner-phone-home.jpg`
(Android, ~590x1310, Chrome, logged-in Home).

Verdict from visual analysis: the page IS responsive in structure, but it falls clearly short of
native mobile poker-app standards. The width/overflow test (0px) hid these defects.

## Concrete defects (priority order)

1. HERO — too tall and desktop-shaped
   - Occupies ~30% of the first viewport (~245-270dp); native banners are 160-220dp.
   - Wide desktop-ratio creative cropped with object-fit: cover on the phone.
   - The "Quick Flip" CTA is baked into the raster and clipped by the right edge => dead CTA.
   - "LEADERBOARD" text is baked into the image at ~7-8sp => unreadable, unscalable.
   - Fix: live HTML text/CTA inside the hero, cap height ~200-220dp or 30dvh, mobile-specific
     creative (square/tile), CTA fully inside safe margins at 320-430dp.

2. FLOATING DanGG LOGO — overlaps nav and content
   - Center orb covers the bottom of the "For You" cards and intrudes into nav tap areas.
   - Fix: inset the orb 8-16dp above the bar (or notch it), add bottom padding to content.

3. TOUCH TARGETS below minimum
   - "Join now" ~28-30dp tall (<44dp min), carousel dots ~6-8dp (should be indicators only).
   - Bottom nav icons need >=44dp exclusive hit areas.

4. SAFE AREAS / VIEWPORT UNITS
   - No env(safe-area-inset-bottom) handling; nav would collide in standalone/PWA.
   - Use dvh/svh so layout survives URL-bar collapse.

5. FOR YOU CAROUSEL — ambiguous clipping
   - "Daily Freebie" card cut at the right edge with no peek/scrim/snap => reads as broken.
   - Fix: visible peek + scroll-snap + edge fade.

6. MICRO-COPY too small
   - Eyebrow (gold "EVERY DAY - PLAY CHIPS") ~9-10sp, seat counts ~11sp. Bump to >=12sp.

7. BALANCE/WALLET inside hero slide 1
   - Scrolls away; native apps keep a persistent lobby header with balance accessible.
   - Fix: persistent top bar with balance chip.

## Acceptance for the mobile round
- Matches a native mobile poker layout at 320/390/430 widths; hero <=~30dvh with live text.
- All CTAs fully visible and tappable (>=44dp), no element clipped at the right edge except an
  intentional carousel peek with snap + fade.
- Orb does not overlap nav label/icons or card content at any tested width.
- safe-area insets + dvh/svh handled; keyboard and 200% zoom reflow verified.
