// Exercise the real scripts against a disposable host directory. No network or Docker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('rollout and watchdog exclude each other through build, restart and SHA verification', t => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const dir = mkdtempSync(path.join(tmpdir(), 'dangg-maintenance-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const host = path.join(dir, 'host'), bin = path.join(dir, 'bin'), release = path.join(dir, 'release');
  for (const sub of ['deploy', 'app', 'tools', 'LICENSES']) {
    mkdirSync(path.join(release, sub), { recursive: true });
    mkdirSync(path.join(host, sub), { recursive: true });
  }
  mkdirSync(bin);
  for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.txt', 'app/new']) writeFileSync(path.join(release, file), 'fixture');
  writeFileSync(path.join(release, 'deploy/keepalive.sh'), 'old public watchdog');
  const watchdog = path.join(host, 'deploy/keepalive.sh');
  cpSync(path.join(repo, 'deploy/keepalive.sh'), watchdog);
  const shim = (name, body) => writeFileSync(path.join(bin, name), '#!/bin/bash\nset -eu\n' + body, { mode: 0o755 });
  shim('git', `case "$1" in
    rev-parse) if [[ "$2" == --show-toplevel ]]; then echo "$REPO"; else echo "$SHA"; fi ;;
    archive) tar -cf - -C "$RELEASE" . ;;
    show) cat "$REPO/deploy/keepalive.sh" ;;
    fetch|merge-base) : ;;
    *) exit 99 ;;
  esac`);
  shim('gh', `while (( $# )); do
      case "$1" in --limit) limit=$2; shift;; --jq) query=$2; shift;; esac
      shift
    done
    jq -r ".[:$limit] | $query" "$HOST_DIR/ci.json"`);
  shim('ssh', '[[ "$1" == fixture ]] && exec bash -c "$2"');
  shim('rsync', `args=(); for arg in "$@"; do args+=("\${arg#fixture:}"); done
    exec "$REAL_RSYNC" "\${args[@]}"`);
  shim('docker', `echo "$*" >> "$HOST_DIR/docker.log"
    if [[ "$*" == 'compose build game' ]]; then
      [[ "$SOURCE_REPOSITORY" == 'https://github.com/OpenPoker4all/OpenPoker' && "$GIT_SHA" == "$SHA" ]] || exit 43
    fi
    if [[ "$*" != "compose restart game" ]]; then bash "$WATCHDOG"; fi
    if [[ "$*" == 'compose build game' && -f "$HOST_DIR/fail-build" ]]; then exit 42; fi`);
  shim('curl', `if [[ "\${!#}" == 'fixture:watchdog' ]]; then
      echo probe >> "$HOST_DIR/watchdog.log"
      if [[ -f "$HOST_DIR/recovered" ]]; then echo 200; else echo 503; touch "$HOST_DIR/recovered"; fi
    else
      bash "$WATCHDOG"
      echo probe >> "$HOST_DIR/health.log"
      if [[ -f "$HOST_DIR/previous-health" ]]; then echo "{\\"commit\\":\\"$SHA\\"}"; else touch "$HOST_DIR/previous-health"; echo '{}'; fi
    fi`);
  shim('sleep', ':');
  // macOS lacks util-linux flock; lock the inherited descriptor with the same kernel primitive.
  if (process.platform === 'darwin' && spawnSync('which', ['flock']).status !== 0) {
    writeFileSync(path.join(bin, 'flock'), `#!/usr/bin/env python3
import fcntl, sys
try: fcntl.flock(int(sys.argv[-1]), fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError: sys.exit(int(sys.argv[sys.argv.index('-E')+1]) if '-E' in sys.argv else 1)
`, { mode: 0o755 });
  }
  const env = { ...process.env, PATH: bin + ':' + process.env.PATH, REPO: repo, RELEASE: release, HOST_DIR: host,
    SOURCE_REPOSITORY: 'https://example.invalid/wrong-repo', WATCHDOG: watchdog, SHA: 'a'.repeat(40), DANGG_DEPLOY_HOST: 'fixture', DANGG_REMOTE_ROOT: host,
    DANGG_HEALTH_URL: 'fixture:health', KEEPALIVE_URL: 'fixture:watchdog',
    REAL_RSYNC: execFileSync('which', ['rsync'], { encoding: 'utf8' }).trim() };
  const run = (script, expected, args = []) => {
    const result = spawnSync('bash', [script, ...args], { env, encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, expected, result.stdout + result.stderr);
  };
  const deploy = path.join(repo, 'deploy/deploy.sh');
  const ci = runs => writeFileSync(path.join(host, 'ci.json'), JSON.stringify(runs.map(conclusion => ({ conclusion }))));
  for (const runs of [['failure', 'success'], ['', 'success'], []]) {
    ci(runs);
    run(deploy, 1);
    assert.equal(existsSync(path.join(host, 'docker.log')), false);
  }
  ci(['success']);
  run(deploy, 0);
  const log = name => readFileSync(path.join(host, name), 'utf8');
  assert.match(log('docker.log'), /compose build game\ncompose up -d game/);
  assert.equal(log('health.log'), 'probe\nprobe\n');
  assert.ok(!existsSync(path.join(host, 'watchdog.log')), 'watchdog must skip before probing');
  assert.ok(!existsSync(path.join(host, 'deploy/.keepalive-last-restart')));
  assert.equal(log('app/new'), 'fixture');
  assert.equal(log('deploy/keepalive.sh'), readFileSync(path.join(repo, 'deploy/keepalive.sh'), 'utf8'));

  // A watchdog (or another rollout) already holding the lock blocks service changes.
  const locked = log('docker.log');
  writeFileSync(watchdog, 'old unlocked watchdog');
  run(deploy, 1);
  assert.equal(log('docker.log'), locked);
  cpSync(path.join(repo, 'deploy/keepalive.sh'), watchdog);
  run('-c', 1, ['exec 9>>"$HOST_DIR/deploy/.maintenance.lock"; flock -n 9; bash "$1"', 'test', deploy]);
  assert.equal(log('docker.log'), locked);
  writeFileSync(path.join(host, 'fail-build'), '');
  run(deploy, 42);
  run(watchdog, 0);
  assert.match(log('docker.log'), /compose restart game\n$/);
  assert.equal(log('watchdog.log'), 'probe\nprobe\n');
});
