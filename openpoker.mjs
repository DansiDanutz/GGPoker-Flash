#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { constants } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const help = `OpenPoker CLI — local development and free Play Money testing

Usage: node openpoker.mjs <command>
       openpoker <command>             (after optional npm link)

  doctor                 Check Node, pnpm and installed dependencies
  setup                  Install locked app dependencies (downloads packages)
  sandbox                Start disposable Play Money browser + server
  dev                    Start normal development with persistent local data
  test [name.test.js ...] Run all server tests, or named files in app/server
  check                  Run TypeScript checks, then all server tests
  build                  Build the web app and verify source/license metadata
  help                   Show this guide

Start here: doctor → setup → sandbox. Stop a running server with Ctrl+C.
Sandbox data is temporary; browser edits hot-reload, server edits need a restart.
Local testing is free. Contributor membership is only for marketplace submission.
Requires Node 26+ and pnpm 10.32.1. Supported: macOS, Linux and Windows via WSL.
See docs/CLI.md for setup, troubleshooting and the contributor workflow.
`;
const commands = new Set(['doctor', 'setup', 'sandbox', 'dev', 'test', 'check', 'build']);
const dependencies = ['vite/package.json', 'react/package.json', 'react-dom/package.json', 'ws/package.json', 'typescript/bin/tsc', 'concurrently/package.json'];

export function commandPlan(command, args = [], directory = root) {
  if (!commands.has(command)) throw new Error(`Unknown command: ${command}. Run openpoker help.`);
  if (command !== 'test' && args.length) throw new Error(`${command} does not accept arguments. Run openpoker help.`);
  const app = path.join(directory, 'app');
  const node = (...values) => [process.execPath, values];
  const tests = () => {
    const names = args.length ? args : readdirSync(path.join(app, 'server')).filter(name => name.endsWith('.test.js')).sort();
    if (!names.length) throw new Error('No server tests found. Check your OpenPoker clone.');
    for (const name of names) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.test\.js$/.test(name) || !existsSync(path.join(app, 'server', name))) {
        throw new Error(`Test not found or invalid: ${name}. Use filenames from app/server, for example account-hub.test.js.`);
      }
    }
    return node('--test', ...names.map(name => path.join('server', name)));
  };
  switch (command) {
    case 'doctor': return [];
    case 'setup': return [['pnpm', ['install', '--frozen-lockfile']]];
    case 'sandbox': return [node('tools/contributor-sandbox.mjs')];
    case 'dev': return [['pnpm', ['run', 'dev']]];
    case 'test': return [tests()];
    case 'check': return [node('node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'), tests()];
    case 'build': return [['pnpm', ['run', 'build']], node('tools/verify-source-build.mjs')];
  }
}

export function runChild(command, args, options, signalGroup = true) {
  return new Promise((resolve, reject) => {
    // Own the child group so terminal Ctrl+C is forwarded exactly once.
    const child = spawn(command, args, { ...options, stdio: 'inherit', shell: false, detached: true });
    const forward = signal => {
      if (!child.pid) return;
      try { process.kill(signalGroup ? -child.pid : child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    const interrupt = () => forward('SIGINT');
    const terminate = () => forward('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const cleanup = () => { process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => { cleanup(); resolve(code ?? 128 + (constants.signals[signal] || 1)); });
  });
}

export async function main(argv = process.argv.slice(2)) {
  const [command = 'help', ...args] = argv;
  if (['help', '--help', '-h'].includes(command)) {
    if (args.length) throw new Error('Run openpoker help without extra arguments.');
    console.log(help);
    return 0;
  }
  const plan = commandPlan(command, args);
  const app = path.join(root, 'app');
  const nodeOK = Number(process.versions.node.split('.')[0]) >= 26;
  const platformOK = process.platform !== 'win32';
  const missing = dependencies.filter(file => !existsSync(path.join(app, 'node_modules', file)));
  if (command === 'doctor') {
    const pnpm = platformOK ? spawnSync('pnpm', ['--version'], { cwd: app, encoding: 'utf8', timeout: 10000 }) : null;
    const version = pnpm?.stdout?.trim();
    const pnpmOK = pnpm?.status === 0 && version === '10.32.1';
    console.log(`OpenPoker clone: ${root}\n${nodeOK ? 'OK' : 'FIX'} Node ${process.versions.node} — use Node 26 or newer.\n${platformOK ? 'OK' : 'FIX'} Platform ${process.platform}${platformOK ? '' : ' — run inside WSL.'}\n${pnpmOK ? 'OK' : 'FIX'} pnpm ${version || 'not available'} — install pnpm 10.32.1.\n${missing.length ? 'FIX' : 'OK'} App dependencies${missing.length ? ` — run openpoker setup (missing ${missing.join(', ')}).` : ' installed.'}`);
    console.log('Next: openpoker sandbox after all checks pass. See docs/CLI.md.');
    return nodeOK && platformOK && pnpmOK && !missing.length ? 0 : 1;
  }
  if (!nodeOK) throw new Error('Node 26 or newer is required. Run openpoker doctor.');
  if (!platformOK) throw new Error('Run the CLI inside Windows Subsystem for Linux (WSL). See docs/CLI.md.');
  if (command !== 'setup' && missing.length) throw new Error('App dependencies are missing. Run openpoker setup first.');
  if (plan.some(([executable]) => executable === 'pnpm')) {
    const pnpm = spawnSync('pnpm', ['--version'], { cwd: app, encoding: 'utf8', timeout: 10000 });
    if (pnpm.status !== 0 || pnpm.stdout.trim() !== '10.32.1') throw new Error('Install pnpm 10.32.1, then retry. Run openpoker doctor for details.');
  }
  if (command === 'dev') console.log('Normal development uses your existing local data and environment. Use sandbox for disposable Play Money testing.');
  for (const [executable, values] of plan) {
    console.log(`\nOpenPoker ${command}: ${executable === process.execPath ? 'node' : executable} ${values.join(' ')}`);
    // The sandbox stops its own children in order; pnpm/test commands need the whole group stopped.
    const code = await runChild(executable, values, { cwd: app, env: command === 'setup' ? { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } : process.env }, command !== 'sandbox');
    if (code) return code;
  }
  if (command === 'setup') console.log('\nReady. Run openpoker sandbox (or node openpoker.mjs sandbox).');
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`OpenPoker: ${error.message}`);
    process.exitCode = 1;
  });
}
