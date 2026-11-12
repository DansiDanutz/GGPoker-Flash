#!/bin/bash
# Regenerate app/public/assets from the original DanGG generators in tools/original-assets.
# Every file is drawn or synthesised locally (headless Chrome, ffmpeg, macOS `say`, cwebp);
# nothing is extracted from a third-party client. Output is deterministic and committed.
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
