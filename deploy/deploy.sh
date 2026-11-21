#!/usr/bin/env bash
# Deploy one CI-green commit of main to Dexter and prove it is running.
#
#   deploy/deploy.sh [<sha>]        # default: public OpenPoker main
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
# Remote names differ between DanGG and contributor clones. Pin the release authority.
PUBLIC_REPO="OpenPoker4all/OpenPoker"
PUBLIC_REF="refs/remotes/openpoker-release/main"
git fetch --quiet "https://github.com/$PUBLIC_REPO.git" "main:$PUBLIC_REF"
sha="$(git rev-parse --verify "${1:-$PUBLIC_REF}^{commit}")"
short="${sha:0:12}"
echo "deploy: commit $short"

if ! git merge-base --is-ancestor "$sha" "$PUBLIC_REF"; then
  echo "deploy: refusing, $short is not on $PUBLIC_REPO main" >&2
  exit 1
fi

conclusion="$(gh run list --repo "$PUBLIC_REPO" --branch main --event push --workflow "$CI_WORKFLOW" --commit "$sha" --limit 1 --json conclusion --jq '.[0].conclusion // ""')"
if [[ "$conclusion" != success ]]; then
  echo "deploy: refusing, latest $CI_WORKFLOW push run for $short is ${conclusion:-missing or unfinished}" >&2
  exit 1
fi
echo "deploy: CI green for $short"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
git archive "$sha" app tools deploy LICENSE LICENSES THIRD-PARTY-NOTICES.txt | tar -x -C "$stage"

# Mirror app/ and tools/ exactly, so files deleted from Git also leave the host. Protect what is
# generated on the host and never committed: local data and build output. Client assets are
# committed, so anything under public/ that is not in Git (old extracted files) is removed.
rsync_opts=(-az --delete
  --filter='P /server/data/**' --filter='P /node_modules/**' --filter='P /dist/**')
if [[ $DRY_RUN == 1 ]]; then
  rsync "${rsync_opts[@]}" --dry-run --itemize-changes "$stage/app/" "$HOST:$REMOTE_ROOT/app/"
  echo "deploy: dry run only; nothing changed on $HOST"
  exit 0
fi

# Stage privately before taking the host lock. No live files change during upload.
# Use the remote login directory for ~/ paths without evaluating shell input.
root=${REMOTE_ROOT#\~\/}
remote_cd="cd -- $(printf '%q' "$root")"
incoming="$(ssh "$HOST" "$remote_cd && mktemp -d .rollout.XXXXXXXX")"
[[ "$incoming" =~ ^\.rollout\.[[:alnum:]]{8}$ ]] || { echo 'deploy: invalid staging directory' >&2; exit 1; }
cleanup() {
  rm -rf "$stage"
  ssh "$HOST" "$remote_cd && rm -r -- $incoming" </dev/null || echo "deploy: staging cleanup failed: $incoming" >&2
}
trap cleanup EXIT
# The watchdog is host policy, not an artifact from the public release archive.
git show HEAD:deploy/keepalive.sh > "$stage/expected-keepalive"
rsync -az --link-dest=.. "$stage/" "$HOST:$REMOTE_ROOT/$incoming/"

ssh "$HOST" "$remote_cd && bash -s -- $incoming $sha $(printf '%q' "$HEALTH_URL") $HEALTH_TIMEOUT_SEC https://github.com/$PUBLIC_REPO" <<'ROLLOUT'
set -euo pipefail
incoming=$1 sha=$2 health_url=$3 timeout=$4 source_repository=$5
command -v python3 >/dev/null || { echo "deploy: python3 required on host for health verification" >&2; exit 1; }
exec 9>>deploy/.maintenance.lock
flock -n 9 || { echo 'deploy: cannot acquire maintenance lock; retry later' >&2; exit 1; }
cmp -s "$incoming/expected-keepalive" deploy/keepalive.sh || {
  echo 'deploy: install the matching DanGG keepalive.sh before rollout (see ALWAYS-ON.md)' >&2
  exit 1
}
# Only releases that mount the operator certificates need them.
if grep -Fq '/etc/dangg/operator-tls:/run/operator-tls:ro' "$incoming/deploy/compose.yml"; then
  bash "$incoming/deploy/operator-tls-preflight.sh" /etc/dangg/operator-tls
fi
stamp="$(date +%Y%m%d-%H%M)"
docker tag dangro-game:latest "dangro-game:rollback-$stamp"
echo "deploy: rollback image dangro-game:rollback-$stamp"
rsync -a --delete --filter='P /server/data/**' --filter='P /node_modules/**' --filter='P /dist/**' "$incoming/app/" app/
rsync -a --delete "$incoming/tools/" tools/
rsync -a --exclude=/.env --exclude=/keepalive.sh --exclude=/.maintenance.lock "$incoming/deploy/" deploy/
rsync -a "$incoming/LICENSE" "$incoming/THIRD-PARTY-NOTICES.txt" ./
rsync -a "$incoming/LICENSES/" LICENSES/
cd deploy
GIT_SHA=$sha SOURCE_REPOSITORY=$source_repository docker compose build game
docker compose up -d game

deadline=$((SECONDS + timeout))
while (( SECONDS < deadline )); do
  running="$(curl -fsS --max-time 5 "$health_url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("commit", ""))' 2>/dev/null || true)"
  if [[ "$running" == "$sha" ]]; then
    echo "deploy: $health_url reports ${sha:0:12}. Done."
    exit 0
  fi
  sleep 5
done
echo "deploy: $health_url did not report ${sha:0:12} within ${timeout}s (last: ${running:-none}); rollback image: dangro-game:rollback-$stamp" >&2
exit 1
ROLLOUT
