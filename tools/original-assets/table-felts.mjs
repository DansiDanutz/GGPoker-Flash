// Table skins and room backgrounds (tables/*). Each skin is a lit room with one poker table
// whose rail occupies the footprint the app's seat layout expects (x≈77..947, y≈133..584 on a
// 1024² canvas); rows 723..1023 stay transparent like the slot it replaces.
import { PALETTE as P } from './render.mjs';
import { rng, roundedPolygon, r2, svg } from './table-kit.mjs';

const SIZE = 1024;
const CONTENT_H = 723; // rows below this are transparent in every table skin
const RAIL_W = 44; // rail stroke width; the centre line is inset RAIL_W/2 from the outer footprint
const CENTER = [512, 358];

/** Rail centre line: a wide rounded hexagon, narrower at the far (top) edge for perspective. */
const RAIL_POINTS = [[322, 156], [702, 156], [938, 340], [842, 562], [182, 562], [86, 340]];
const scaled = (k) => RAIL_POINTS.map(([x, y]) => [r2(CENTER[0] + (x - CENTER[0]) * k), r2(CENTER[1] + (y - CENTER[1]) * k)]);

/** Colourways per table variant (felt centre/edge, felt alpha, rail leather, trim metal, motif). */
export const VARIANTS = Object.freeze({
  featured_6ring: { felt: ['#2c6b51', '#0f2a20'], alpha: 0.62, leather: ['#2a1d14', '#120c08'], trim: 'gold', lines: 2, motif: 'none' },
  table_5ring: { felt: ['#2a5f66', '#0d2427'], alpha: 0.66, leather: ['#2b2018', '#130d09'], trim: 'gold', lines: 1, motif: 'none' },
  table_envelope: { felt: ['#3f6fb4', '#132a4f'], alpha: 1, leather: ['#1d1a1f', '#0b0a0c'], trim: 'gold', lines: 1, motif: 'diamond' },
  table_plo5_envelope: { felt: ['#6a4fb8', '#24174d'], alpha: 1, leather: ['#1d1a1f', '#0b0a0c'], trim: 'gold', lines: 1, motif: 'diamond' },
  table_mystery: { felt: ['#8a2a45', '#2e0c18'], alpha: 1, leather: ['#1a1214', '#090607'], trim: 'gold', lines: 1, motif: 'stars' },
  table_supercircuit: { felt: ['#26302f', '#0a0f0e'], alpha: 1, leather: ['#16191b', '#060708'], trim: 'silver', lines: 1, motif: 'grid' },
  table_plo6_supercircuit: { felt: ['#33282a', '#0f0a0b'], alpha: 1, leather: ['#1b1416', '#080607'], trim: 'red', lines: 2, motif: 'grid' },
});

const TRIM = { gold: [P.goldLight, P.gold, P.goldDeep], silver: ['#f1f4f5', '#a9b0b5', '#5c6469'], red: ['#ff8a92', P.red2, '#6e1520'] };

/** Back wall panels, polished floor tiles in perspective and seeded dust specks. */
function room({ opaqueTo = CONTENT_H, dim = 1, seed = 7 } = {}) {
  const rand = rng(seed);
  const wallH = 112;
  const panels = Array.from({ length: 7 }, (_, i) => {
    const x = 18 + i * 144;
    return `<rect x="${x}" y="16" width="128" height="${wallH - 34}" rx="3" fill="none" stroke="${P.goldDeep}" stroke-opacity="${0.22 * dim}" stroke-width="2"/>`
      + `<rect x="${x + 52}" y="20" width="24" height="${wallH - 42}" fill="${P.gold}" opacity="${0.05 * dim}"/>`;
  }).join('');
  const horizon = wallH;
  const vanish = [512, -420];
  const rays = Array.from({ length: 23 }, (_, i) => {
    const xb = -1100 + i * 150;
    const k = (horizon - vanish[1]) / (opaqueTo - vanish[1]);
    const xt = vanish[0] + (xb - vanish[0]) * k;
    return `<line x1="${r2(xt)}" y1="${horizon}" x2="${xb}" y2="${opaqueTo}" stroke="#ffffff" stroke-opacity="${0.035 * dim}" stroke-width="1.5"/>`;
  }).join('');
  const rows = Array.from({ length: 9 }, (_, i) => {
    const y = horizon + (opaqueTo - horizon) * ((i + 1) / 9) ** 1.6;
    return `<line x1="0" y1="${r2(y)}" x2="${SIZE}" y2="${r2(y)}" stroke="#ffffff" stroke-opacity="${0.03 * dim}" stroke-width="1.2"/>`;
  }).join('');
  const specks = Array.from({ length: 140 }, () => {
    const x = rand() * SIZE;
    const y = horizon + rand() * (opaqueTo - horizon);
    return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(0.5 + rand() * 1.1)}" fill="#fff" opacity="${r2((0.08 + rand() * 0.25) * dim)}"/>`;
  }).join('');
  return `<defs>
      <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0d0c"/><stop offset="1" stop-color="#16201c"/></linearGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b100e"/><stop offset=".5" stop-color="#101814"/><stop offset="1" stop-color="#070a09"/></linearGradient>
      <radialGradient id="pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${P.gold}" stop-opacity="${0.16 * dim}"/><stop offset="1" stop-color="${P.gold}" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${SIZE}" height="${opaqueTo}" fill="url(#floor)"/>
    <rect width="${SIZE}" height="${wallH}" fill="url(#wall)"/>${panels}
    <rect y="${wallH - 4}" width="${SIZE}" height="6" fill="${P.goldDeep}" opacity="${0.35 * dim}"/>
    ${rays}${rows}${specks}
    <ellipse cx="512" cy="${CENTER[1] + 40}" rx="560" ry="300" fill="url(#pool)"/>`;
}

