#!/bin/bash
# Rebuild the web client and refresh the signed desktop app in ~/Applications.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/GGPoker Clone.app"
cd "$ROOT/app"
pnpm build
pkill -9 -x GGPokerClone 2>/dev/null || true
sleep 1
mkdir -p "$HOME/Applications"
if [ ! -d "$APP" ]; then
  cp -R "$ROOT/app/node_modules/.pnpm/electron@38.8.6/node_modules/electron/dist/Electron.app" "$APP"
  mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/GGPokerClone"
  PB=/usr/libexec/PlistBuddy
  $PB -c "Set :CFBundleExecutable GGPokerClone" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleName GGPoker Clone" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleDisplayName GGPoker Clone" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleIdentifier com.danslab.ggpokerclone" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleShortVersionString 1.0.0" "$APP/Contents/Info.plist"
  $PB -c "Set :CFBundleVersion 1" "$APP/Contents/Info.plist"
  mkdir -p "$APP/Contents/Resources/app"
fi
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
xattr -cr "GGPoker Clone.app"
find "GGPoker Clone.app" -name ".DS_Store" -delete
xattr -cr "GGPoker Clone.app"
codesign --force --deep --sign "Developer ID Application: Dan Semenescu (3RUJZ24Y76)" "GGPoker Clone.app" >/dev/null 2>&1 || codesign --force --deep --sign - "GGPoker Clone.app"
codesign --verify --deep --strict "GGPoker Clone.app"
echo "Signed OK"
env -u ELECTRON_RUN_AS_NODE open -n "GGPoker Clone.app"
sleep 6
echo "Launched: $(pgrep -lx GGPokerClone | head -1)"
