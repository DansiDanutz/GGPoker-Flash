#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Runs the contributor's local source, not uploaded third-party code on a shared host.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const app = fileURLToPath(new URL('../', import.meta.url));
export function sandboxEnvironment(dataDir, password) {
  return {
    PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), NODE_ENV: 'development',
    PORT: '0', GGPOKER_BIND: '127.0.0.1', GGPOKER_DATA: dataDir, GGPOKER_DEV: '1',
    GGPOKER_SEED_DEMO: '1', GGPOKER_ADMIN_PASSWORD: password, GGPOKER_ADMIN_ALLOW: '127.0.0.1/32',
    GGPOKER_MARKETPLACE_ENFORCEMENT: 'off', GGPOKER_USAGE_BILLING: 'off', GGPOKER_ORGANIZER_CHIPS: 'off',
    GGPOKER_NERVIXPAY_MANUAL_FUNDING: 'off',
  };
}

export async function startSandbox() {
  const directory = await mkdtemp(path.join(tmpdir(), 'openpoker-contributor-'));
  const password = randomBytes(18).toString('base64url');
  let child, web, browser, closing;
  const close = () => closing ||= (async () => {
    await web?.close();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
      });
    }
    if (browser) await new Promise(resolve => { browser.close(resolve); browser.closeAllConnections(); });
    await rm(directory, { recursive: true, force: true });
  })();
  try {
    const webPort = await new Promise((resolve, reject) => {
      const probe = net.createServer(); probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)); });
    });
    const url = `http://127.0.0.1:${webPort}`;
    child = spawn(process.execPath, ['server/index.js'], { cwd: app, env: { ...sandboxEnvironment(path.join(directory, 'data'), password), GGPOKER_PUBLIC_ORIGIN: url }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Sandbox startup timed out.')), 20000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Sandbox server exited (${code}).`)); });
      child.stdout.on('data', (chunk) => {
        output = (output + chunk).slice(-4000);
        const match = output.match(/LISTENING (\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
      child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    });
    const api = `http://127.0.0.1:${port}`;
    // Own HTTP and signals: Vite's standalone SIGTERM handler exits before our cleanup.
    browser = createHttpServer((req, res) => web.middlewares(req, res));
    web = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'), envDir: directory, cacheDir: path.join(directory, 'vite'),
      optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
      server: { middlewareMode: { server: browser }, hmr: { server: browser }, host: '127.0.0.1', port: webPort, strictPort: true, open: false, proxy: { '/api': { target: api, changeOrigin: true }, '/ws': { target: api.replace('http:', 'ws:'), ws: true, changeOrigin: true } } } });
    await new Promise((resolve, reject) => { browser.once('error', reject); browser.listen(webPort, '127.0.0.1', resolve); });
    return { url, api, directory, password, close, child };
  } catch (error) { await close(); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('No external URL, data directory or arguments are accepted.');
  const started = startSandbox();
  let stopping = false;
  const stop = code => {
    if (stopping) return;
    stopping = true;
    void started.then(sandbox => sandbox.close()).then(() => process.exit(code), error => { console.error(error.message); process.exit(1); });
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
  const sandbox = await started;
  console.log(`\nOpenPoker Play Money sandbox: ${sandbox.url}\nLocal API: ${sandbox.api}\nTemporary data: ${sandbox.directory}\nTemporary local admin: admin / ${sandbox.password}\nNo payments or real Cash Chips. Stop with Ctrl+C; this sandbox database is then removed.\nBrowser changes hot-reload. Restart the sandbox after changing server code.\n`);
  sandbox.child.once('exit', () => stop(1));
}
