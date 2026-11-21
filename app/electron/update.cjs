// Desktop update helpers: the built-in copy of DanGG compares its build with dangg.live, and
// once the player chooses to update, the app loads dangg.live from then on.
const fs = require('node:fs');
const path = require('node:path');

const LIVE_URL = 'https://dangg.live';
const MODES = Object.freeze(['local', 'live']);

/** { version, build } from a dist/version.json, or null when it is missing or broken. */
function readLocalVersion(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof data.version !== 'string' || typeof data.build !== 'string') return null;
    return { version: data.version, build: data.build };
  } catch {
    return null;
  }
}

/** True only when both sides are known, neither is a dev build, and they differ. */
function isOutdated(local, live) {
  if (!local || !live) return false;
  for (const value of [local.version, local.build, live.version, live.build]) {
    if (typeof value !== 'string' || !value.trim() || value.trim() === 'dev') return false;
  }
  return local.version !== live.version || local.build !== live.build;
}

/** 'live' once the player has switched; 'local' (the built-in copy) otherwise. */
function readMode(file) {
  try {
    const { mode } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return mode === 'live' ? 'live' : 'local';
  } catch {
    return 'local';
  }
}

function writeMode(file, mode) {
  if (!MODES.includes(mode)) throw new Error(`unknown desktop mode: ${mode}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ mode }, null, 2));
}

/** The live build identity, or null when dangg.live cannot be reached in time. */
async function fetchLiveVersion(timeoutMs = 5000) {
  try {
    const res = await fetch(`${LIVE_URL}/api/version?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.version !== 'string' || typeof data.build !== 'string') return null;
    return { version: data.version, build: data.build };
  } catch {
    return null;
  }
}

module.exports = { LIVE_URL, readLocalVersion, isOutdated, readMode, writeMode, fetchLiveVersion };