/** Felt texture: seeded fractal noise multiplied over the felt at low strength. */
const feltNoise = (seed) => `<filter id="noise" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0"/>
    <feComposite in2="SourceGraphic" operator="in"/></filter>`;

function motif(kind, clipId) {
  if (kind === 'diamond') {
    return `<pattern id="mot" width="46" height="30" patternUnits="userSpaceOnUse"><path d="M23 3 L41 15 L23 27 L5 15 Z" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width="1.4"/></pattern>`
      + `<rect width="${SIZE}" height="${CONTENT_H}" fill="url(#mot)" clip-path="url(#${clipId})"/>`;
  }
  if (kind === 'grid') {
    return `<pattern id="mot" width="38" height="24" patternUnits="userSpaceOnUse"><path d="M0 12 H14 L19 7 H38 M19 7 V0" fill="none" stroke="#fff" stroke-opacity=".045" stroke-width="1.2"/><circle cx="14" cy="12" r="1.8" fill="#fff" fill-opacity=".06"/></pattern>`
      + `<rect width="${SIZE}" height="${CONTENT_H}" fill="url(#mot)" clip-path="url(#${clipId})"/>`;
  }
  if (kind === 'stars') {
    const rand = rng(41);
    const stars = Array.from({ length: 70 }, () => {
      const x = 160 + rand() * 704;
      const y = 180 + rand() * 360;
      const s = 2 + rand() * 4;
      return `<path d="M${r2(x)} ${r2(y - s)} L${r2(x + s * 0.25)} ${r2(y)} L${r2(x)} ${r2(y + s)} L${r2(x - s * 0.25)} ${r2(y)} Z M${r2(x - s)} ${r2(y)} L${r2(x)} ${r2(y + s * 0.25)} L${r2(x + s)} ${r2(y)} L${r2(x)} ${r2(y - s * 0.25)} Z" fill="${P.goldLight}" opacity="${r2(0.06 + rand() * 0.14)}"/>`;
    }).join('');
    return `<g clip-path="url(#${clipId})">${stars}</g>`;
  }
  return '';
}

