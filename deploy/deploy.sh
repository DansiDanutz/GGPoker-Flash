#!/usr/bin/env bash
# Deploy one CI-green commit of main to Dexter and prove it is running.
#
#   deploy/deploy.sh [<sha>]        # default: origin/main
#   deploy/deploy.sh --dry-run [<sha>]
#
# Runs on the operator's Mac. Ships exactly the committed tree (git archive), never the
# working copy, and keeps Git and GitHub credentials off the shared host.
set -euo pipefail

HOST="${DANGG_DEPLOY_HOST:-dexter}"
REMOTE_ROOT="${DANGG_REMOTE_ROOT:-~/dangro}"
HEALTH_URL="${DANGG_HEALTH_URL:-https://dangg.live/healthz}"
CI_WORKFLOW="ci.yml"
HEALTH_TIMEOUT_SEC=180

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=1; shift; fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
git fetch --quiet origin
sha="$(git rev-parse --verify "${1:-origin/main}^{commit}")"
short="${sha:0:12}"
echo "deploy: commit $short"

if ! git merge-base --is-ancestor "$sha" origin/main; then
  echo "deploy: refusing, $short is not on origin/main" >&2
  exit 1
fi

green="$(gh run list --workflow "$CI_WORKFLOW" --commit "$sha" --status success --limit 1 --json databaseId --jq 'length')"
if [[ "$green" != "1" ]]; then
  echo "deploy: refusing, no successful $CI_WORKFLOW run for $short" >&2
  exit 1
fi
echo "deploy: CI green for $short"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
git archive "$sha" app tools deploy | tar -x -C "$stage"

# Mirror app/ and tools/ exactly, so files deleted from Git also leave the host. Protect what is
# generated on the host and never committed: extracted client assets, Ruffle, local data.
rsync_opts=(-az --delete
  --filter='P /public/assets/**' --filter='P /public/ruffle/**'
  --filter='P /server/data/**' --filter='P /node_modules/**' --filter='P /dist/**')
if [[ $DRY_RUN == 1 ]]; then
  rsync "${rsync_opts[@]}" --dry-run --itemize-changes "$stage/app/" "$HOST:$REMOTE_ROOT/app/"
  echo "deploy: dry run only; nothing changed on $HOST"
  exit 0
fi

stamp="$(date +%Y%m%d-%H%M)"
ssh "$HOST" "docker tag dangro-game:latest dangro-game:rollback-$stamp"
echo "deploy: rollback image dangro-game:rollback-$stamp"

rsync "${rsync_opts[@]}" "$stage/app/" "$HOST:$REMOTE_ROOT/app/"
rsync -az --delete "$stage/tools/" "$HOST:$REMOTE_ROOT/tools/"
# deploy/ holds host-only files (.env, backups, logs), so update tracked files without deleting.
rsync -az "$stage/deploy/" "$HOST:$REMOTE_ROOT/deploy/"

# Build first: if it fails, the old container keeps serving.
ssh "$HOST" "cd $REMOTE_ROOT/deploy && GIT_SHA=$sha docker compose build game && docker compose up -d game"

deadline=$((SECONDS + HEALTH_TIMEOUT_SEC))
while (( SECONDS < deadline )); do
  running="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(JSON.parse(d).commit||"")}catch{}})' || true)"
  if [[ "$running" == "$sha" ]]; then
    echo "deploy: $HEALTH_URL reports $short. Done."
    exit 0
  fi
  sleep 5
done
echo "deploy: /healthz did not report $short within ${HEALTH_TIMEOUT_SEC}s (last: ${running:-none})." >&2
echo "deploy: roll back with: ssh $HOST 'cd $REMOTE_ROOT/deploy && docker tag dangro-game:rollback-$stamp dangro-game:latest && docker compose up -d game'" >&2
exit 1
