# Client assets

This folder contains committed DanGG assets. The generators in `tools/original-assets/`
draw or synthesize the categories below using committed inputs. Supplied artwork is
also present; this inventory is not an independent proof of provenance for every file.
See [`docs/LICENSING.md`](../../../docs/LICENSING.md) for scope and retained notices.

| Folder | Generator | Contents |
|---|---|---|
| `sounds/` | `sounds.mjs` | Synthesised effects, voice lines in Dan's cloned voice (`voice/`), lobby music loop |
| `cards/` | `cards.mjs` | Six face sheets (13×4 grid of 122×162 cells) and ten backs |
| `squeeze/` | `squeeze.mjs` | Card-squeeze frames, inner sheets and JSON per format |
| `table/`, `tables/`, `chips/`, `reserved/` | `table.mjs` | Felts, rooms, clock digits, dealer button, chips, chip-shuffle sheet, win animation |
| `chrome/`, `login/`, `ocean/`, `ui/` | `lobby.mjs` | Header tabs and banners, login heroes, rank crests, promotion tiles, colour previews, home-feed and series art (`ui/creatives/`, 2x) |
| `fx/` | `effects.mjs` | Animated WebP table effects (jackpot intro and win, mystery box, pot win, chip shuffle) |

`chrome/logo.png` and supplied tab plates are retained artwork; `lobby.mjs` does not
regenerate them. Other supplied artwork and recorded voice takes are committed inputs.
The brand policy does not remove copyright permission needed for independent installs.

Regenerate with `bash tools/setup_assets.sh` (or one category, e.g. `bash tools/setup_assets.sh sounds`).
`tools/original-assets/manifest.json` records selected replacement targets and their dimensions or duration. It does not list every shipped file or establish redistribution rights.

Regeneration requires the app development dependencies, Chrome (`CHROME_PATH` override),
ffmpeg/ffprobe, cwebp/webpmux and macOS tools such as sips; the tab-plate Python tool
uses Pillow. System font availability can affect rendered output. The committed assets
allow normal application builds without running these generators.
