#!/usr/bin/env node
/**
 * Generates the 1200x236 panoramic hero key art.
 *
 * The reference client uses a purpose-built wide banner per campaign; DanGG only
 * shipped square discover tiles. These SVG banners are vector, textless (the copy
 * is DOM text over them) and carry the focal motif in the right third so the
 * headline keeps the left 58%.
 *
 * Run: node tools/hero-art.mjs  ->  app/public/assets/hero/<key>.svg
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(import.meta.dirname, '../app/public/assets/hero');
const W = 1200, H = 236;

const DEFS = `
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="#05070a"/><stop offset=".52" stop-color="#0a0d12"/><stop offset="1" stop-color="#07080c"/>
    </linearGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".55"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".10"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9ab"/><stop offset=".45" stop-color="#e0b25c"/><stop offset="1" stop-color="#8a6220"/>
    </linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#05070a" stop-opacity=".96"/><stop offset=".42" stop-color="#05070a" stop-opacity=".55"/><stop offset=".62" stop-color="#05070a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer>
    </filter>
  </defs>`;

const shell = (accent, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" style="--accent:${accent}">
${DEFS}
  <rect width="${W}" height="${H}" fill="url(#base)"/>
  <g>${body}</g>
  <rect width="${W}" height="${H}" fill="url(#fade)"/>
  <rect width="${W}" height="${H}" fill="url(#bottom)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity=".55"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" stroke="#d8b15f" stroke-opacity=".22"/>
</svg>`;

const dots = (n, seed) => {
  let out = '';
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const px = 620 + (x / 233280) * 560;
    x = (x * 9301 + 49297) % 233280;
    const py = 18 + (x / 233280) * 190;
    x = (x * 9301 + 49297) % 233280;
    const r = .8 + (x / 233280) * 2.2;
    out += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}" fill="#f2c45c" opacity="${(.12 + (i % 5) * .07).toFixed(2)}"/>`;
  }
  return out;
};

const trophy = (cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s})">
  <ellipse cx="0" cy="86" rx="104" ry="16" fill="#000" opacity=".55" filter="url(#soft)"/>
  <path d="M-70 -96h140v34c0 46-31 78-70 78s-70-32-70-78z" fill="url(#gold)" opacity=".92"/>
  <path d="M-70 -96h140v12H-70z" fill="#fff3cf" opacity=".55"/>
  <path d="M-96 -92c-24 0-38 16-38 38 0 30 24 50 52 52" stroke="url(#gold)" stroke-width="9" fill="none"/>
  <path d="M96 -92c24 0 38 16 38 38 0 30-24 50-52 52" stroke="url(#gold)" stroke-width="9" fill="none"/>
  <path d="M-18 14h36v40h-36z" fill="url(#gold)" opacity=".85"/>
  <path d="M-62 54h124l16 26H-78z" fill="url(#gold)" opacity=".95"/>
  <path d="M-30 -70h60v26l-30 22-30-22z" fill="#3a2405" opacity=".55"/>
  <circle cx="0" cy="-46" r="15" fill="#fff6d8" opacity=".85"/>
</g>`;

const cards = (cx, cy) => `<g transform="translate(${cx} ${cy})">
  <ellipse cx="0" cy="86" rx="118" ry="15" fill="#000" opacity=".5" filter="url(#soft)"/>
  <g transform="rotate(-16)">
    <rect x="-62" y="-78" width="98" height="140" rx="10" fill="#101318" stroke="#d8b15f" stroke-opacity=".55" stroke-width="2"/>
    <path d="M-13 -22c14-26 34-6 14 14-18 18-14 22-14 22s4-8-14-22c-20-20 0-40 14-14z" fill="#c9333f"/>
  </g>
  <g transform="rotate(13) translate(34 6)">
    <rect x="-49" y="-70" width="98" height="140" rx="10" fill="#0d1014" stroke="#d8b15f" stroke-opacity=".55" stroke-width="2"/>
    <path d="M0 -34l12 26 28 4-20 20 5 28L0 30l-25 14 5-28-20-20 28-4z" fill="#f2c45c" opacity=".9"/>
  </g>
  <path d="M-150 44l64-64 22 22-64 64z" fill="#f2c45c" opacity=".22"/>
</g>`;

const wheel = (cx, cy, r) => {
  let seg = '';
  const colors = ['#7d1b24', '#141416', '#8a5f1d', '#141416', '#a82933', '#1b1b1e', '#c08a2a', '#141416', '#7d1b24', '#141416'];
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / 10) * Math.PI * 2 - Math.PI / 2;
    seg += `<path d="M0 0 L${(Math.cos(a0) * r).toFixed(1)} ${(Math.sin(a0) * r).toFixed(1)} A${r} ${r} 0 0 1 ${(Math.cos(a1) * r).toFixed(1)} ${(Math.sin(a1) * r).toFixed(1)} Z" fill="${colors[i]}" stroke="#05070a" stroke-width="2"/>`;
  }
  return `<g transform="translate(${cx} ${cy})">
    <ellipse cx="0" cy="${r + 12}" rx="${r + 16}" ry="14" fill="#000" opacity=".55" filter="url(#soft)"/>
    <circle r="${r + 12}" fill="#0c0e12" stroke="url(#gold)" stroke-width="6"/>
    ${seg}
    <circle r="${r * 0.30}" fill="url(#gold)"/>
    <circle r="${r * 0.19}" fill="#1a1206"/>
    <path d="M0 ${-r - 4}l16 30h-32z" fill="#f2c45c"/>
  </g>`;
};

const fan = (cx, cy) => `<g transform="translate(${cx} ${cy})">
  ${[-52, -31, -10, 10, 31, 52].map((a, i) => `<g transform="rotate(${a}) translate(0 -24)">
    <rect x="-30" y="-84" width="60" height="96" rx="7" fill="${i % 2 ? '#101318' : '#0c0f13'}" stroke="#d8b15f" stroke-opacity=".5" stroke-width="1.6"/>
  </g>`).join('')}
  <ellipse cx="0" cy="92" rx="120" ry="14" fill="#000" opacity=".5" filter="url(#soft)"/>
</g>`;

const crown = (cx, cy) => `<g transform="translate(${cx} ${cy})">
  <ellipse cx="0" cy="70" rx="110" ry="14" fill="#000" opacity=".55" filter="url(#soft)"/>
  <path d="M-92 34l-14-96 46 34 60-70 60 70 46-34-14 96z" fill="url(#gold)" opacity=".9"/>
  <path d="M-80 44h160l-10 26H-70z" fill="#c08a2a" opacity=".85"/>
  <circle cx="-60" cy="-4" r="7" fill="#fff2c8"/><circle cx="0" cy="-18" r="9" fill="#fff2c8"/><circle cx="60" cy="-4" r="7" fill="#fff2c8"/>
</g>`;

const streaks = () => `<g opacity=".5">
  ${[0, 1, 2, 3, 4].map((i) => `<path d="M${520 + i * 40} ${170 - i * 26}h${220 + i * 30}" stroke="url(#gold)" stroke-opacity="${.28 - i * .04}" stroke-width="${3 - i * .4}" stroke-linecap="round"/>`).join('')}
</g>`;

function art(key, accent, motif, extra = '') {
  return shell(accent, `
    <ellipse cx="960" cy="118" rx="330" ry="210" fill="url(#glow)" opacity=".85"/>
    <ellipse cx="1090" cy="30" rx="190" ry="120" fill="url(#glow)" opacity=".45"/>
    <path d="M760 236C760 80 880 0 1080 0h120v236z" fill="#ffffff" opacity=".02"/>
    ${streaks()}
    ${dots(26, key.length * 977)}
    ${motif}
    <path d="M742 -20c90 60 90 200 0 276" stroke="#d8b15f" stroke-opacity=".18" stroke-width="2"/>
    <path d="M772 -20c90 60 90 200 0 276" stroke="#d8b15f" stroke-opacity=".10" stroke-width="1"/>
    <rect x="700" y="0" width="220" height="236" fill="url(#sheen)" opacity=".35"/>
    ${extra}
  `);
}

const files = {
  flipout: art('flipout', '#f2a13c', trophy(982, 104, 1.02)),
  aof: art('aof', '#d33746', cards(986, 112)),
  rush: art('rush', '#2fd0c5', `<g transform="translate(986 118)"><ellipse cx="0" cy="86" rx="110" ry="14" fill="#000" opacity=".5" filter="url(#soft)"/><circle r="76" fill="#0e1116" stroke="url(#gold)" stroke-width="5"/><circle r="58" fill="none" stroke="#2fd0c5" stroke-opacity=".5" stroke-width="2" stroke-dasharray="6 10"/><path d="M-26 -18l52 20-52 20z" fill="#f2c45c"/></g>`),
  plo: art('plo', '#4a8fe0', fan(982, 120)),
  spin: art('spin', '#f2c45c', wheel(982, 118, 86)),
  battle: art('battle', '#a95cf0', crown(982, 128)),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [key, svg] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, `${key}.svg`), svg);
  console.log('wrote', key, svg.length, 'bytes');
}
