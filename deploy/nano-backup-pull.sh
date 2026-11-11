#!/bin/bash
# nano-backup-pull.sh — runs on Nano, pulls the game database snapshots from Dexter.
#
# Dexter produces a consistent SQLite snapshot nightly (deploy/backup.sh, VACUUM INTO).
# This keeps an off-host copy so losing the droplet does not lose the data.
#
# Install on Nano:
#   scp deploy/nano-backup-pull.sh nano:~/dangro-backup-pull.sh
#   ssh nano 'chmod +x ~/dangro-backup-pull.sh'
#   crontab: 0 5 * * * ~/dangro-backup-pull.sh >> ~/dangro-backup-pull.log 2>&1
set -uo pipefail

HOST="${DANGGRO_HOST:-Dexter1981@46.101.219.116}"
SRC="${DANGGRO_SRC:-/home/Dexter1981/dangro/deploy/backups/}"
DEST="${DANGGRO_DEST:-$HOME/dangro-backups}"
KEY="${DANGGRO_KEY:-$HOME/.ssh/id_ed25519_github}"
KEEP_DAYS="${DANGGRO_KEEP_DAYS:-30}"

mkdir -p "$DEST"

echo "$(date -Is) pulling $HOST:$SRC -> $DEST"
rsync -az --delete \
  -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10" \
  "$HOST:$SRC" "$DEST/" || { echo "$(date -Is) FAILED"; exit 1; }

# Keep a month locally; Dexter keeps two weeks.
find "$DEST" -name 'backup-*.db' -type f -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) ok: $(find "$DEST" -name 'backup-*.db' | wc -l | tr -d ' ') snapshot(s), $(du -sh "$DEST" | cut -f1) total"
