#!/usr/bin/env node
/**
 * Portrait key art for the slot catalogue (480x600), one per game.
 * Pure vector emblems (no font/emoji dependency, so it renders identically in
 * every browser and in <img> context).
 * Run: node tools/slot-art.mjs -> app/public/assets/slots/<id>.svg
 */
import fs from 'node:fs';
import path from 'node:path';
import { SLOT_GAMES } from '../app/server/slots.js';

const OUT = path.resolve(import.meta.dirname, '../app/public/assets/slots');
const W = 480, H = 600;
const GOLD = '#f2c45c';

// One emblem per reel symbol, drawn in a 100x100 box centred on 0,0.
const EMBLEMS = {
  cherry: `<path d="M0 6C-4 -14 -20 -26 -34 -30" stroke="#7a4a1e" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M0 6C2 -18 16 -30 30 -34" stroke="#7a4a1e" stroke-width="6" fill="none" stroke-linecap="round"/>
    <circle cx="-22" cy="14" r="26" fill="#d5202f"/><circle cx="-22" cy="14" r="26" fill="url(#gloss)"/>
    <circle cx="24" cy="18" r="22" fill="#b31624"/><circle cx="24" cy="18" r="22" fill="url(#gloss)"/>`,
  lemon: `<ellipse cx="0" cy="4" rx="36" ry="30" fill="#e8c22f"/><ellipse cx="0" cy="4" rx="36" ry="30" fill="url(#gloss)"/>
    <path d="M-30 -18C-10 -34 14 -32 28 -22" stroke="#fff3b0" stroke-width="5" fill="none" opacity=".7"/>
    <path d="M2 -26C10 -44 30 -46 38 -40 30 -30 16 -24 2 -26z" fill="#4fae4a"/>`,
  bell: `<path d="M0 -40c16 0 26 13 26 30 0 12 5 18 12 24H-38c7-6 12-12 12-24 0-17 10-30 26-30z" fill="${GOLD}"/>
    <rect x="-10" y="14" width="20" height="8" rx="3" fill="#b8862f"/><circle cx="0" cy="26" r="8" fill="${GOLD}"/>
    <path d="M-12 -30c-8 6-12 16-12 26" stroke="#fff4cc" stroke-width="4" fill="none" opacity=".65"/>`,
  star: `<path d="M0 -44l13 28 30 3-23 20 6 30L0 21l-26 16 6-30-23-20 30-3z" fill="${GOLD}"/>
    <path d="M0 -30l8 17 18 2-14 12 4 18L0 11l-16 8 4-18-14-12 18-2z" fill="#fff0bd" opacity=".55"/>`,
  diamond: `<path d="M0 -38l30 22-30 54-30-54z" fill="#63d2f0"/>
    <path d="M0 -38l30 22H-30z" fill="#a8ecff"/><path d="M0 38l-30-54h18L0 38z" fill="#2f9cbd" opacity=".8"/>
    <path d="M0 38l30-54H12z" fill="#1d7f9c" opacity=".8"/>`,
  seven: `<path d="M-34 -34h68v14L4 40H-16l30-60H-34z" fill="#e2454f"/>
    <path d="M-34 -34h68v8H-28z" fill="#ff9aa0" opacity=".6"/>`,
  clover: `<circle cx="-16" cy="-10" r="19" fill="#3fbf63"/><circle cx="16" cy="-10" r="19" fill="#3fbf63"/>
    <circle cx="0" cy="14" r="19" fill="#2f9c4d"/><path d="M0 20v26" stroke="#2f7a3c" stroke-width="7" stroke-linecap="round"/>`,
  wild: `<path d="M0 -46l10 26 27-9-15 24 22 16-28 2 3 28L0 24l-19 17 3-28-28-2 22-16-15-24 27 9z" fill="#c78bf0"/>
    <circle cx="0" cy="-2" r="12" fill="#2a1136"/><circle cx="0" cy="-2" r="6" fill="#f2c45c"/>`,
};

const HEADLINE = {
  'olympus-gold': 'bell', 'disco-cat': 'diamond', 'robo-rush': 'star',
  'clover-cash': 'clover', 'seven-samurai': 'seven', 'wild-jungle': 'wild',
};
const STRIP = {
  'olympus-gold': ['cherry', 'lemon', 'bell'], 'disco-cat': ['diamond', 'star', 'wild'],
  'robo-rush': ['star', 'diamond', 'bell'], 'clover-cash': ['clover', 'cherry', 'lemon'],
  'seven-samurai': ['seven', 'clover', 'star'], 'wild-jungle': ['wild', 'clover', 'cherry'],
};

const emblem = (key, x, y, size, opacity = 1) =>
  `<g transform="translate(${x} ${y}) scale(${size / 100})" opacity="${opacity}">${EMBLEMS[key] || EMBLEMS.star}</g>`;

function tile(game) {
  const head = HEADLINE[game.id] || 'star';
  const strip = STRIP[game.id] || ['cherry', 'lemon', 'bell'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2=".35" y2="1">
      <stop offset="0" stop-color="${game.accent}" stop-opacity=".42"/>
      <stop offset=".52" stop-color="#121013"/><stop offset="1" stop-color="#050506"/>
    </linearGradient>
    <radialGradient id="halo" cx=".5" cy=".42" r=".5">
      <stop offset="0" stop-color="${game.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${game.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope=".05"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="240" cy="250" rx="215" ry="215" fill="url(#halo)"/>
  <circle cx="240" cy="240" r="152" fill="none" stroke="${game.accent}" stroke-opacity=".38" stroke-width="2"/>
  <circle cx="240" cy="240" r="128" fill="#0a0a0c" fill-opacity=".6" stroke="${game.accent}" stroke-opacity=".22"/>
  ${emblem(head, 240, 240, 210)}
  <g opacity=".95">${emblem(strip[0], 96, 522, 58)}${emblem(strip[1], 240, 522, 58)}${emblem(strip[2], 384, 522, 58)}</g>
  <rect width="${W}" height="${H}" fill="url(#grain)"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" stroke="#d8b15f" stroke-opacity=".25"/>
</svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const game of SLOT_GAMES) {
  fs.writeFileSync(path.join(OUT, `${game.id}.svg`), tile(game));
  console.log('wrote', game.id);
}
