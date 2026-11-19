# Desktop Emerald review — local only

## Agreed scope

- Mobile stays portrait-only, including tables. A rotation guard hides and makes the underlying app inert without unmounting it. Physical screen orientation avoids blocking login when the keyboard reduces viewport height.
- Optional mobile landscape is a deferred creator opportunity, not an implemented marketplace listing.
- Desktop uses the supplied Emerald Royale artwork with live DanGG branding, names, avatars, stacks, flags and game controls.
- The supplied player-widget sheets guide transparent CSS frames. No sheet background or example portrait replaces a player's own avatar.
- No production changes, purchases, credit posting, PR merge or deployment.

## Implementation

The default wide table uses the measured 1372 × 614 cushion bounds from the supplied 1448 × 1086 PNG. Other skins retain their original geometry; portrait geometry is unchanged. The frame palette represents normal, active turn, folded, all-in and winner states. Actions remain conditional on the player's turn. Desktop presets and sizing controls share the row above Fold, Check/Call and Raise.

## Verification

- 58 focused orientation, phone-layout/navigation, table-geometry and login-art tests passed.
- TypeScript `tsc --noEmit` passed.
- Vite production build passed; existing bundle-size warning remains.
- Native DanGG desktop app connected to the disposable local sandbox, via a local 5199 → 61142 proxy. Separate review profile; no production account/balances.
- At 900 × 640, live Play Money action controls were measured within the viewport: opening presets and 50%/75%/100% presets, range input, numeric amount, decrement/increment and all three actions were visible. Raise no longer wrapped onto a separate row.
- DOM fixture verified all five frame accent states against the shipped CSS; this is a presentation check, not new payout evidence.
- Earlier physical Android portrait → landscape → portrait check preserved the page and restored interaction. The subsequent physical-orientation/keyboard refinement has unit coverage; its final physical-device rerun remains pending after the user moved the review to desktop.

Local evidence: `/Volumes/XS1000/Work/dangg-motion-review-20261118/` (`desktop-controls.png`, `emerald-frames-review.png`, `layout-tests.log`, `desktop-build.log`). Screenshots are transient captures, not proof of every hand state.

## Resize regression

Desktop pointer/native-app detection keeps the wide layout below the former 760px breakpoint. The obsolete tablet rotation overlay and its CSS were deleted. Narrow desktop windows retain Emerald artwork and compact widgets; phones keep their portrait layout. Native window checks at 600, 760, 761, 900 and 1200px confirmed the wide stage, Emerald asset and absence of the obsolete overlay. A 360px screenshot was also inspected; this compact desktop size remains visually dense. Typecheck, 58 focused tests, build and diff whitespace checks passed. Resize screenshots are local `/tmp/dangg-resize-*.png`; the 360px capture is `/tmp/dangg-360-new.png`.

## Remaining review

- User visual approval, desktop tournaments/multiple boards and full squeeze interaction with the revised frames.
- Final Android rotation/keyboard rerun and iOS hardware check.
- Broader application regression/CI before any merge. The existing table-reference browser smoke still needs its obsolete inspect-cards selector adapted to the new reveal toggle.

Generated storage: about 57 MiB build output and 57 MiB disposable desktop profile on XS1000, plus bounded screenshots; the source PNG adds approximately 1.9 MiB. Existing checkout/dependencies/sandbox were reused.

## Shared mobile/desktop asset pass

The supplied clean card, pristine chip and graphite utility sheets are used as CSS sprite windows in `table-emerald-assets.css`; PNG alpha is retained. Action/control sheets guide live CSS borders and gradients rather than baking English labels or amounts into controls. Rounded player plates also apply to portrait. Existing SB/BB dots, PokerCraft/eye positioning, turn gating, and amounts/BB interaction are retained.

86 targeted tests passed (phone geometry/navigation/orientation, squeeze, reactions, hand clearing and all-in action visibility); TypeScript and production build passed with the existing bundle-size warning. Native desktop artwork was inspected. A separate 390 × 844 touch-browser preview using only the disposable local sandbox session rendered the portrait stage without horizontal document overflow. This is not a physical phone gesture test or proof of every earlier mobile UX request. Remaining device review includes reveal/particle continuity, swipe drawer, betting interactions and showdown across cash and tournaments. No merge/deployment. Added source assets: 4.5 MiB; existing build output reused.

## Readability audit — 19 November

Baseline defects reproduced: outlined username text, folded identity opacity .6, compounded avatar fade/brightness, multiple winner overlays, and a decorative squeeze felt image. Removed the outlined text and compounded dimming, restored folded identity opacity, removed atmosphere layers and the squeeze felt image, and reduced winner decoration to an outline plus a solid award label. Opponent award labels sit below plates to avoid covering revealed ranks. Essential board/payout timing is unchanged.

Reference: W3C WCAG contrast minimum (https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum) and animation from interactions (https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions). Solid palette ratios: identity 15.80:1, award 13.35:1, secondary profile text 8.91:1. These are palette measurements, not a full accessibility certification or a guarantee of fatigue-free use.

51 focused tests and TypeScript passed. The disposable WebGL browser smoke passed actual-card occlusion, free/default isolation, lost/unavailable-context fallback, one completion, repeated disposal and reduced-motion Open with no page errors. Evidence: `clarity-squeeze/results.json` under the existing local review directory. Mobile 390×844 inspection confirmed no horizontal overflow and no username text shadow. Full cash/tournament interaction rehearsal remains open: the older reference harness uses the removed `.inspect-cards` trigger and must be updated to the current automatic-reveal flow before its results can be claimed.

