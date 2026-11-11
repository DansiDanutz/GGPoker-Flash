#!/bin/bash
# keepalive.sh — restart the game container if the app stops answering.
#
# Docker's healthcheck only *marks* the container unhealthy; it does not restart it.
# This script is the watchdog that actually acts, and it is safe to run by hand.
# Intended for cron: */2 * * * * /home/<user>/dangro/deploy/keepalive.sh
set -uo pipefail
cd "$(dirname "$0")"

LOG="${KEEPALIVE_LOG:-keepalive.log}"
URL="${KEEPALIVE_URL:-http://127.0.0.1:5198/healthz}"
TIMEOUT="${KEEPALIVE_TIMEOUT:-8}"
COOLDOWN="${KEEPALIVE_COOLDOWN:-300}"
STAMP=".keepalive-last-restart"

# Keep the log bounded (rotate at 1 MiB, keep the last 256 KiB).
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ]; then
  tail -c 262144 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

probe() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" "$URL" 2>/dev/null)" || code=000
  printf '%s' "${code:-000}"
}

code="$(probe)"
[ "$code" = "200" ] && exit 0

# Do not restart in a tight loop if the app is genuinely broken.
if [ -f "$STAMP" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$STAMP") ))
  if [ "$age" -lt "$COOLDOWN" ]; then
    printf '%s health=%s within %ss cooldown (last restart %ss ago) — not restarting\n' \
      "$(date -Is)" "$code" "$COOLDOWN" "$age" >> "$LOG"
    exit 1
  fi
fi
touch "$STAMP"

printf '%s health=%s — restarting game\n' "$(date -Is)" "$code" >> "$LOG"
docker compose restart game >> "$LOG" 2>&1
sleep 20

code="$(probe)"
printf '%s post-restart health=%s\n' "$(date -Is)" "$code" >> "$LOG"
[ "$code" = "200" ] && exit 0
exit 1
