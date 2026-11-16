# Asset provenance and independent-release gate

## Current decision

**The complete current asset bundle is not provenance-ready for an independent
release.** The repository includes source-linked generated assets, supplied art and
unresolved inputs. Neutral OpenPoker branding and the new avatar set resolve concrete
identity/reference-avatar issues; they do not establish rights to the remaining art,
music or voice inputs.

This audit starts at commit `2b0d25ed` and records the exact bytes of this release
preparation in [`inventory.json`](../tools/original-assets/inventory.json). The
machine-readable [`audit-report.json`](../tools/original-assets/audit-report.json)
contains current counts, every unresolved path, the legacy-manifest reconciliation,
checked runtime URLs and dynamic expressions that still require review. Regenerate
the report after changes; it is a snapshot, not a declaration that later commits pass.

No contributor ownership, third-party permission, voice consent or AI-service output
right has been inferred from an author name, filename, prompt, Git commit or general
software license. This work did not add a DCO certification or erase historical files.

## Scope and evidence categories

The inventory covers every current media/font file and squeeze JSON under
`app/public/assets`, `app/public/pwa` and `app/public/openpoker`, including files not
yet staged in Git. Vite normally copies the public directory, so an unreferenced file
can still be shipped. It also records `research/brand` desktop icon inputs/outputs
and the six WAV inputs in `tools/original-assets/voice`.

Application source, historical screenshots/design references and marketing media
outside these directories are not cleared by this inventory. They can still appear
in a full source archive. `docs/screenshots` contains third-party reference images;
an independently distributed source/archive package needs its own inclusion and
rights review. Existing notices/history are preserved.

| Status | What the evidence establishes | What it does not establish |
|---|---|---|
| `generated` | A retained recipe and creation history identify the output; new avatars also pass exact source-output equality | Universal byte reproducibility, exclusive ownership, visual non-infringement or all input rights |
| `source-authored` | The drawing itself is retained as SVG without a supplied raster dependency | Legal clearance of every design choice or mark |
| `supplied-input` | A provided source, offline render or generation/crop workflow is identified | A complete permission grant or verified generation/reference record |
| `reference-derived` | Repository evidence expressly identifies derivation from reference-client content | Permission to redistribute it |
| `unknown` | A source chain or permission basis has not been established | That the file is necessarily infringing |
| `documented-permission` | Reserved for an exact-byte record linked to a retained permission document | No current file is assigned this status by assumption |

Evidence IDs link each asset to source files and, where available, the exact last
asset-change commit. Hashes bind the classification to reviewed bytes. Historical
raster/audio batches were not rebuilt for this audit; their status is based on the
retained recipe plus history, not a claim of byte-for-byte reproduction.

## Replaced reference avatars

Commit `162ae1097ff12389a1f0370abd9ee881aa61a2c5` and
[`2026-11-14-mypage-038-port.md`](designs/2026-11-14-mypage-038-port.md) explicitly say
the 20 `avatars/gg-01.jpg` through `gg-20.jpg` portraits were cropped from a
reference-client screenshot. They are a concrete provenance blocker, not merely a
suspicious filename.

Their replacement is `avatars/openpoker-01.svg` through `openpoker-20.svg`: 20 new
geometric characters drawn in [`avatars.mjs`](../tools/original-assets/avatars.mjs),
without reference images, external fonts, copied SVGs, raster inputs or network
calls. In order: Fox, Owl, Cat, Bear, Robot, Astronaut, Alien, Penguin, Jellyfish,
Octopus, Fish, Turtle, Lion, Panda, Rabbit, Frog, Eagle, Raccoon, Hedgehog and Dog.

Runtime compatibility maps saved legacy preset selections to the corresponding new
SVG. Retired JPG bytes/hashes remain documented in `inventory.json.retiredAssets`;
their removal from the current public tree does not remove or clear Git history or
reference screenshots. The generator's `--check` verifies all 20 exact SVG outputs.

## Exact unresolved inputs

Every individual path and SHA-256 is in the inventory. These are the outstanding
evidence packages; a broad statement that “all art is original” does not close them.

