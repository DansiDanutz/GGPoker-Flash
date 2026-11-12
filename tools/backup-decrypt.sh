#!/bin/bash
# Decrypt a dangg.live backup (backup-<stamp>.db.cms) on the operator's Mac and check it.
#
#   tools/backup-decrypt.sh <backup.db.cms> [<out.db>]
#
# The private key comes from ~/.config/dangg/backup-key.pem, or from the macOS Keychain item
# "DanGG backup private key" when the file is absent. The key is never written elsewhere.
#
# Plaintext is written to a private (0600) temporary file next to <out.db> and moved into place
# only after decryption (including the GCM tag) and PRAGMA integrity_check succeed, so a damaged
# or tampered backup never leaves a readable database behind.
set -euo pipefail
umask 077

IN="${1:?usage: tools/backup-decrypt.sh <backup.db.cms> [<out.db>]}"
OUT="${2:-${IN%.cms}}"
KEY_FILE="${DANGG_BACKUP_KEY:-$HOME/.config/dangg/backup-key.pem}"
OPENSSL="$(command -v /opt/homebrew/opt/openssl@3/bin/openssl || command -v openssl)"

if [[ -e "$OUT" ]]; then
  echo "backup-decrypt: $OUT already exists; refusing to overwrite" >&2
  exit 1
fi

tmp_out="$(mktemp "$(dirname "$OUT")/.backup-decrypt.XXXXXX")"
tmp_key=""
cleanup() { rm -f "$tmp_out" ${tmp_key:+"$tmp_key"}; }
trap cleanup EXIT

key="$KEY_FILE"
if [[ ! -r "$KEY_FILE" ]]; then
  # Feed the Keychain copy through a private temp file that is removed on exit.
  tmp_key="$(mktemp)"
  security find-generic-password -a dangg-backup -s "DanGG backup private key" -w | base64 -d > "$tmp_key"
  key="$tmp_key"
fi

if ! "$OPENSSL" cms -decrypt -binary -inform DER -inkey "$key" -in "$IN" -out "$tmp_out"; then
  echo "backup-decrypt: decryption failed (wrong key, or the file is damaged)" >&2
  exit 1
fi

result="$(sqlite3 "$tmp_out" 'PRAGMA integrity_check;' 2>&1 || true)"
if [[ "$result" != "ok" ]]; then
  echo "backup-decrypt: integrity_check failed: $result" >&2
  exit 1
fi
users="$(sqlite3 "$tmp_out" 'SELECT count(*) FROM users;')"

mv -n "$tmp_out" "$OUT"
if [[ -e "$tmp_out" ]]; then
  echo "backup-decrypt: $OUT appeared while decrypting; refusing to overwrite" >&2
  exit 1
fi
echo "backup-decrypt: $OUT ok ($users users)"
