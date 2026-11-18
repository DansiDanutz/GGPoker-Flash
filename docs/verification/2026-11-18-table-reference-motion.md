# Table motion reference — 18 November 2026

## Reference and scope

The user's PhoneExplorer recordings are the reference, not the generated
card-grip clip. `Recording-2026-11-17_20-59-52.mp4` shows card inspection around
01:37–01:57 and the tools drawer around 02:00–02:04.

The physical Samsung demonstration on 18 November provided the clearer reference:
`Recording-2026-11-18_16-20-18.mp4`, with a two-board result around 00:33–00:47
and corner inspection around 00:48–00:51. The user operated the phone. The user
confirmed that three boards should follow the same sequence as the captured two.
The recordings remain local reference evidence; no third-party video or artwork
was added to the application.

Latest card-motion reference: the newest PhoneExplorer artefact links
`Recording-2026-11-18_17-11-15.mp4` (158.39 seconds). The K-clubs / 4-hearts
inspection around 00:49–00:52 was inspected at native consecutive frames,
including the slow initial bend, first rank, lateral second-rank reveal and hold.
The pair bends while stacked; the lower card separates only afterward. The face
belongs to the lifted surface, not to an extra layer below a detached flap.

## Implemented

The later [3D squeeze verification](2026-11-18-3d-card-squeeze.md) supersedes the
Hold’em PNG path below on WebGL devices; the 61-frame art remains the fallback.

- Rebuild the original DanGG Hold'em squeeze geometry as an inclined, overlapping
  pair with a curved, perspective-projected reveal, retaining the existing 61-frame renderer.
  Both backs are drawn before their lifted faces; face masks hide the lower rank
  until the pair separates, and prevent glyphs drawing over the upper face.
  The generated face masks display the player's actual rank and suit; the art
  keeps DanGG's green/gold backs. The Open control sits above the near corner.
- Use the same inspection component at cash and tournament tables. Touch release
  returns a partial peek to closed; mouse hover remains a desktop interaction.
- Keep Chat and Emoticons in a bottom drawer. Opening raises the play surface and
  betting controls; swipe down closes the drawer and its popovers. Horizontal
  drags do not toggle it, and keyboard activation remains available.
- Resolve multi-board presentation sequentially: highlight board 1 and its
  winner(s), transfer its individual pot shares, then highlight/pay board 2 and
  board 3. Other boards dim while the selected board is being awarded.
- Show the undistributed net pot during the sequence. Suppress the aggregate
  win-event transfer for multi-board results so it cannot animate a second payment.
  Repeated snapshots do not restart the awards. Reduced-motion mode shows award
  amounts at the recipient without chip movement.

These are presentation changes. The server remains authoritative for settlement;
no credit, rake, ticket, prize or chip-ledger mutation was added.

## Reproducible verification

Use the existing app dependencies and disposable loopback sandbox. Run from `app/`:

```sh
node --test server/*.test.js
pnpm exec tsc --noEmit -p tsconfig.json
pnpm build
ARTIFACTS_DIR=<scratch>/controls node tools/table-reference-browser-smoke.mjs
ARTIFACTS_DIR=<scratch>/boards node tools/run-it-awards-browser-smoke.mjs
```

The controls rehearsal uses six authenticated disposable players at both cash
and tournament tables. It checks 390px and 320px layouts, real touch events for
partial peek/release, drag and Open, and the drawer/popovers. Screenshots capture
closed, partial and open card inspection. A pixel comparison also verifies that
changing the lower card cannot affect the first peek, while both supplied ranks
become visible at their appropriate stages.

The board rehearsal uses engine-generated two-/three-board results, including
shared wins, six/nine seats and reduced motion. It injects both the win event and
repeated snapshots, observes each emitted payout, checks highlight order and
remaining-pot amounts, then checks layout at 320, 390, 430 and 844px and next-hand
cleanup. The geometry unit test covers all 61 frames, overlap, inclination and
preservation of the diagonal reveal.

The original board-focus assertion failed before the correction. The new squeeze
geometry assertion likewise failed against the former upright side-by-side fan.
Final commit-bound results and screenshots are retained outside the source tree
and summarized in the public PR. Use `ARTIFACTS_DIR` to choose a local evidence directory.

To regenerate just the original Hold'em art from the repository root:
`SQUEEZE_FORMAT=holdem node tools/original-assets/squeeze.mjs`.
Omaha art and its existing renderer are retained.

## Remaining limits

- The 3D follow-up has a physical Samsung rehearsal; final user visual acceptance
  and broader device coverage remain pending (see the linked 3D evidence).
- A physical three-board result was not captured. Three-board presentation is
  tested with engine-generated results, following the user's explicit direction.
- This is a behavioral/visual adaptation with original DanGG art, not a claim of
  pixel-identical proprietary rendering.
- Public merge and production release require separate approval. This promotion
  contains reviewed shared changes; operator branding and private history are excluded.

No production deployment, service-credit charge or live chip balance mutation
was performed for these checks.
