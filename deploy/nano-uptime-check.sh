#!/bin/bash
# nano-uptime-check.sh — runs on Nano, checks dangg.live from outside Dexter.
#
# The watchdog on Dexter can restart a hung container, but it cannot report a dead
# droplet, a broken Traefik route or an expired certificate. This runs on the other
# droplet, so it still notices when Dexter is unreachable.
#
# Alerts only on state changes (down -> up, up -> down) to avoid spam. It also
# alerts when /healthz warnings change (stale tournament rooms, disk >= 90% used);
# that needs python3 on Nano, otherwise the uptime check still runs. The Discord
# webhook is read from the existing ~/droplet-discord-alert.sh on this host rather
# than being duplicated here.
#
# Install on Nano:
#   scp deploy/nano-uptime-check.sh nano:~/danggro-uptime-check.sh
#   ssh nano 'chmod +x ~/danggro-uptime-check.sh'
#   crontab: */5 * * * * ~/danggro-uptime-check.sh >/dev/null 2>&1
set -uo pipefail

URL="${DANGGRO_URL:-https://dangg.live/healthz}"
STATE="${DANGGRO_STATE:-$HOME/.danggro-uptime-state}"
LOG="${DANGGRO_LOG:-$HOME/danggro-uptime.log}"
DRY_RUN="${DANGGRO_DRY_RUN:-0}"

# Keep the log bounded.
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 524288 ]; then
  tail -c 131072 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
code="$(curl -s -o "$tmp" -w '%{http_code}' --max-time 15 "$URL" 2>/dev/null)" || code=000
body="$(cat "$tmp" 2>/dev/null || true)"
prev="$(cat "$STATE" 2>/dev/null || echo unknown)"

alert() {
  local message="$1"
  echo "$(date -Is) ALERT $message"
  [ "$DRY_RUN" = "1" ] && { echo "(dry run, not sent)"; return 0; }
  local hook
  hook="$(grep -oE 'https://discord\.com/api/webhooks/[A-Za-z0-9/_-]+' "$HOME/droplet-discord-alert.sh" 2>/dev/null | head -1)"
  if [ -n "$hook" ]; then
    curl -s -H 'content-type: application/json' \
      -d "{\"content\":\"[dangg.live] $message\"}" "$hook" >/dev/null 2>&1 \
      && echo "$(date -Is) alert sent" || echo "$(date -Is) alert send failed"
  else
    echo "$(date -Is) no webhook found; alert only logged"
  fi
}

if [ "$code" = "200" ]; then
  if [ "$prev" != "200" ] && [ "$prev" != "unknown" ]; then
    alert "RECOVERED — $URL is answering again"
  fi
  warnings="$(printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("; ".join(d.get("warnings") or []))' 2>/dev/null || true)"
  prev_warn="$(cat "$STATE.warn" 2>/dev/null || true)"
  if [ -n "$warnings" ] && [ "$warnings" != "$prev_warn" ]; then
    alert "WARN — $warnings"
  elif [ -z "$warnings" ] && [ -n "$prev_warn" ]; then
    alert "OK — warnings cleared"
  fi
  printf '%s\n' "$warnings" > "$STATE.warn"
  echo 200 > "$STATE"
  exit 0
fi

echo "$(date -Is) code=$code prev=$prev" >> "$LOG"
if [ "$prev" = "200" ] || [ "$prev" = "unknown" ]; then
  alert "DOWN — $URL returned $code"
fi
echo "$code" > "$STATE"
exit 1
