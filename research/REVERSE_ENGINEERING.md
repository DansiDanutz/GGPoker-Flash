# Reverse engineering the GGPoker desktop client

This document records the evidence trail used to rebuild the local clone. It distinguishes what was
**observed** in shipped artifacts from what was **inferred**, and lists what remains unknown.

## 1. Target identification

| Item | Observation |
|---|---|
| Installed launcher | `/Applications/GGPoker.app` — Cocoa/AIR launcher, bundle id `com.nsuslab.ncf.launcher.live.ggpcom`, executable `GGPCOM`, 11 MB |
| Launcher config | `Contents/Resources/launcher_config.json`, `url_config.json` (portal + CDN + update endpoints), `stringtable.json` (32 install languages) |
| Installed client | `~/Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/` (1.4 GB after first run) |
| Runtime | `Loader/GGPoker.app` — **Adobe AIR** app (`Adobe AIR.framework`, `IronANE.framework`, `LockneANE.framework`) |
| Game binary | `Game/51/IronDesktop.swf` — 41,834,634 bytes, signature `FWS`, SWF version 51 (AIR SDK 51) |
| Game data | `Game/assets/` — 69 asset groups, 1.4 GB: atlases, JSON, ATF textures, SWF modules, MP3, fonts |
| Localisation | `Game/assets/languages/string_table.json` — **11,632 keys** × 32 locales (17.3 MB) |
| Donor app | `Game/37/IronDesktop.swf` — identical size/hash, previous build slot |

No network calls were made to GGPoker servers. Static inspection plus the shipped client assets were
sufficient for the reconstruction. (The client was running while the lobby screenshot was captured;
no table was opened with the real account.)

## 2. Decompilation

FFDec 26.4 (portable JRE 21, both under `tools/`) was used:

```bash
java -Xmx6g -jar tools/ffdec/.../ffdec.jar -onerror ignore \
  -export script,image,binaryData,sound,font,shape,sprite research/swf_export \
  "$HOME/Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/Game/51/IronDesktop.swf"
```

Result: **8,694 ActionScript classes** (60 MB of `.as`), 359 embedded sounds, fonts, shapes.
Export completed in ~14 s.

Key namespaces (class counts):

| Package | Classes | Contents |
|---|---|---|
| `com.nsus.iron.table` | 1,842 | table view, seats, cards, dealer, betting, hand history, side games, casino table games |
| `com.nsus.iron.lobby` | 1,095 | lobby header/side/top/footer, content pages, tournament lobby, group view, animations |
| `com.nsus.iron.controller` | 508 | command/mediator layer |
| `com.nsus.iron.services` | 393 | network service clients |
| `com.nsus.iron.popup` | 210 | all popup windows |
| `com.nsus.iron.components` | 310 | shared Starling UI components |

Notable classes inspected:

- `lobby/view/LobbyView.as` (window composition, 1200×961 layout, table layer at `(160,144,600,424)`).
- `lobby/view/top/LobbyTopMenuBar.as` (44 px top menu, 36 px pills, animated active indicator,
  ribbon with `common:348/349/350` nine-patch + wings).
- `lobby/view/content/LobbyContentView.as`, `Home.as`, `LobbySideView.as`, `LobbyFooterView.as`.
- `view/lobby/PageType.as` — the complete feature map (98 page types: AOF, Hold'em, PLO, Short Deck,
  Spin & Gold, Battle Royale, Cashier, GGPass, Fish Buffet, Responsible Gaming, …).
- `data/TourneyTab.as`, `data/CasinoMenu.as`, `Populate` of tournament/casino tabs.
- `table/*` — table state machine, seat assets, hand history, jackpot boards.

## 3. UI taxonomy recovered from `PageType.as`

`AOF`, `HOLDEM`, `OMAHA`, `RUSH`, `SIX_PLUS_HOLDEM` (Short Deck), `SPINANDGOLD`, `FLIPANDGO`,
`BATTLE_ROYALE`, `WSOP_EXPRESS`, `GGMASTERS`, `TOURNEY` (+ main/staking/players/satellites),
`SIDE_GAME`, `CASHIER`, `VIP_AREA`, `OPTION_*` (my page, promo, weekly mission, fish buffet,
settings, theme, betting, buy-in, auto rebuy, sound, time bank, avatar, language, hotkeys,
responsible gaming, display currency, streamer mode, prop bet, security),
`MY_TOURNAMENTS`, `LEADERBOARD`, `HAND_HISTORY`, plus promotion-specific pages
(Honeymoon, GG Care, Ocean Rewards, Daily Freebie, Valentine, WSOP, Snake Hongbao …).

