#!/bin/bash
# Rebuild the web client and refresh the signed desktop app in ~/Applications.
set -eo pipefail
case "${1:-}" in
  '') local_only=0 ;;
  --local-adhoc) local_only=1 ;;
  *) echo "usage: $0 [--local-adhoc]" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || exit 2
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/DanGG.app"
cd "$ROOT/app"
# Vite copies public/ wholesale, including ignored files. Check before building.
if ! git diff --quiet HEAD -- . ../LICENSE ../LICENSES ../THIRD-PARTY-NOTICES.txt ../research/brand/AppIcon.icns ../package_app.sh || [[ -n "$(git ls-files --others -- public src)" ]]; then
  echo "Desktop packaging needs committed app and notice files, with no extra files in app/public or app/src." >&2
  exit 1
fi
GIT_SHA=$(git rev-parse HEAD)
export GIT_SHA SOURCE_REPOSITORY="${SOURCE_REPOSITORY:-https://github.com/OpenPoker4all/OpenPoker}"
pnpm run build --config vite.config.ts
node tools/verify-source-build.mjs
# Never interrupt a game to refresh its executable or server resources.
status=0
pgrep -x GGPokerClone >/dev/null || status=$?
case "$status" in
  0) echo "Quit the running GGPokerClone desktop app normally, then retry packaging." >&2; exit 1 ;;
  1) ;; # No matching process.
  *) echo "Could not check for a running desktop app; bundle left untouched." >&2; exit "$status" ;;
esac
mkdir -p "$HOME/Applications"
# A refreshed bundle keeps its framework, so check it just like a fresh runtime.
verify_framework() {
  local expected actual
  expected=$(node -p "require('electron/package.json').version") || return 1
  actual=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$1/Contents/Frameworks/Electron Framework.framework/Resources/Info.plist") || return 1
  if [[ "$actual" != "$expected" ]]; then
    echo "Electron framework $actual does not match installed dependency $expected; bundle left untouched." >&2
    return 1
  fi
}
runtime_dist=$(node -p "require('node:path').resolve(require('electron'), '../../../..')")
runtime_app="$runtime_dist/Electron.app"
verify_framework "$runtime_app"
for notice in LICENSE LICENSES.chromium.html; do
  [[ -s "$runtime_dist/$notice" ]] || { echo "Missing Electron runtime notice: $notice" >&2; exit 1; }
done
if [ -d "$APP" ]; then
  verify_framework "$APP"
else
  cp -R "$runtime_app" "$APP"
  mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/GGPokerClone"
  PB=/usr/libexec/PlistBuddy
  $PB -c "Set :CFBundleExecutable GGPokerClone" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleName DanGG" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleDisplayName DanGG" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleIdentifier com.danslab.dangro" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleShortVersionString 1.0.0" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleIconFile AppIcon.icns" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleVersion 1" "$APP/Contents/Info.plist"
  mkdir -p "$APP/Contents/Resources/app"
fi
cp "$ROOT/research/brand/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile AppIcon.icns" "$APP/Contents/Info.plist" 2>/dev/null || true
APPR="$APP/Contents/Resources/app"
# Refuse unexpected leftovers instead of signing them or deleting unknown files.
for old in "$APPR"/* "$APPR"/.[!.]* "$APPR"/..?*; do
  [[ -e "$old" || -L "$old" ]] || continue
  case "${old##*/}" in
    node_modules)
      [[ -d "$old" && ! -L "$old" && -z "$(find "$old" -mindepth 1 -maxdepth 1 ! -name ws -print)" ]] || {
        echo "Unexpected packaged dependencies; inspect $old before packaging." >&2; exit 1;
      } ;;
    dist|public|server|electron|package.json) ;; *)
    echo "Unexpected app resource: $old; inspect the existing bundle before packaging." >&2
    exit 1 ;;
  esac
done
rm -rf "$APPR/dist" "$APPR/public" "$APPR/server" "$APPR/electron" "$APPR/package.json"
git -C "$ROOT" archive HEAD:app package.json electron server ':!server/*.test.js' ':!server/test-helpers.js' ':!server/data' | tar -xf - -C "$APPR"
# The local server imports ws at runtime; Vite only bundles browser dependencies.
mkdir -p "$APPR/node_modules"
rm -rf "$APPR/node_modules/ws"
mkdir "$APPR/node_modules/ws"
cp -R node_modules/ws/{package.json,index.js,wrapper.mjs,lib,LICENSE} "$APPR/node_modules/ws/"
cp -R "$ROOT/app/dist" "$APPR/"
mkdir -p "$APP/Contents/Resources/runtime-notices"
cp "$runtime_dist/LICENSE" "$runtime_dist/LICENSES.chromium.html" "$APP/Contents/Resources/runtime-notices/"
python3 - <<PY
import json
p="$APPR/package.json"
d=json.load(open(p)); d['main']='electron/main.cjs'; d['name']='dangg'
json.dump(d,open(p,'w'),indent=2)
PY
cd "$HOME/Applications"
xattr -cr "DanGG.app"
find "DanGG.app" -name ".DS_Store" -delete
xattr -cr "DanGG.app"
if [[ $local_only == 1 ]]; then
  codesign --force --deep --sign - "DanGG.app"
  codesign --verify --deep --strict "DanGG.app"
  echo "Local ad-hoc signature verified; do not distribute."
else
  codesign --force --deep --sign "Developer ID Application: Dan Semenescu (3RUJZ24Y76)" "DanGG.app"
  codesign --verify --deep --strict "DanGG.app"
  codesign --verify -R='anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "3RUJZ24Y76"' "DanGG.app"
  echo "DanGG Developer ID signature verified."
fi
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS open -n "DanGG.app"
sleep 6
echo "Launched: $(pgrep -lx GGPokerClone | head -1)"
