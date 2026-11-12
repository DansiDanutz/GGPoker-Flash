// Rewards art: the deep-sea banner and eight rank crests (bronze -> diamond), each with an
// original sea-creature emblem. Crests are centred on a transparent canvas of the manifest size.
import { renderPng, manifestEntries } from '../render.mjs';
import { PALETTE, svg, rng, dust, gem, sparkle } from './shared.mjs';
import { CREATURES, RANK_CREATURES } from './creatures.mjs';

/** Per-rank metal [light, mid, dark] and inner-disk tint, increasing in prestige. */
const TIERS = Object.freeze([
  { metal: ['#f2c49a', '#b8743f', '#5e3415'], sea: '#0e3a52' },
  { metal: ['#ffffff', '#b9c2cc', '#59626c'], sea: '#0e3a56' },
  { metal: [PALETTE.goldLight, PALETTE.gold, '#6e4f1c'], sea: '#0d3b5a' },
  { metal: ['#c8f7da', '#3fbf7a', '#14502f'], sea: '#0a3b4a' },
  { metal: ['#cfe4ff', '#3f7fdc', '#163a78'], sea: '#0b2f5c' },
  { metal: ['#ecd6ff', '#9a5ce0', '#43206e'], sea: '#1e2152' },
  { metal: ['#ffd0d6', '#d33746', '#5e0f1a'], sea: '#2a1838' },
  { metal: ['#ffffff', '#bfefff', '#4fa7c9'], sea: '#0b2a48' },
]);

const C = 120; // crest centre in its 240x240 viewBox
/** Tighter crops for plainer crests so every rank fills its canvas similarly. */
const VIEWBOX = Object.freeze(['28 28 184 186', '28 28 184 186', '22 22 196 196', '22 22 196 196', '0 0 240 240']);

function crestDefs(tier) {
  const [l, m, d] = TIERS[tier].metal;
  return `<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l}"/><stop offset=".45" stop-color="${m}"/><stop offset="1" stop-color="${d}"/></linearGradient>
    <linearGradient id="metal2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l}"/><stop offset=".5" stop-color="${m}"/><stop offset="1" stop-color="${d}"/></linearGradient>
    <radialGradient id="sea" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="${TIERS[tier].sea}"/><stop offset="1" stop-color="#03101a"/></radialGradient>
    <radialGradient id="aura"><stop offset="0" stop-color="${l}" stop-opacity=".55"/><stop offset="1" stop-color="${l}" stop-opacity="0"/></radialGradient>`;
}

function rays(count, inner, outer) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const b = a + Math.PI / count / 1.6;
    const p = (r, t) => `${(C + r * Math.cos(t)).toFixed(1)} ${(C + r * Math.sin(t)).toFixed(1)}`;
    return `<path d="M${p(inner, a)}L${p(outer, (a + b) / 2)}L${p(inner, b)}Z" fill="url(#metal)" opacity=".7"/>`;
  }).join('');
}

