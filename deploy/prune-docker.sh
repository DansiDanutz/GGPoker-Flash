#!/usr/bin/env bash
# Bound unused build cache without deleting images, containers, volumes or backups.
set -euo pipefail

echo "[prune-docker] $(date -u +%Y-%m-%dT%H:%M:%SZ) cache target 4GB; free-space target 20GB"
# Recent/in-use records and image-shared layers can prevent reaching these targets.
docker buildx prune --builder default --all --force \
  --filter until=1h --max-used-space 4GB --min-free-space 20GB --reserved-space 1GB

df -h / | tail -1
