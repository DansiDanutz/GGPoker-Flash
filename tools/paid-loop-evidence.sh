#!/usr/bin/env bash
# Collect roadmap S2 evidence (paid loop) from production without writing to the database.
#
#   bash tools/paid-loop-evidence.sh [table-id] [hours]
#
# Runs on Dexter (owns the docker socket). The database is opened read-only inside the
# game container; the report is written locally, never committed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TABLE="${1:-}"
HOURS="${2:-24}"
OUT_DIR="${PAID_LOOP_EVIDENCE_DIR:-$HOME/paid-loop-evidence}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/paid-loop-$STAMP.json"

mkdir -p "$OUT_DIR"

args=(--hours "$HOURS")
if [[ -n "$TABLE" ]]; then
  args+=(--table "$TABLE")
fi

docker exec -i dangro-game-1 node --input-type=module - "${args[@]}" \
  < "$HERE/collect-paid-loop-evidence.mjs" > "$OUT.raw"

# Attach service provenance so the evidence file cannot drift from the build it describes.
python3 - "$OUT.raw" "$OUT" <<'PY'
import json, sys, urllib.request

raw, out = sys.argv[1], sys.argv[2]
report = json.load(open(raw))
try:
    with urllib.request.urlopen("https://dangg.live/healthz", timeout=10) as response:
        report["service"] = json.loads(response.read().decode())
except Exception as exc:  # evidence still useful without provenance, but say so
    report["service"] = {"error": str(exc)}
json.dump(report, open(out, "w"), indent=2)
print(json.dumps({
    "out": out,
    "verdict": report.get("verdict"),
    "blocking": report.get("blocking", []),
    "commit": report.get("service", {}).get("commit"),
}, indent=2))
PY

rm -f "$OUT.raw"
