#!/bin/bash
# Decrypt a dangg.live backup (backup-<stamp>.db.cms) on the operator's Mac and check it.
#
#   tools/backup-decrypt.sh <backup.db.cms> [<out.db>]
#
# The private key comes from ~/.config/dangg/backup-key.pem, or from the macOS Keychain item
# "DanGG backup private key" when the file is absent. The key is never written elsewhere.
set -euo pipefail

IN="${1:?usage: tools/backup-decrypt.sh <backup.db.cms> [<out.db>]}"
OUT="${2:-${IN%.cms}}"
KEY_FILE="${DANGG_BACKUP_KEY:-$HOME/.config/dangg/backup-key.pem}"
OPENSSL="$(command -v /opt/homebrew/opt/openssl@3/bin/openssl || command -v openssl)"

if [[ -e "$OUT" ]]; then
  echo "backup-decrypt: $OUT already exists; refusing to overwrite" >&2
  exit 1
fi

decrypt() {
  "$OPENSSL" cms -decrypt -binary -inform DER -inkey "$1" -in "$IN" -out "$OUT"
}

if [[ -r "$KEY_FILE" ]]; then
  decrypt "$KEY_FILE"
else
  # Feed the Keychain copy through a private temp file that is removed on exit.
  tmp_key="$(mktemp)"
  trap 'rm -f "$tmp_key"' EXIT
  chmod 600 "$tmp_key"
  security find-generic-password -a dangg-backup -s "DanGG backup private key" -w | base64 -d > "$tmp_key"
  decrypt "$tmp_key"
fi
chmod 600 "$OUT"

result="$(sqlite3 "$OUT" 'PRAGMA integrity_check;')"
if [[ "$result" != "ok" ]]; then
  echo "backup-decrypt: integrity_check failed: $result" >&2
  exit 1
fi
echo "backup-decrypt: $OUT ok ($(sqlite3 "$OUT" 'SELECT count(*) FROM users;') users)"
