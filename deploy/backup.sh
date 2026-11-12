#!/bin/bash
# Consistent, encrypted SQLite backup from the running game container.
# Run from the deploy/ directory.
#
# Snapshots are encrypted with OpenSSL CMS (RSA-OAEP + AES-256-GCM) to backup-recipient.pem.
# The matching private key lives only on the operator's Mac (macOS Keychain item
# "DanGG backup private key" and ~/.config/dangg/backup-key.pem); decrypt with
# tools/backup-decrypt.sh. Neither droplet can read the backups it stores.
set -euo pipefail
cd "$(dirname "$0")"
STAMP="$(date +%Y%m%d-%H%M%S)"
RECIPIENT="backup-recipient.pem"
SNAPSHOT="backups/backup-${STAMP}.db"
mkdir -p backups

docker compose exec -T game node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/data/ggpoker.db');
db.exec(\"VACUUM INTO '/data/backup-${STAMP}.db'\");
db.close();
"

docker compose cp "game:/data/backup-${STAMP}.db" "$SNAPSHOT"
chmod 600 "$SNAPSHOT"

# The snapshot is now outside the container; remove every snapshot left in the live data
# volume (including ones from older runs), so plaintext copies do not pile up there.
docker compose exec -T game sh -c 'rm -f /data/backup-*.db'

if [[ ! -s "$RECIPIENT" ]]; then
  # Keep the plaintext snapshot rather than lose the backup, but fail so the log and cron
  # mail show it: a missing certificate must be fixed, not ignored.
  echo "backup: $RECIPIENT missing; kept UNENCRYPTED $SNAPSHOT" >&2
  exit 1
fi
openssl cms -encrypt -binary -aes-256-gcm -recip "$RECIPIENT" -keyopt rsa_padding_mode:oaep \
  -outform DER -in "$SNAPSHOT" -out "${SNAPSHOT}.cms"
chmod 600 "${SNAPSHOT}.cms"
rm -f "$SNAPSHOT"
ls -lh "${SNAPSHOT}.cms"

# Keep two weeks of local backups; off-host copies handle longer retention.
find backups -name 'backup-*.db*' -type f -mtime +14 -delete