The user clarified that EGM (Google Elephant–Goldfish Model) is intended. The installed plugin was used for the targeted fresh-context reviews below. No new skill installation or production change.

## EGM remediation contract

EGM is the installed Google Elephant–Goldfish Model workflow. This pass used fresh-context design, implementation-readiness and codebase reviewers, not the complete five-stage document pipeline. Their reports and the clone reference map are in this directory.

Goals: readable identities and controls; stable portrait mobile and wide desktop layouts; no critical labels obscured by decorative assets; correct reveal lifecycle across hand changes. Non-goals: production release, new purchases, changed settlement rules, exact native parity, or certifying fatigue-free use.

Theme ownership: `table-emerald-assets.css` owns the shared final palette and control artwork; `table-desktop.css` owns desktop geometry/artwork; portrait files own phone geometry. Shared theme import follows layout styles. CSS-only controls preserve live labels; baked English action sprites were rejected because amounts/localization would diverge. A new layout framework and wholesale asset replacement were rejected because existing geometry can be corrected without new dependencies. Landscape mobile remains deferred.

Remediation allowlist: `TablePage.tsx` (spectator semantic class; hand-keyed reveal cleanup), `table-emerald-assets.css` (spectator layout/theme), `table-desktop.css` (remove duplicate control cosmetics), `game/tableStage.ts` (compact edge margin), `main.tsx` (theme import grouping), and `tools/table-reference-browser-smoke.mjs` (current reveal flow and approved readable-surface checks). Existing prior-turn changes are retained.

Acceptance matrix: touch portrait at 320×640, 360×740, 390×844, 430×932; fine-pointer desktop at widths 360, 500, 600, 760, 761, 900 and height 640, normal browser zoom. Spectator status must not intersect action buttons; buttons must remain inside the viewport; names/stacks must retain full opacity. Desktop nine-seat fixtures must remain inside horizontal bounds after ResizeObserver updates. Actual cash/tournament turn, chat/emoticon drawer, automatic reveal, particle completion and timeout remain separate integrated checks; mathematical geometry or a renderer smoke alone cannot mark them complete.

Cards may intentionally cover avatars, but not essential identity text or action controls. The design review's screenshot describes a lower-right spectator opponent as the hero; that identification is contested because the supplied screenshot was an observer view. The broader occlusion requirement is accepted and still requires active-hero state checks.

## Latest EGM verification status

The earlier pending obsolete-trigger note is superseded: the reference harness now tests fresh-hand automatic reveal in cash and tournaments and passes. Its direct renderer/pixel companion remains separate. The EGM resolution report records current evidence and limitations. Portrait hero placement now uses x=20% to preserve a visible inset at 320px; compact desktop reserves at least 60px for edge widgets. Physical-device verification and multi-board payout-barrier coverage remain open.

## Desktop parity follow-up — 19 November

The mobile release is deployed at public commit `c2d4e4c`. The follow-up keeps portrait geometry and styling intact. Desktop styles follow the actual wide stage, default faces reuse mobile-style indices without edge shadows, and controls/tools occupy separate footer rows. Compact Emerald windows use deeper felt and a single seat scale; the legacy responsive transform must not multiply that scale. Other table skins retain their original geometry.

A retired WebSocket's delayed close handler could overwrite the connected state of its replacement. The close handler now ignores retired sockets. A regression test executes that handler for both retired and current connections; the native local app displayed Connected after reloading. This is not a claim that every network-failure path has been requalified.

The disposable desktop fixture covers six/nine-seat cash and tournament presentation at 360, 500, 600, 760, 761, 900 and 1200px. It checks turn-only betting, card/identity and control/identity intersections, viewport bounds and effective identity font size including transforms. Tournament layout fixtures do not prove tournament settlement. The existing engine-generated multi-board harness now also runs on desktop, checking two/three boards, tied winners, sequential highlights, chip-flight recipients and amounts exactly once, remaining pot, local outcome markers and final award-label clearance. CI retains screenshots and results from both desktop suites.

Evidence before the final readability adjustment: 1,455 server tests and TypeScript passed; desktop multi-board suite passed nine cases; mobile cash/tournament reveal and timeout regression passed at 390×844 and 320×700. The added landscape regression confirmed an inert underlying application and restoration of the same table in portrait. Final CI must validate the committed combined change. Local evidence is in the existing review directory (`desktop-parity-full-server.log`, `desktop-awards-labels-v2`, `desktop-mobile-rotation`, `desktop-readable-final`).

Targeted fresh-context EGM implementation review found no concrete code blocker, while retaining runtime and broader visual coverage gaps. This is not the complete five-stage EGM pipeline or an accessibility/fatigue certification. Remaining full-goal verification includes native desktop reveal interaction, sustained reconnect behavior, and release verification after promotion. No new live charges are part of this work.

Final compact-layout follow-up: the 28-case suite passed with effective identity text of at least 11px and independently visible hero card ranks (`desktop-card-clearance`). Paired upper seats are raised four percentage points to clear diagonal cards. Intrinsic card-group width prevents flex compression from hiding one hole card. The 27 geometry/socket tests passed; the nine-case payout suite passed after the seat adjustment (`desktop-awards-final`) and is being repeated after the intrinsic-width correction. No desktop release is claimed by these local results.
