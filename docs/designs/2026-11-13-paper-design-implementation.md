# Paper design implementation — desktop shell & phone shell

Date: 2026-11-13
Scope: `app/src` (design-v2.css, phone-shell.css, pages/Lobby.tsx), verification harness
`app/tools/shots.mjs`.
Reference: the Paper screen map `DanGG — GGPoker Clone Reference`
(https://app.paper.design/file/01M7AK19SCZZ8C77D5CV7SMBZ0/p-1-0), 18 sections / 292
numbered screens, plus the local capture library `~/Projects/PlayGG-screens/_paper`
(293 full-resolution 1200×958 client screenshots).

## What changed

### Desktop shell (≥1025 px)
| Element | Before | After | Reference |
|---|---|---|---|
| Title bar | 38 px | **40 px** | 40 px |
| Brand header | 60 px | **68 px** | 68 px |
| Game tab strip | 57 px | **46 px** | 44 px |
| Account rail | 146 px | **118 px** | 112 px |
| Hero banner | 143 px, floating art, avatar overlay | **236 px**, framed poster art, no avatar overlay | ≈252 px key art |
| Hero type | 19 px headline | **clamp(24–40 px)**, 11 px kicker, 13 px sub | 34–40 px |
| "For You" cards | 82 px, text over art | **144 px**, gradient footer, 186 px min column | ≈232 px |
| Home left rail | always visible | **hidden on Home** (feed layout), shown on game tabs | absent on Home |

Files: `app/src/styles.css` (metrics), `app/src/design-v2.css` (hero, cards, is-home,
tablet rules), `app/src/pages/Lobby.tsx` (removed the "Welcome back" avatar overlay and
added the Home modifier class).

### Phone shell (≤760 px)
The phone shell (`MobileHome`, `MobileEvents`, `MobileCasino`, `MobileGameList`,
`MobileNav`, `phone-shell.css`) is the distinct mobile experience: 290 px hero
carousel, wallet pill, For You / Live Tables / Casino rails and the five-destination
bottom bar with the round DanGG button in the centre. This pass fixes the two places
where the narrow view broke:

- **≤360 px** — headline steps down to 24 px and the slide copy keeps a 44 % right
  gutter so "DAILY CHIP FLIPOUT" no longer collides with the trophy art.
- **≤760 px** — safe-area bottom padding keeps the last rail above the tab bar.

### Tablet band (761–1024 px)
The hero poster art and the FEATURED badge are hidden in this band, the copy widens to
82 % and the CTA pins to 16 px, which removes the copy/art/CTA collision seen at 768 px.

## Verification

Harness: `app/tools/shots.mjs` logs in through `/api/auth/login`, seeds
`ggpoker.token` + `sessionStorage.ggpoker.entered`, waits for the splash to unmount,
then captures every route and records `scrollWidth − clientWidth`.

```
node tools/shots.mjs --widths 320,390,768,1024,1440 --out ../docs/screenshots/final
```

- 35 screenshots (7 routes × 5 widths), **0 px horizontal overflow** at every width.
- `node --test server/*.test.js` — **856 pass, 0 fail**.
- `tsc --noEmit` — clean.
- Vite production build — clean (single 870 kB chunk warning, pre-existing).
- Keyboard: `tools/a11y-probe.mjs` walks 14 Tab stops at 390 px and 1440 px — **0
  off-screen stops, 0 stops without a visible outline, 14/14 labelled** after adding
  `aria-label` to the icon-only title-bar buttons (window controls, chat, tournaments,
  messages, help, responsible gaming, connection, sound, language, settings).
- Reflow: the 320 px capture is the WCAG 1.4.10 equivalent (400 % zoom at 1280 px);
  no horizontal scrolling and no clipped controls at that width.

Screenshots: `docs/screenshots/final/{0320,0390,0768,1024,1440}-<route>.png`.

## Remaining differences from the reference

Documented, not fixed:

1. **Hero key art.** The reference uses a purpose-built wide key art per campaign.
   DanGG only ships square `Bg_Discover_*` tiles, so the hero uses a framed poster.
   A 1200×236 key-art set is the next design asset to commission.
2. **Home feed depth.** Reference Home continues with a GGPoker.TV row and richer
   promo cards; DanGG Home goes hero → For You → table list.
3. **Right rail on Home.** The table preview + Join/Watch panel still renders on Home;
   in the reference it belongs to the game tabs.
4. **Game tab strip.** Reference tabs are angled parallelograms with per-game art at
   44 px; DanGG keeps its own art at 46 px and scrolls horizontally below ~700 px.
5. **Mobile reference gap.** The phone shell was built from the mobile reference in
   commit 42daaf8; no fresh mobile captures were available on this machine during this
   pass, so no structural mobile changes were made beyond the two narrow-width fixes.
6. **Text-only zoom.** Type in the client is px-based, so a browser text-size
   preference does not scale it; zoom and the 320 px reflow do. Converting the type
   scale to rem is a follow-up.
7. **Screens 001–292 beyond the shell.** Sections 05–18 (slots catalogue, casino
   categories, PokerCraft, settings sub-pages, cashier tabs, tournament-lobby variants)
   are not re-skinned in this pass.

## Environment note

The checkout is on an APFS volume at 97 % capacity. Several thousand files under
`app/node_modules` and ~140 files under `app/public` were in an evicted/dataless state
(`st_blocks == 0`) and read with `ETIMEDOUT`; the dataless files were restored from the
packaged `~/Applications/DanGG.app` or removed, and the build runs against the intact
dependency tree from the parity checkout via a `node_modules` symlink plus Vite's
`--configLoader runner` (which avoids the `.vite-temp` write).
