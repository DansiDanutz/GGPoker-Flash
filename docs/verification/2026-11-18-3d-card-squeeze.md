# 3D card squeeze: recording, model and device verification

The subsequent [optional plugin integration](2026-11-18-squeeze-plugin.md) keeps
the free 2D inspector as default and gates 3D behind an explicit Play Money
preview or active paid access. The renderer evidence below remains applicable.

## Reference and scope

The reference is the user's PhoneExplorer video
`Recording-2026-11-18_17-11-15.mp4`, especially the consecutive native frames
00:49–00:52: the pair bends while stacked, K-clubs appears first, then lateral
separation reveals 4-hearts. Earlier PNG outline/glyph animation did not deform
the printed face with the card. That renderer remains the compatibility fallback.

Hold'em inspection now uses the same lazily loaded Three.js renderer in the
shared cash/tournament squeeze panel. Original DanGG green/gold backs and face
art are retained. The 3D module is loaded on inspection, not at initial login.
Omaha continues using its existing renderer. No settlement, rake, payout or
service-credit logic is changed.

## Physical model and limitations

- Each card has a subdivided continuous surface, two printed sides and a thin rim.
- A cylindrical bend preserves material arc length. Its tangent joins the flat
  sheet and lifted end continuously. Surface normals, texture coordinates and
  shadows follow the deformed geometry, so ranks are not separate moving labels.
- Stock thickness is 0.24 model units; the second mid-surface is offset 0.55 units
  along the normal. Separation slides along the bend axis, preserving the gap.
- Gesture pressure moves the bend across the sheet before lateral reveal. Release
  eases back; Open completes the reveal. Reduced motion avoids the tween.
- This is a constrained, inextensible bending model calibrated visually against
  the recording, not a finite-element solver or a measurement of real card stock.
  It does not simulate arbitrary creases, finger forces or card collisions outside
  the controlled squeeze path. It is not a pixel-identical copy of GGPoker.

The WebGL canvas renders at 652×484 and composites into the existing table canvas.
No persistent animation loop runs when the gesture is idle. Context loss,
unsupported WebGL and renderer setup failure retain the 2D fallback. Assets load
before GPU allocation; unmount disposes geometry, materials, textures, shadows
and the WebGL context. The two specialist skills used were CloudAI-X's
`threejs-geometry` and `threejs-shaders`; skills are developer guidance and are
not shipped with the application. Three.js 0.187.0 is pinned with its MIT notice.

## Reproduce

From `app`, using existing dependencies:

```sh
node --test server/squeeze-surface.test.js server/client-logic.test.js
pnpm exec tsc --noEmit
pnpm build
ARTIFACTS_DIR=<scratch>/3d node tools/squeeze-3d-browser-smoke.mjs
ARTIFACTS_DIR=<scratch>/tables node tools/table-reference-browser-smoke.mjs
```

The prototype is development-only at `/tools/squeeze-3d.html` on the local Vite
server. It uses fixed disposable K-clubs / 4-hearts, not account balances. Drag,
release, Open and Reset exercise the same motion controller as the table panel.
The slider allows inspection of intermediate deformation states.

For a connected, explicitly selected Android device, forward Chrome's debug
socket to local port 9223, then set `PHONE_DEVICE_SERIAL=<serial>` on the table
smoke command. It creates its own disposable sandbox, reverses only that
sandbox's ports, opens its own Chrome tab, and removes that tab/port mappings at
completion. It does not close the user's other phone tabs. Phone layout checks
allow less than one CSS pixel of fractional rounding.

## Evidence

Device recordings and local results are retained by the reviewer outside the source tree.
Reproduce browser evidence with the commands above and an explicit `ARTIFACTS_DIR`.

- Three geometry tests verify no material stretching, flat/anchored rest state,
  and constant stock thickness/inter-card normal separation.
- `3d-browser-final/results.json`: actual 3D pixel comparison reports zero changed
  channels when only the hidden card changes; first and second revealed identities
  change 2,426 and 1,970 channels respectively (channel threshold >2).
- Browser checks cover real `WEBGL_lose_context` fallback, unavailable WebGL,
  one completion, async unmount, eight repeated mount/dispose cycles with lost
  contexts after disposal, and reduced-motion Open.
- Physical Samsung SM-S926B / Android Chrome 157: PhoneExplorer short upward drag
  returned the card to flat; longer drag revealed both cards without page scroll.
  Recording: `Recording-2026-11-18_17-40-13.mp4`.
- Physical phone, 120 requestAnimationFrame samples while moving forward/back:
  median frame interval 16.7 ms, P95 16.8 ms. Direct render CPU median 5.1 ms,
  P95 5.9 ms. Including the table's 2D compositing step: median 7.3 ms, P95 9.3 ms;
  frame interval remained 16.7/16.8 ms. These are short-run measurements on this
  phone, not a guarantee for every device or a GPU timing benchmark.
- `3d-phone-tables-final/`: disposable six-player cash and tournament rehearsal on
  the physical phone, including the WebGL renderer assertion, touch peek/release,
  Open, drawer and 390px/320px viewports. Final outcome is recorded in results.json.

Commit-bound QA and CI results belong to the exact public PR head and are recorded
in its review. No production deployment or live charge is part of this test.

## Remaining acceptance

The user should compare the recorded prototype with the original for final visual
acceptance. iOS Safari, low-end Android devices, prolonged thermal load and
arbitrary-force physical simulation are not verified by this rehearsal.
