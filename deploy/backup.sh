#!/bin/bash
# Consistent SQLite backup from the running game container.
# Run from the deploy/ directory.
set -euo pipefail
cd "$(dirname "$0")"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups

docker compose exec -T game node --input-type=module -e "
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/data/ggpoker.db');
db.exec(\"VACUUM INTO '/data/backup-${STAMP}.db'\");
db.close();
"

docker compose cp "game:/data/backup-${STAMP}.db" "backups/backup-${STAMP}.db"
chmod 600 "backups/backup-${STAMP}.db"
ls -lh "backups/backup-${STAMP}.db"

# Keep two weeks of local backups; off-host copies handle longer retention.
find backups -name 'backup-*.db' -type f -mtime +14 -delete
