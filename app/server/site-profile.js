// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSiteProfile, siteProfileEnv, SITE_ENV_KEYS } from '../config/site-profile.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadSiteProfile({ env = process.env, builtFile = path.join(appRoot, 'dist/site.json') } = {}) {
  if (env.GGPOKER_DEV === '1' || !fs.existsSync(builtFile)) return resolveSiteProfile(env);
  const built = JSON.parse(fs.readFileSync(builtFile, 'utf8'));
  // Validate the public fields, but retain generated PWA names and asset choices.
  const validated = resolveSiteProfile(siteProfileEnv(built));
  for (const key of ['profile', 'name', 'origin', 'logo', 'icon', 'image', 'supportEmail']) {
    if (typeof built[key] !== 'string' || built[key] !== validated[key]) throw new Error(`Built site identity has an invalid ${key}; rebuild the client.`);
  }
  const explicit = Object.fromEntries(SITE_ENV_KEYS.filter((key) => env[key] !== undefined && env[key] !== '').map((key) => [key, env[key]]));
  if (Object.keys(explicit).length) {
    const runtime = resolveSiteProfile({ ...siteProfileEnv(built), ...explicit });
    for (const key of ['profile', 'name', 'origin', 'logo', 'icon', 'image', 'supportEmail']) {
      if (runtime[key] !== built[key]) throw new Error(`Public site identity (${key}) differs from the built client. Rebuild with the same OPENPOKER_* configuration before starting the server.`);
    }
  }
  return Object.freeze(built);
}

export const SITE_PROFILE = loadSiteProfile();
