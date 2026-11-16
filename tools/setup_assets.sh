#!/bin/bash
# Regenerate app/public/assets from the original DanGG generators in tools/original-assets.
# Generated categories are drawn or synthesised locally (headless Chrome, ffmpeg, cwebp; voice lines are recorded takes in Dan's cloned voice);
# No third-party client extraction is performed. Supplied art and voice inputs are retained;
# rendered output can vary with installed fonts/tools. Assets are committed.
#
#   bash tools/setup_assets.sh            # everything (about 8 minutes)
#   bash tools/setup_assets.sh sounds     # one category: sounds | cards | squeeze | table | lobby | effects
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run() { echo "== $1"; node "tools/original-assets/$1.mjs"; }

if [[ $# -gt 0 ]]; then
  for category in "$@"; do run "$category"; done
else
  for category in sounds cards squeeze table lobby effects; do run "$category"; done
fi
echo "Assets ready in app/public/assets"
