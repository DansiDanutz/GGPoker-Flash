#!/bin/bash
# Regenerate app/public/assets from the installed GGPoker client.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$HOME/Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/Game/assets"
PY="${PYTHON:-python3}"
if [ ! -d "$SRC" ]; then
  echo "Client data not found at: $SRC" >&2
  echo "Launch GGPoker once, then re-run this script." >&2
  exit 1
fi
cd "$ROOT"
mkdir -p research app/public/assets
# 1. Decode ATF textures (DXT5) used for tables/cards.
$PY tools/atf_decode.py "$SRC/card/card.atf" research/card.png
$PY tools/atf_decode.py "$SRC/table_assets/table_assets_1.atf" research/table_assets.png
$PY tools/atf_decode.py "$SRC/table_bg/normal/Tablebg_Featured_6Ring.atf" research/table_6ring.png
for c in Green Black Red Navy; do
  $PY tools/atf_decode.py "$SRC/table_bg/normal_color/Table_Holdem_ColoredBG_$c.atf" "research/table_$c.png" || true
done
# 2. Slice atlases, copy sounds/fonts/tables.
$PY tools/build_assets.py
# 3. Crop the client chrome from the lobby reference screenshot.
if [ -f research/screens/lobby_1200.png ]; then
  $PY tools/crop_chrome.py research/screens/lobby_1200.png app/public/assets/chrome
else
  echo "NOTE: research/screens/lobby_1200.png missing; chrome art not generated."
fi
echo "Assets ready in app/public/assets"