function laurel(side, leaves) {
  const out = [];
  for (let i = 0; i < leaves; i += 1) {
    const deg = 125 + i * (110 / Math.max(1, leaves - 1));
    const a = (deg * Math.PI) / 180;
    const x = C + side * -96 * Math.cos(a);
    const y = C + 96 * Math.sin(a) * -1 + 10;
    const rot = side > 0 ? 180 - deg + 90 : deg - 90;
    out.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="16" ry="7" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="url(#metal2)" stroke="#1a1410" stroke-width="1.5"/>`);
  }
  return out.join('');
}

function scallops(n, r, size) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return `<circle cx="${(C + r * Math.cos(a)).toFixed(1)}" cy="${(C + r * Math.sin(a)).toFixed(1)}" r="${size}" fill="url(#metal)" stroke="#1a1410" stroke-width="1.5"/>`;
  }).join('');
}

const crown = () => `<g transform="translate(${C} 26)"><path d="M-34 22L-40 -10L-17 6L0 -18L17 6L40 -10L34 22Z" fill="url(#metal)" stroke="#1a1410" stroke-width="2.5" stroke-linejoin="round"/>
  ${gem(0, 8, 7, '#ffffff', '#6fd0ff')}<circle cx="-40" cy="-12" r="4" fill="url(#metal)"/><circle cx="40" cy="-12" r="4" fill="url(#metal)"/><circle cx="0" cy="-20" r="4" fill="url(#metal)"/></g>`;

function pips(tier, y) {
  const n = tier + 1;
  const gap = 11;
  const x0 = C - ((n - 1) * gap) / 2;
  return Array.from({ length: n }, (_, i) => sparkle(x0 + i * gap, y, 5, '#fff7e0')).join('');
}

function crest(tier) {
  const parts = [`<circle cx="${C}" cy="${C}" r="${100 + tier * 3}" fill="url(#aura)"/>`];
  if (tier >= 7) parts.push(rays(24, 70, 118));
  if (tier >= 4) parts.push(laurel(1, 4 + tier - 4), laurel(-1, 4 + tier - 4));
  if (tier >= 2) parts.push(scallops(14 + tier * 2, 80, 8 + tier * 0.4));
  parts.push(`<circle cx="${C}" cy="${C}" r="82" fill="url(#metal)" stroke="#1a1410" stroke-width="3"/>
    <circle cx="${C}" cy="${C}" r="72" fill="url(#metal2)"/>
    <circle cx="${C}" cy="${C}" r="64" fill="url(#sea)" stroke="#1a1410" stroke-width="2.5"/>
    ${dust(tier + 3, C - 50, C - 50, 100, 100, 14, 1.4, '#bfeaff')}
    <g transform="translate(${C - 60} ${C - 60}) scale(.6)">${CREATURES[RANK_CREATURES[tier]]()}</g>
    <path d="M${C - 60} ${C - 24}A64 64 0 0 1 ${C + 36} ${C - 54}" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="5" stroke-linecap="round"/>`);
  if (tier >= 6) parts.push([0, 90, 180, 270].map((deg) => { const a = (deg * Math.PI) / 180; return gem(C + 77 * Math.cos(a), C + 77 * Math.sin(a), 9, '#ffe3ea', '#c21f3a'); }).join(''));
  if (tier >= 3) {
    parts.push(`<path d="M${C - 66} 186L${C - 54} 172H${C + 54}L${C + 66} 186L${C + 54} 200H${C - 54}Z" fill="url(#metal2)" stroke="#1a1410" stroke-width="2"/>
      <rect x="${C - 50}" y="176" width="100" height="20" rx="3" fill="#0a1a24"/>`);
  }
  parts.push(pips(tier, tier >= 3 ? 186 : 206));
  if (tier >= 7) parts.push(crown());
  return parts.join('');
}

function crestSvg(tier, w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${VIEWBOX[Math.min(tier, 4)]}" preserveAspectRatio="xMidYMid meet" style="display:block"><defs>${crestDefs(tier)}</defs>${crest(tier)}</svg>`;
}

function coral(r, x, y, len, ang, depth, color) {
  if (depth === 0 || len < 4) return '';
  const x2 = x + len * Math.cos(ang);
  const y2 = y + len * Math.sin(ang);
  const branch = `<path d="M${x.toFixed(1)} ${y.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${color}" stroke-width="${(depth * 1.6).toFixed(1)}" stroke-linecap="round"/>`;
  const spread = 0.35 + r() * 0.3;
  return branch + coral(r, x2, y2, len * (0.7 + r() * 0.15), ang - spread, depth - 1, color) + coral(r, x2, y2, len * (0.7 + r() * 0.15), ang + spread, depth - 1, color);
}

function bannerSvg() {
  const w = 816;
  const h = 400;
  const r = rng(816);
  const raysSvg = Array.from({ length: 9 }, (_, i) => `<path d="M${380 + i * 26} 0L${250 + i * 60} ${h * 0.8}L${280 + i * 60} ${h * 0.8}L${396 + i * 26} 0Z" fill="#bfeaff" opacity="${(0.025 + r() * 0.03).toFixed(3)}"/>`).join('');
  const bubbles = Array.from({ length: 34 }, () => `<circle cx="${(420 + r() * 200).toFixed(1)}" cy="${(r() * 220).toFixed(1)}" r="${(1 + r() * 3).toFixed(1)}" fill="none" stroke="#cfefff" stroke-opacity="${(0.25 + r() * 0.4).toFixed(2)}"/>`).join('');
  const body = `<rect width="${w}" height="${h}" fill="url(#deep)"/>
    <ellipse cx="460" cy="-20" rx="260" ry="120" fill="#7fd6ff" opacity=".18" filter="url(#blur)"/>
    ${raysSvg}${bubbles}
    <g opacity=".85" filter="url(#soft)" transform="translate(430 20) scale(1.4)">${CREATURES.whale().replace(/#[0-9a-fA-F]{6}\b|#fff\b/g, '#061b2b').replace(/stroke-width="[\d.]+"/g, 'stroke-width="0"')}</g>
    <path d="M0 ${h}V250Q90 230 170 262Q260 236 360 268Q470 244 560 270Q680 240 816 262V${h}Z" fill="#071b28"/>
    <g opacity=".6">${coral(r, 150, 300, 46, -1.8, 6, '#a3263a')}${coral(r, 240, 300, 36, -1.4, 5, '#6b3aa0')}${coral(r, 690, 300, 44, -1.6, 6, '#a3263a')}${coral(r, 760, 290, 30, -1.9, 5, '#2e8a8a')}</g>
    <g transform="translate(560 290)"><ellipse cx="0" cy="22" rx="70" ry="12" fill="#000" opacity=".4"/>
      ${gem(-36, 6, 16, '#a8f0ff', '#1b6fa8')}${gem(0, -6, 22, '#c8b4ff', '#4b2fa0')}${gem(34, 8, 15, '#9ff5c8', '#1a7d4f')}
      <ellipse cx="0" cy="0" rx="90" ry="50" fill="url(#gemglow)"/></g>
    <rect width="${w}" height="${h}" fill="url(#fade)"/>`;
  const defs = `<linearGradient id="deep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f4a6a"/><stop offset=".55" stop-color="#082a40"/><stop offset="1" stop-color="#03121c"/></linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#0b0d10" stop-opacity="0"/><stop offset="1" stop-color="#0b0d10" stop-opacity=".95"/></linearGradient>
    <radialGradient id="gemglow"><stop offset="0" stop-color="#bfeaff" stop-opacity=".35"/><stop offset="1" stop-color="#bfeaff" stop-opacity="0"/></radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="1.5"/></filter><filter id="blur"><feGaussianBlur stdDeviation="30"/></filter>`;
  return svg(w, h, body, defs);
}

export async function renderOcean() {
  const out = [await renderPng('ocean/Banner_Ocean_Whale.png', bannerSvg(), 816, 400)];
  for (const e of manifestEntries('ocean/Ocean_Rewards_Rank_')) {
    const tier = Number(e.path.match(/Rank_(\d)/)[1]);
    out.push(await renderPng(e.path, crestSvg(tier, e.width, e.height), e.width, e.height));
  }
  return out;
}

export { crestSvg };