The clone implements the primary client journey across these areas; niche regional/market pages
(e.g. Danske/DanskeSpil compliance, OlyBet, CZ panic button, NetEnt/PlayTech webview providers)
are represented by the Settings/Responsible-Gaming surfaces rather than separate market builds.

## 4. Asset extraction pipeline

All in `tools/`:

1. **`build_assets.py`** — slices `init_lobby/desktop_assets.{png,json}` (4,096², 4,925 frames)
   into `app/public/assets/atlas/` (**3,564** non-empty PNGs), copies sounds (73 MP3),
   `lobby_top_menu` localised title art, card atlas metadata and decoded table art.
2. **`atf_decode.py`** — Adobe Texture Format decoder. The files are versioned headers + raw DXT5
   (ATF format 5). Header parse: `'ATF'`, version-at-`0xFF` variant, 16-byte header, texture at
   offset 20, DXT5 4×4 blocks with 8-byte alpha + 8-byte colour. Decoded:
   `card.atf` (2,048×1,024 card faces/backs), `table_assets_1.atf` (seat rings, buttons, chips,
   `WIN` art, timers), `table_bg/normal_color/*.atf` (table ovals / room backgrounds).
3. **`contact_sheet.py`** — labelled sheets for identifying atlas frames by eye.

Asset highlights reused verbatim in the clone:

- `chrome/logo.png` — original `PLAY GG.RO` lockup (background keyed to alpha).
- `chrome/tab_*.png` — the eight game-tab artworks, cropped 1:1 from the live lobby at 1×.
- `chrome/promo.png` — Daily $100,000 Flipout banner.
- `sounds/*.mp3` — all 73 client sounds incl. `SoundDealCard`, `SoundBet/Raise/Call/Fold`,
  `SoundWinPot`, `SoundAllIn`, `NotificationTime*`, `Voice*`, `BgmLobby`.
- `Roboto-Bold.ttf`, `RobotoCondensed-*.ttf` — exported from `Game/assets/font/font.swf`.
- `tables/*.png` — decoded table textures.

## 5. Lobby measurement / layout evidence

A 2560×1080 screen capture of the running client was cropped to the window (`1200×961`) and used as a
pixel reference: title bar 38 px, header 58 px, game tab bar 57 px, promo 143 px, table rows 36 px,
side panel 206 px, right rail 146 px. Colors sampled: background `#171717`, rows `#1e1e1e/#232323`,
selected row `#3c1616`, accent red `#b21f2d`, gold `#e7b64b`. The clone reproduces these metrics
and uses the original sprites/fonts.

The reference capture is at `research/screens/lobby_1200.png`.

## 6. Behaviour inferred (not directly observed)

Because inspecting a live cash table with the real account was out of scope, the following were
**reconstructed from the decompiled table classes and the shipped table asset kit**, then
implemented:

- betting UI composition, seat ring/avatar plate ordering, pot/board placement;
- action bar and slider, all-in and win presentations;
- Spin & Gold wheel flow (`SoundSngWheel*`, `MegaSpin*` strings);
- side-pot and showdown presentation;
- animations and timings (approximated from the client's Tween constants and sound cues).

The clone's poker rules follow standard NLHE/PLO/Short-Deck rules; they are not claimed to match the
server's hidden variant parameters (rake caps, run-it-twice policy, straddle rules, time-bank values).

## 7. Unknowns / limitations

- The real server protocol (binary/AMF or JSON over TCP) was not reverse engineered; the clone uses
  its own REST/WebSocket protocol and local SQLite.
- Exact live data (player counts, jackpot, tournament schedule) is seeded/simulated; the admin
  console can change it.
- Some market-specific compliance screens (Danske, CZ, OlyBet, Denmark) and third-party casino
  provider webviews are not reproduced as separate builds.
- Embedded SWF UI scenes (vector dialogs) were not re-rendered; equivalent DOM/CSS dialogs are used.

## 8. Evidence index

| Path | What it is |
|---|---|
| `research/swf_export/scripts/` | 8,694 decompiled ActionScript classes |
| `research/swf_export/sounds/` | 359 embedded SWF audio definitions |
| `research/fonts/` | 13 fonts exported from `font.swf` |
| `research/screens/lobby_1200.png` | pixel reference of the running client |
| `research/screens/desktop/` | screenshots of the packaged clone |
| `app/public/assets/atlas/` | 3,564 sliced original sprites |
| `app/public/assets/atlas_manifest.json` | frame geometry manifest |
| `tools/atf_decode.py` | ATF/DXT5 decoder |
| `tools/build_assets.py` | asset extraction pipeline |
