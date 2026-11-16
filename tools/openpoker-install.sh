#!/usr/bin/env bash
# Manage an independent OpenPoker web/PWA installation. Never sources the .env file.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${OPENPOKER_ENV_FILE:-$ROOT/deploy/portable/.env}"
BACKUP_DIR="${OPENPOKER_BACKUP_DIR:-$ROOT/deploy/portable/backups}"
portable_compose_file="$ROOT/deploy/portable/compose.yml"
# Internal override, never inherited from the invoking shell.
build_sha_override=''

die() { printf 'openpoker: %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'EOF'
Usage: tools/openpoker-install.sh COMMAND

  init [--name NAME] [--origin URL] [--port PORT] [--project NAME] [--source URL]
          Create a private .env with a random admin password; never overwrite it.
  up      Build the clean, committed checkout and start it; back up a running room first.
  restart Restart the existing container without changing its configuration or data.
  stop    Stop the room; keep its container and database volume.
  status  Show container status.
  logs    Follow the room's recent logs.
  backup  Save a consistent SQLite snapshot in deploy/portable/backups/.

OPENPOKER_ENV_FILE and OPENPOKER_BACKUP_DIR optionally select private local paths.
See docs/INSTALL.md for HTTPS, updates, recovery and corresponding source.
EOF
}

# Read only scalar fields used by this helper; do not evaluate shell or dotenv code.
read_env() {
  local value
  value="$(awk -v key="$1" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2) } END { print value }' "$ENV_FILE")"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
  printf '%s' "$value"
}

quote_env() {
  local value="$1"
  value="${value//\'/\\\'}"
  printf "'%s'" "$value"
}

