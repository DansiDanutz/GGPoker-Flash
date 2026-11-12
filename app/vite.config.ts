import fs from 'node:fs';
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

function appVersionPlugin(): Plugin {
  return {
    name: 'dangg-app-version',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist');
      fs.writeFileSync(
        path.join(dist, 'version.json'),
        JSON.stringify({ version: VERSION, build: BUILD, time: BUILT_AT }, null, 2) + '\n',
      );
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
    __APP_VERSION__: JSON.stringify(VERSION),
    __APP_BUILD__: JSON.stringify(BUILD),
    __APP_BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  server: { port: 5199, strictPort: true, proxy: { '/api': 'http://127.0.0.1:5198', '/ws': { target: 'ws://127.0.0.1:5198', ws: true } } },
  build: { outDir: 'dist' },
});
