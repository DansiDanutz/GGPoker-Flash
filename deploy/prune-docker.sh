#!/usr/bin/env bash
# Keep the production droplet from filling with Docker build cache and rollback tags.
# Keeps the newest 3 dangro-game:rollback-* images; removes older ones and all cache.
set -euo pipefail

KEEP="${1:-3}"
echo "[prune-docker] $(date -u +%Y-%m-%dT%H:%M:%SZ) keeping ${KEEP} rollback tags"

mapfile -t OLD < <(docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' \
  | awk '$1 ~ /^dangro-game:rollback-/' \
  | sort -k2 -r \
  | tail -n +$((KEEP + 1)) \
  | awk '{print $1}')

for tag in "${OLD[@]:-}"; do
  [ -n "$tag" ] && docker rmi "$tag" >/dev/null 2>&1 || true
done

# The app image is rebuilt on every deploy; keeping build cache is no longer worth the space.
docker builder prune -af >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true

df -h / | tail -1