/** Table body: drop shadow, felt (optionally translucent), leather rail with metal piping. */
function table(v, { dim = 1 } = {}) {
  const rail = roundedPolygon(RAIL_POINTS, 120);
  const [t0, t1, t2] = TRIM[v.trim];
  const lines = Array.from({ length: v.lines }, (_, i) => {
    const d = roundedPolygon(scaled(0.8 - i * 0.045), 96);
    return `<path d="${d}" fill="none" stroke="${t1}" stroke-opacity="${(0.55 - i * 0.2) * dim}" stroke-width="${i ? 1.5 : 2.5}"/>`;
  }).join('');
  return `<defs>
      <radialGradient id="felt" cx=".5" cy=".45" r=".62"><stop offset="0" stop-color="${v.felt[0]}"/><stop offset="1" stop-color="${v.felt[1]}"/></radialGradient>
      <linearGradient id="leather" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${v.leather[0]}"/><stop offset="1" stop-color="${v.leather[1]}"/></linearGradient>
      <linearGradient id="trim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t0}"/><stop offset=".5" stop-color="${t1}"/><stop offset="1" stop-color="${t2}"/></linearGradient>
      <clipPath id="feltClip"><path d="${rail}"/></clipPath>
      <filter id="blur18" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
      <filter id="blur6" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>
      ${feltNoise(11)}
    </defs>
    <path d="${rail}" transform="translate(0 26)" fill="#000" stroke="#000" stroke-width="${RAIL_W + 20}" opacity=".7" filter="url(#blur18)"/>
    <g opacity="${v.alpha}"><path d="${rail}" fill="url(#felt)"/><path d="${rail}" fill="#fff" filter="url(#noise)"/></g>
    ${motif(v.motif, 'feltClip')}
    <path d="${rail}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="${RAIL_W + 34}" clip-path="url(#feltClip)" filter="url(#blur6)"/>
    ${lines}
    <path d="${rail}" fill="none" stroke="url(#trim)" stroke-width="${RAIL_W + 4}"/>
    <path d="${rail}" fill="none" stroke="url(#leather)" stroke-width="${RAIL_W - 4}"/>
    <path d="${rail}" transform="translate(0 -7)" fill="none" stroke="#fff" stroke-opacity="${0.08 * dim}" stroke-width="8"/>
    <path d="${rail}" fill="none" stroke="#fff" stroke-opacity="${0.06 * dim}" stroke-width="2" stroke-dasharray="3 9"/>
    <text x="512" y="${CENTER[1] + 92}" text-anchor="middle" font-family="Georgia, serif" font-size="44" font-weight="700" letter-spacing="10" fill="${t1}" opacity="${0.12 * dim}">DanGG</text>`;
}

/** Mask that cuts the felt area out of the room so a translucent felt shows the app beneath. */
const feltHole = () => `<defs><mask id="hole" maskUnits="userSpaceOnUse" x="0" y="0" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#fff"/><path d="${roundedPolygon(RAIL_POINTS, 120)}" fill="#000"/></mask></defs>`;

const page = (body) => `<div style="width:${SIZE}px;height:${SIZE}px">${svg(SIZE, SIZE, body)}</div>`;

/** HTML for every tables/* file, keyed by relative path, with its pixel size. */
export function tableJobs() {
  const jobs = Object.entries(VARIANTS).map(([name, v], i) => ({
    path: `tables/${name}.png`, w: SIZE, h: SIZE,
    html: page(`${v.alpha < 1 ? feltHole() : ''}<g${v.alpha < 1 ? ' mask="url(#hole)"' : ''}>${room({ seed: 7 + i })}</g>${table(v)}`),
  }));
  const darkTable = { ...VARIANTS.featured_6ring, felt: ['#0c1210', '#050807'], alpha: 1, lines: 1, motif: 'none' };
  jobs.push({
    path: 'tables/room_dark.png', w: SIZE, h: SIZE,
    html: page(`${room({ opaqueTo: SIZE, dim: 0.55, seed: 3 })}<g opacity=".55">${table(darkTable, { dim: 0.4 })}</g>`
      + `<rect width="${SIZE}" height="${SIZE}" fill="#000" opacity=".35"/>`),
  });
  jobs.push({ path: 'tables/room_floor.png', w: 1200, h: 220, html: floorStrip() });
  return jobs;
}

/** 1200×220 stone floor strip: opaque rows 0..111, transparent below (as the slot expects). */
function floorStrip() {
  const W = 1200;
  const H = 112;
  const rand = rng(19);
  const joints = Array.from({ length: 17 }, (_, i) => {
    const xb = -200 + i * 100;
    const xt = 600 + (xb - 600) * 0.55;
    return `<line x1="${r2(xt)}" y1="0" x2="${xb}" y2="${H}" stroke="#fff" stroke-opacity=".05" stroke-width="1.4"/>`;
  }).join('');
  const rows = [0.18, 0.4, 0.68].map((k) => `<line x1="0" y1="${r2(H * k)}" x2="${W}" y2="${r2(H * k)}" stroke="#fff" stroke-opacity=".04"/>`).join('');
  const specks = Array.from({ length: 90 }, () => `<circle cx="${r2(rand() * W)}" cy="${r2(rand() * H)}" r="${r2(0.4 + rand())}" fill="#fff" opacity="${r2(0.05 + rand() * 0.2)}"/>`).join('');
  const body = `<defs><linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121a17"/><stop offset="1" stop-color="#090c0b"/></linearGradient>
      <radialGradient id="glow" cx=".5" cy="0" r=".6"><stop offset="0" stop-color="${P.gold}" stop-opacity=".12"/><stop offset="1" stop-color="${P.gold}" stop-opacity="0"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#fl)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>${joints}${rows}${specks}`;
  return svg(W, 220, body);
}