| Evidence ID / files | Concrete missing evidence or replacement |
|---|---|
| `table-skins`: 8 landscape WebPs, 8 portrait WebPs and 2 felt masks introduced by `1e154f9` | Original 1024px sources, creation history and rights for every skin; the commit describes cropping/mirroring/masking but retains no source or generator |
| `unknown-reactions`: `reactions/1.webp`–`12.webp` | Original outputs/sheets, generation receipts and reference-input history, edit lineage and redistribution permission |
| `unknown-brand`: `brand/creator.webp`, `creator-lg.webp`, `favicon.png`, `og-card.jpg`, and 4 older `pwa/*.png` | Source portrait/logo/trophy inputs and permissions; the new OpenPoker identity is available for independent branding |
| `unreviewed`: `table/ui/ic-show-card.webp` | Source image/sheet or drawing recipe and redistribution basis; commit `c110c08` adds the file without that record |
| `supplied-plates`: 16 `chrome/tab_*.png`, `chrome/logo.png`, `brand/logo.png`, `brand/logo-animated.gif` | Original logo/transition GIFs, generation/source records and redistribution permission; `tab-plates.py` only repaints labels on supplied art |
| `supplied-desktop`: `research/brand/gg-mark.png`, `AppIcon.png`, `AppIcon.icns` | Rights to the supplied wordmark fragment; `app-icon.mjs` generates its tile from that fragment, so this is not independent-source evidence |
| `supplied-voice`: 6 `voice/*.wav` inputs and 6 `sounds/Voice*.mp3` outputs | Speaker consent, source-recording rights, model/provider terms and redistribution permission; VoiceStudio seed/profile metadata does not establish these rights |
| `supplied-music`: `music/DanGG-Lobby-Loop.{ogg,m4a}` | Composition and sample/input rights, creation-service terms if applicable, and redistribution permission; retained masters are under `marketing/lobby-loop` |
| `supplied-phone-oval`: `tables/skins/portrait/phone-oval.webp`, `table/ui/btn-dark.webp` | David's original supplied outputs, reference/input provenance, crop/edit recipe and redistribution permission |
| `supplied-table-ui`: 65 WebPs introduced in `9624151` | Generated source sheets, output receipts/reference inputs and crop recipe; the commit says pieces were cut from sheets that are not retained |
| `supplied-login`: 6 login WebPs | Source outputs and provenance tied to retained [login prompts](designs/login-art-prompts.md) |
| `supplied-hero`: 6 hero WebPs | Outputs/receipts, reference inputs and redistribution permission tied to [hero prompts](designs/home-hero-art-prompts.md); commit says Dan generated them in ChatGPT |
| `supplied-promo`: 8 promo WebPs | Outputs/receipts, reference inputs and permissions tied to [promotion prompts](designs/promo-card-art-prompts.md) |
| `supplied-lobby`: 14 menu icons and 55 later UI WebPs | Original sheets/images for steps 4–10, receipts/input history and crop lineage tied to [lobby prompts](designs/lobby-art-prompts.md) |

AI generation is recorded as a workflow when repository evidence supports it. It is
not proof of ownership, absence of reference copying, or permission to use a third
party's likeness, trademark, artwork, sample or voice.

## Legacy manifest versus current runtime

`tools/original-assets/manifest.json` has 481 legacy replacement targets. At the
starting tree, 438 existed and 43 were absent: **38 sound targets and 5 SWF files**.
The 675 media/JSON files then under `app/public/assets` included 237 not listed in
that manifest. Historical byte counts are not current output hashes.

The missing legacy sounds are not selected by the current sound catalog;
`sounds.mjs` intentionally generates only filenames referenced by `sound.ts`.
Lobby music moved to `music/`. Flash effects were replaced by `fx/*.webp`.
None of those 43 filenames occurred in the current non-test runtime at the initial
audit. They are stale replacement targets, not 43 demonstrated runtime failures.
The distinct seeded URL `/assets/chrome/spin.png` was a real missing literal
reference. The seed now uses `/assets/slots/olympus-gold.svg`; an exact-value database
migration updates existing banners. The checker records the old migration input
separately and still verifies the replacement URL.

The checker verifies local literal URLs, simple literal directory constants,
sound/creative basename catalogs, the shared numbered-avatar registry, bounded
dynamic families and paths inside the
four squeeze JSON files. It reports remaining dynamic expressions rather than
claiming to execute arbitrary templates. User uploads, custom database banner URLs,
external URLs and every possible future dynamic expression require separate checks.

## Commands and review workflow

```sh
# Inventory/hash coverage and bounded local-reference checks (normal CI gate).
node tools/original-assets/audit-inventory.mjs --check

# Same checks, plus a current reconciliation/report.
node tools/original-assets/audit-inventory.mjs --check --write-report

# Independent-release provenance gate: intentionally nonzero while blocked.
node tools/original-assets/audit-inventory.mjs --release

# Reconcile intentional additions/changes/removals. Changed/new bytes become UNKNOWN.
node tools/original-assets/audit-inventory.mjs --refresh --write-report

# Rebuild and verify source-native avatars.
node tools/original-assets/avatars.mjs
node tools/original-assets/avatars.mjs --check
```

`--refresh` never upgrades evidence from a filename or author. A reviewer must add
the specific source/permission record and assign the justified status to the new
hash. Removed records move to `retiredAssets`; review that retirement rather than
using refresh to conceal accidental deletion. The release gate accepts retained
source-linked generation, source-native artwork or documented permissions. It is a
provenance control, not a legal certification of the complete product.

New OpenPoker PWA/social PNGs derive from `app/public/openpoker/*.svg` through
[`brand-icons.mjs`](../tools/original-assets/brand-icons.mjs). It needs optional
`sharp` asset tooling resolvable from Node (available in the audit runtime); normal
application builds use committed PNGs and require no asset-tool installation.
SVG text uses system fonts, so raster typography may vary by platform. Maskable
and Apple icons have opaque backgrounds; the central spade fits the maskable safe
region. Exact generated bytes are retained in the inventory.

## Feasible source-generated web profile

A generated-only web build is feasible but **not implemented merely by changing the
logo**. A bounded follow-up could use an explicit public-asset allowlist and:

1. Keep the new identity/avatars; use text/CSS for menus and controls.
2. Use retained card/squeeze/table/chip/effect recipes and the source-native phone
   SVG table; replace unresolved desktop skins/masks with a source drawing.
3. Use original PNG creative recipes or text cards instead of supplied promotional
   WebPs; hide optional reactions until a source-native pack exists.
4. Ship the 32 synthesized effects, with supplied voice and lobby music omitted by
   an explicit profile choice and no requests for the omitted files.
5. Exclude unresolved files from the **output bundle**, update runtime references
   and fallbacks, and test login, lobby, tables, profile selection, PWA install and
   sound previews. An allowlist without fallbacks would create broken images/audio.

That profile still needs code/design, dependency, notice and source-archive reviews
outside this bounded asset inventory. Optional artwork can return only with
exact-file evidence or independently created replacements.
