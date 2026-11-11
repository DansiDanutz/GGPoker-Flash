#!/bin/bash
# Rebuild the web client and refresh the signed desktop app in ~/Applications.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/DanGG.app"
cd "$ROOT/app"
pnpm build
pkill -9 -x GGPokerClone 2>/dev/null || true
sleep 1
mkdir -p "$HOME/Applications"
if [ ! -d "$APP" ]; then
  # Electron's dist layout depends on the installer: pnpm nests it, npm flattens it,
  # and the binary may be absent entirely (ELECTRON_SKIP_BINARY_DOWNLOAD).
  ELECTRON_APP=""
  for cand in "$ROOT/app/node_modules/electron/dist/Electron.app" "$ROOT"/app/node_modules/.pnpm/electron@*/node_modules/electron/dist/Electron.app; do
    [ -d "$cand" ] && ELECTRON_APP="$cand" && break
  done
  if [ -z "$ELECTRON_APP" ]; then
    echo "Electron.app not found; install the electron package first (pnpm install --force or npm rebuild electron)." >&2
    exit 1
  fi
  cp -R "$ELECTRON_APP" "$APP"
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
rm -rf "$APPR/dist" "$APPR/public" "$APPR/server" "$APPR/electron"
cp -R "$ROOT/app/dist" "$ROOT/app/public" "$ROOT/app/server" "$ROOT/app/electron" "$APPR/"
cp "$ROOT/app/package.json" "$APPR/package.json"
rm -rf "$APPR/server/data"
python3 - <<PY
import json
p="$APPR/package.json"
d=json.load(open(p)); d['main']='electron/main.cjs'; d['name']='ggpoker-clone-desktop'
json.dump(d,open(p,'w'),indent=2)
PY
cd "$HOME/Applications"
xattr -cr "DanGG.app"
find "DanGG.app" -name ".DS_Store" -delete
xattr -cr "DanGG.app"
codesign --force --deep --sign "Developer ID Application: Dan Semenescu (3RUJZ24Y76)" "DanGG.app" >/dev/null 2>&1 || codesign --force --deep --sign - "DanGG.app"
codesign --verify --deep --strict "DanGG.app"
echo "Signed OK"
env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS open -n "DanGG.app"
sleep 6
echo "Launched: $(pgrep -lx GGPokerClone | head -1)"