require_env() {
  [[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || die "Run init first; the private env file must be a regular file: $ENV_FILE"
  local project port
  project="$(read_env OPENPOKER_PROJECT)"
  port="$(read_env OPENPOKER_PORT)"
  [[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die 'OPENPOKER_PROJECT must contain lowercase letters, digits, hyphens or underscores.'
  [[ "$port" =~ ^[0-9]+$ && ${#port} -le 5 ]] && (( 10#$port >= 1024 && 10#$port <= 65535 )) || die 'OPENPOKER_PORT must be between 1024 and 65535.'
}

require_docker() {
  command -v docker >/dev/null || die 'Docker with the Compose v2 plugin is required.'
  docker compose version >/dev/null || die 'Install the Docker Compose v2 plugin.'
  docker info >/dev/null 2>&1 || die 'Start Docker and grant this user access to its daemon.'
}

validate_password() {
  local password password_lower
  password="$(read_env GGPOKER_ADMIN_PASSWORD)"
  [[ ${#password} -ge 16 ]] || die 'Set a unique admin password of at least 16 characters in the private env file.'
  password_lower="$(printf '%s' "$password" | tr '[:upper:]' '[:lower:]')"
  case "$password_lower" in
    replace-*|replace_*|change-me*|changeme*|your-password*|your-admin*|password*|example*|admin123*)
      die 'Replace the placeholder admin password with a unique secret in the private env file.' ;;
  esac
}

compose() (
  # Shell exports otherwise take precedence over --env-file interpolation. Keep
  # the reviewed private file authoritative, including its project/volume name.
  unset OPENPOKER_PROJECT OPENPOKER_PORT OPENPOKER_PROFILE \
    OPENPOKER_SITE_NAME OPENPOKER_SITE_ORIGIN OPENPOKER_SITE_LOGO \
    OPENPOKER_SITE_ICON OPENPOKER_SITE_IMAGE OPENPOKER_SUPPORT_EMAIL \
    SOURCE_REPOSITORY GGPOKER_ADMIN_PASSWORD GGPOKER_ADMIN_ALLOW \
    GGPOKER_TRUST_PROXY GIT_SHA COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_ENV_FILES \
    COMPOSE_PROFILES COMPOSE_REMOVE_ORPHANS
  if [[ -n "$build_sha_override" ]]; then export GIT_SHA="$build_sha_override"; fi
  docker compose --project-name "$(read_env OPENPOKER_PROJECT)" \
    --env-file "$ENV_FILE" -f "$portable_compose_file" "$@"
)

backup() {
  local stamp snapshot destination
  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$-$RANDOM"
  snapshot="/data/openpoker-backup-$stamp.db"
  destination="$BACKUP_DIR/openpoker-$stamp.db"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  compose exec -T -e "OPENPOKER_SNAPSHOT=$snapshot" game node --input-type=module -e '
    import { DatabaseSync } from "node:sqlite";
    const db = new DatabaseSync("/data/ggpoker.db");
    db.exec("PRAGMA busy_timeout=10000");
    db.prepare("VACUUM INTO ?").run(process.env.OPENPOKER_SNAPSHOT);
    db.close();
  '
  compose cp "game:$snapshot" "$destination"
  [[ -s "$destination" ]] || die "Backup copy is empty; snapshot remains at $snapshot in the volume."
  chmod 600 "$destination"
  compose exec -T game rm -- "$snapshot"
  printf 'Private database backup: %s\n' "$destination"
}

init() {
  local name='OpenPoker' origin='' port='5198' project='openpoker'
  local source='https://github.com/OpenPoker4all/OpenPoker' password sha
  while (( $# )); do
    [[ $# -ge 2 ]] || die "Missing value for $1"
    case "$1" in
      --name) name="$2" ;;
      --origin) origin="$2" ;;
      --port) port="$2" ;;
      --project) project="$2" ;;
      --source) source="$2" ;;
      *) die "Unknown init option: $1" ;;
    esac
    shift 2
  done
  [[ ! -e "$ENV_FILE" && ! -L "$ENV_FILE" ]] || die "Already initialized; edit $ENV_FILE to preserve its password and volume identity."
  [[ "$port" =~ ^[0-9]+$ && ${#port} -le 5 ]] && (( 10#$port >= 1024 && 10#$port <= 65535 )) || die 'Port must be between 1024 and 65535.'
  port="$((10#$port))"
  [[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die 'Project names use lowercase letters, digits, hyphens or underscores.'
  [[ "$name" =~ [^[:space:]] && ${#name} -le 80 && "$name" != *[[:cntrl:]]* && "$name" != *\\* ]] || die 'Site name must be 1–80 characters, without control characters or backslashes.'
  origin="${origin:-http://localhost:$port}"
  [[ "$origin" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || die 'Origin must be an http(s) origin without a path, query, credentials or trailing slash.'
  [[ "$source" =~ ^https://[A-Za-z0-9._~:/-]+$ ]] || die 'Source must be an HTTPS repository URL without credentials, query or fragment.'
  source="${source%/}"
  command -v git >/dev/null || die 'Git is required to identify the source commit.'
  sha="$(git -C "$ROOT" rev-parse --verify HEAD)"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die 'The checkout must have a full source commit.'
  password="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  [[ ${#password} -eq 64 ]] || die 'Could not generate the admin password.'
  mkdir -p "$(dirname "$ENV_FILE")"
  (
    set -o noclobber
    {
      printf '# Private installation settings. Keep the project name stable to reuse its data volume.\n'
      printf 'OPENPOKER_PROJECT=%s\nOPENPOKER_PORT=%s\n' "$project" "$port"
      printf 'OPENPOKER_SITE_NAME='; quote_env "$name"; printf '\n'
      printf 'OPENPOKER_SITE_ORIGIN=%s\n' "$origin"
      printf 'OPENPOKER_SITE_LOGO=\nOPENPOKER_SITE_ICON=\nOPENPOKER_SITE_IMAGE=\nOPENPOKER_SUPPORT_EMAIL=\n'
      printf 'GIT_SHA=%s\nSOURCE_REPOSITORY=%s\n' "$sha" "$source"
      printf 'GGPOKER_ADMIN_PASSWORD=%s\n' "$password"
      printf 'GGPOKER_ADMIN_ALLOW=127.0.0.1,::1,172.16.0.0/12\nGGPOKER_TRUST_PROXY=0\n'
    } > "$ENV_FILE"
  ) || die "Could not create $ENV_FILE without overwriting an existing file."
  chmod 600 "$ENV_FILE"
  printf 'Created %s (mode 0600).\n' "$ENV_FILE"
  printf 'Admin login: admin. Its random password is in GGPOKER_ADMIN_PASSWORD in that file.\n'
  printf 'Next: tools/openpoker-install.sh up; then open http://localhost:%s\n' "$port"
}

up() {
  local sha running temporary
  [[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ]] || die 'Commit or remove local source changes first; the published source link must match this build.'
  sha="$(git -C "$ROOT" rev-parse --verify HEAD)"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die 'A full source commit is required.'
  running="$(compose ps --status running -q game)"
  if [[ -n "$running" ]]; then backup; fi
  # Override only the source revision for this invocation. Keep the saved revision
  # unchanged if the image build or startup fails.
  build_sha_override="$sha"
  printf 'Building source commit %s\n' "$sha"
  compose build game
  compose up -d --wait --wait-timeout 180 game
  temporary="$(mktemp "$ENV_FILE.tmp-XXXXXXXX")"
  awk -v sha="$sha" 'BEGIN { found=0 } /^GIT_SHA=/ { print "GIT_SHA=" sha; found=1; next } { print } END { if (!found) print "GIT_SHA=" sha }' "$ENV_FILE" > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$ENV_FILE"
  printf 'OpenPoker is healthy at http://localhost:%s\n' "$(read_env OPENPOKER_PORT)"
}

command="${1:-help}"
if (( $# )); then shift; fi
case "$command" in
  help|--help|-h) usage ;;
  init) init "$@" ;;
  up|restart|stop|status|logs|backup)
    [[ $# -eq 0 ]] || die "Unexpected arguments for $command"
    require_env
    if [[ "$command" == up ]]; then validate_password; fi
    require_docker
    case "$command" in
      up) up ;;
      restart) compose restart game ;;
      stop) compose stop game ;;
      status) compose ps ;;
      logs) compose logs --tail 100 -f game ;;
      backup) backup ;;
    esac
    ;;
  *) usage >&2; die "Unknown command: $command" ;;
esac
