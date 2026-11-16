# Client assets and provenance

This directory contains generated drawings/audio, supplied artwork and files whose
source permissions still need evidence. A file being committed, AI-generated or
covered by a brand policy is not proof of third-party clearance.

The current hashed inventory is
[`tools/original-assets/inventory.json`](../../../tools/original-assets/inventory.json).
Read [`docs/ASSET-PROVENANCE.md`](../../../docs/ASSET-PROVENANCE.md) for exact unresolved
inputs, the retired reference-avatar record and the release gate. The software
license is described in [`docs/LICENSING.md`](../../../docs/LICENSING.md).

| Family | Recorded source |
|---|---|
| `avatars/openpoker-*.svg` | Original geometric drawings in `avatars.mjs`; exact output verification with `--check` |
| `cards/`, `squeeze/` | SVG/geometry recipes in `cards.mjs`, `squeeze.mjs` and their helpers |
| Older `table/`, `tables/`, `chips/`, `reserved/` PNGs | `table.mjs` and its drawing helpers; this does **not** cover later table skins or `table/ui/` artwork |
| Older `chrome/`, `ocean/`, `ui/` PNGs | `lobby.mjs` and its helpers; supplied logos/tab plates and later WebP art have separate records |
| `slots/*.svg`, `fx/*.webp` | `tools/slot-art.mjs` and `effects.mjs` |
| 32 non-voice `sounds/*.mp3` | Deterministic recipes in `sounds.mjs`, `sound-table.mjs` and `sound-fx.mjs` |
| Six voice MP3s | Processed committed WAV takes; consent/model/source-rights evidence remains open |
| `music/`, logos, tab plates, later 3D artwork | Supplied inputs; see the inventory rather than assuming a local generator exists |

Normal application builds use committed files; they do not run the generators.
Regenerate supported legacy categories with `bash tools/setup_assets.sh` (or a named
category). Those tools require app development dependencies and platform tools such
as Chrome, ffmpeg, cwebp/webpmux and, for some steps, macOS `sips`. System fonts can
change rendered output. `tab-plates.py` edits supplied plates and does not originate
their underlying art. Lobby music is not synthesized by `sounds.mjs`.

`tools/original-assets/manifest.json` is a **legacy replacement-dimension manifest**,
not a full inventory: it still contains retired sound/SWF targets and omits later
assets. Its byte counts describe historical inputs, not a current integrity check.
Do not regenerate missing legacy entries merely to make its path list complete.

From the repository root:

```sh
node tools/original-assets/avatars.mjs --check
node tools/original-assets/audit-inventory.mjs --check
node tools/original-assets/audit-inventory.mjs --release
```

The last command deliberately fails while unresolved supplied/unknown assets remain.
It checks provenance readiness, not whether the poker application builds or plays.
