#!/usr/bin/env node
// Copy the self-hosted Ruffle runtime and the official SWF effects into public/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'app/node_modules/@ruffle-rs/ruffle');
const dst = path.join(root, 'app/public/ruffle');
const assets = path.join(os.homedir(), 'Library/Application Support/com.nsuslab.ncf.launcher.live.ggpcom/Game/assets/after_lobby');
const swfDir = path.join(root, 'app/public/assets/swf');
if (!fs.existsSync(src)) {
  console.warn('Ruffle package not installed; skipping copy');
  process.exit(0);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const name of fs.readdirSync(src)) {
  if (name.endsWith('.map')) continue;
  fs.cpSync(path.join(src, name), path.join(dst, name), { recursive: true });
}
fs.mkdirSync(swfDir, { recursive: true });
for (const [from, to] of [
  ['spinandgold_animation.swf', 'spin_intro.swf'],
  ['spinandgold_congratulation.swf', 'spin_win.swf'],
  ['chipShuffle.swf', 'chip_shuffle.swf'],
  ['mystery_jackpot_bounty_box_motion.swf', 'mystery_box.swf'],
  ['winEffect.swf', 'win_effect.swf'],
]) {
  const file = path.join(assets, from);
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(swfDir, to));
}
console.log('Ruffle runtime and official SWFs copied');
