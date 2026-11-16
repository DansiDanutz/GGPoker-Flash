import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { renderSiteHtml, resolveSiteProfile, siteManifest } from './config/site-profile.js';

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
let sourceRepositoryUrl: URL;
try { sourceRepositoryUrl = new URL(SOURCE_REPOSITORY); }
catch { throw new Error('SOURCE_REPOSITORY must be an HTTPS repository URL without credentials, query or fragment'); }
if (sourceRepositoryUrl.protocol !== 'https:' || sourceRepositoryUrl.username || sourceRepositoryUrl.password
    || sourceRepositoryUrl.search || sourceRepositoryUrl.hash || /\s/.test(SOURCE_REPOSITORY)) {
  throw new Error('SOURCE_REPOSITORY must be an HTTPS repository URL without credentials, query or fragment');
}
const SOURCE_URL = `${SOURCE_REPOSITORY}/tree/${COMMIT}`;
const SITE = resolveSiteProfile(process.env);

function siteProfilePlugin(): Plugin {
  const manifest = () => siteManifest(JSON.parse(fs.readFileSync(path.resolve('public/manifest.webmanifest'), 'utf8')), SITE);
  return {
    name: 'openpoker-site-profile',
    buildStart() {
      for (const asset of [SITE.logo, SITE.bootLogo, SITE.icon, SITE.image, SITE.touchIcon, ...manifest().icons.map((icon) => icon.src)]) {
        if (!fs.existsSync(path.resolve('public', `.${asset}`))) throw new Error(`Site identity asset ${asset} is missing from app/public. Add the asset before building.`);
      }
      if (SITE.customIcon && SITE.iconType === 'image/png') {
        const data = fs.readFileSync(path.resolve('public', `.${SITE.icon}`));
        if (data.length < 24 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.readUInt32BE(16) !== 512 || data.readUInt32BE(20) !== 512) {
          throw new Error('OPENPOKER_SITE_ICON PNG must be 512×512 pixels so the generated manifest describes it correctly.');
        }
      }
    },
    transformIndexHtml(html) { return renderSiteHtml(html, SITE); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/manifest.webmanifest') return next();
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        res.end(JSON.stringify(manifest()));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'site.json', source: JSON.stringify(SITE, null, 2) + '\n' });
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest(), null, 2) + '\n' });
    },
  };
}

function appVersionPlugin(): Plugin {
  return {
    name: 'dangg-app-version',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist');
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
  plugins: [react(), siteProfilePlugin(), appVersionPlugin()],
  define: {
    __APP_SOURCE_URL__: JSON.stringify(SOURCE_URL),
    __APP_SITE_PROFILE__: JSON.stringify(SITE),
    __APP_VERSION__: JSON.stringify(VERSION),
    __APP_BUILD__: JSON.stringify(BUILD),
    __APP_BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  server: { port: 5199, strictPort: true, proxy: { '/api': 'http://127.0.0.1:5198', '/ws': { target: 'ws://127.0.0.1:5198', ws: true } } },
  build: { outDir: 'dist' },
});
