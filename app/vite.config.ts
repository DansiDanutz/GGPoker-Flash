import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// A single build identity is compiled into the client, written next to the
// bundle and stamped into the service worker. The server reports the same
// values from dist/version.json, so a stale client can prove it is stale.
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { version?: string };
const VERSION = String(pkg.version || '1.0.0');
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const BUILD = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
const BUILT_AT = now.toISOString();
// The deploy passes the exact commit it built (GIT_SHA build argument) so /healthz can prove what runs.
const GIT_SHA = String(process.env.GIT_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })).trim().toLowerCase();
if (!/^[0-9a-f]{40}$/.test(GIT_SHA)) throw new Error('GIT_SHA must identify the full source commit');
const COMMIT = GIT_SHA;
// Independent operators must point this at their own public corresponding source.
const SOURCE_REPOSITORY = (process.env.SOURCE_REPOSITORY || 'https://github.com/OpenPoker4all/OpenPoker').replace(/\/$/, '');
if (!/^https:\/\/[^\s?#]+$/.test(SOURCE_REPOSITORY)) throw new Error('SOURCE_REPOSITORY must be an HTTPS repository URL');
const SOURCE_URL = `${SOURCE_REPOSITORY}/tree/${COMMIT}`;

function appVersionPlugin(): Plugin {
  let dist: string;
  return {
    name: 'dangg-app-version',
    apply: 'build',
    configResolved(config) { dist = path.resolve(config.root, config.build.outDir); },
    closeBundle() {
      fs.writeFileSync(
        path.join(dist, 'version.json'),
        JSON.stringify({ version: VERSION, build: BUILD, time: BUILT_AT, commit: COMMIT, source: SOURCE_URL }, null, 2) + '\n',
      );
      const legal = path.join(dist, 'legal');
      fs.mkdirSync(legal, { recursive: true });
      for (const file of ['LICENSE', 'LICENSES/MIT-legacy.txt', 'THIRD-PARTY-NOTICES.txt']) {
        fs.copyFileSync(path.resolve('..', file), path.join(legal, path.basename(file)));
      }
      // Each build gets its own worker cache name; the browser sees new bytes
      // and installs it, which also lets the update gate reload cleanly.
      const sw = path.join(dist, 'sw.js');
      if (fs.existsSync(sw)) fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replaceAll('__BUILD__', BUILD));
    },
  };
}

export default defineConfig({
  plugins: [react(), appVersionPlugin()],
  define: {
    __APP_SOURCE_URL__: JSON.stringify(SOURCE_URL),
    __APP_VERSION__: JSON.stringify(VERSION),
    __APP_BUILD__: JSON.stringify(BUILD),
    __APP_BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  server: { port: 5199, strictPort: true, proxy: { '/api': 'http://127.0.0.1:5198', '/ws': { target: 'ws://127.0.0.1:5198', ws: true } } },
  build: { outDir: 'dist' },
});
