// Shared drawing helpers for the lobby/promo/chrome art: fonts, seeded randomness and
// reusable SVG pieces (playing cards, chips, chip stacks, sparkles).
import { PALETTE } from '../render.mjs';

export { PALETTE };

export const FONT = Object.freeze({
  sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  display: "'Avenir Next', 'Helvetica Neue', Helvetica, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: 'Menlo, monospace',
});

/** Deterministic xorshift PRNG returning floats in [0, 1). */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Wrap SVG markup in a full-size root element. */
export const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><defs>${defs}</defs>${body}</svg>`;

const SUIT = Object.freeze({ s: ['♠', '#16181a'], h: ['♥', PALETTE.red], d: ['♦', PALETTE.red], c: ['♣', '#16181a'] });

/** A playing card face, origin at its centre, rotated by `rot` degrees. */
export function card(cx, cy, w, rank, suit, rot = 0, id = 'c') {
  const h = w * 1.4;
  const [glyph, ink] = SUIT[suit];
  const r = w * 0.07;
  const corner = (flip) => `<g ${flip ? `transform="rotate(180)"` : ''}>
    <text x="${-w / 2 + w * 0.1}" y="${-h / 2 + w * 0.24}" font-family="${FONT.serif}" font-weight="700" font-size="${w * 0.2}" fill="${ink}">${rank}</text>
    <text x="${-w / 2 + w * 0.1}" y="${-h / 2 + w * 0.44}" font-family="${FONT.serif}" font-size="${w * 0.17}" fill="${ink}">${glyph}</text></g>`;
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">
    <rect x="${-w / 2 + 3}" y="${-h / 2 + 6}" width="${w}" height="${h}" rx="${r}" fill="#000" opacity=".45" filter="url(#${id}-blur)"/>
    <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${r}" fill="url(#${id}-face)" stroke="#c9bfa8" stroke-width="1"/>
    <rect x="${-w / 2 + w * 0.06}" y="${-h / 2 + w * 0.06}" width="${w * 0.88}" height="${h - w * 0.12}" rx="${r * 0.6}" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".35" stroke-width="1"/>
    ${corner(false)}${corner(true)}
    <text x="0" y="${w * 0.2}" text-anchor="middle" font-family="${FONT.serif}" font-size="${w * 0.62}" fill="${ink}">${glyph}</text>
  </g>`;
}

/** Defs needed by `card` (face gradient and soft shadow blur). */
export const cardDefs = (id = 'c') => `
  <linearGradient id="${id}-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf8f1"/><stop offset="1" stop-color="#e4dccb"/></linearGradient>
  <filter id="${id}-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>`;

const CHIP_COLORS = Object.freeze({
  red: ['#b32635', '#7c1621', '#f3e9d6'],
  black: ['#1c1d1f', '#0b0b0c', PALETTE.gold],
  cream: ['#ece2cc', '#b9ab8c', '#1c1d1f'],
  green: ['#2e7d55', '#1b4d34', '#f3e9d6'],
  gold: ['#d8b15f', '#8f6a2a', '#fff3cf'],
  blue: ['#2f6fb3', '#1b4270', '#f3e9d6'],
  purple: ['#6b4bb3', '#3f2a73', '#f3e9d6'],
});

/** Edge stripes on the visible (front) half of a chip side band. */
function chipStripes(cx, y, rx, t, stripe) {
  const marks = [];
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2 + 0.26;
    if (Math.sin(a) <= 0.12) continue;
    const x = cx + rx * Math.cos(a);
    const wv = Math.max(1.5, rx * 0.2 * Math.sin(a));
    marks.push(`<rect x="${(x - wv / 2).toFixed(1)}" y="${(y - t).toFixed(1)}" width="${wv.toFixed(1)}" height="${t.toFixed(1)}" fill="${stripe}"/>`);
  }
  return marks.join('');
}

/** Top face of a chip seen in perspective, with a dashed edge and inner ring. */
export function chipTop(cx, y, rx, color = 'red', glyph = '') {
  const [main, , stripe] = CHIP_COLORS[color];
  const ry = rx * 0.4;
  const dash = (Math.PI * rx * 2) / 24;
  return `<ellipse cx="${cx}" cy="${y}" rx="${rx}" ry="${ry}" fill="${main}"/>
    <ellipse cx="${cx}" cy="${y}" rx="${rx * 0.93}" ry="${ry * 0.93}" fill="none" stroke="${stripe}" stroke-width="${rx * 0.12}" stroke-dasharray="${dash * 0.55} ${dash * 1.45}"/>
    <ellipse cx="${cx}" cy="${y}" rx="${rx * 0.66}" ry="${ry * 0.66}" fill="none" stroke="${stripe}" stroke-opacity=".7" stroke-width="1.2"/>
    <ellipse cx="${cx}" cy="${y - ry * 0.08}" rx="${rx * 0.6}" ry="${ry * 0.5}" fill="#fff" opacity=".08"/>
    ${glyph ? `<text x="${cx}" y="${y + ry * 0.32}" text-anchor="middle" font-family="${FONT.serif}" font-size="${ry * 1.1}" fill="${stripe}" transform="translate(0 0)">${glyph}</text>` : ''}`;
}

/** A stack of `n` chips standing on baseY (the bottom chip's lower edge). */
export function chipStack(cx, baseY, n, rx, color = 'red', glyph = '') {
  const [main, side, stripe] = CHIP_COLORS[color];
  const ry = rx * 0.4;
  const t = rx * 0.17;
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const y = baseY - i * t;
    const jitter = ((i * 37) % 5) - 2;
    const x = cx + jitter * 0.6;
    parts.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${side}"/>
      <rect x="${x - rx}" y="${y - t}" width="${rx * 2}" height="${t}" fill="${main}"/>
      ${chipStripes(x, y, rx, t, stripe)}
      <rect x="${x - rx}" y="${y - t}" width="${rx * 2}" height="${t}" fill="url(#shade-side)"/>`);
  }
  const topY = baseY - n * t;
  const topX = cx + ((((n - 1) * 37) % 5) - 2) * 0.6;
  return `<g>${parts.join('')}${chipTop(topX, topY, rx, color, glyph)}</g>`;
}

/** Horizontal shading used on every chip side band. */
export const chipDefs = () => `<linearGradient id="shade-side" x1="0" x2="1">
  <stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".35" stop-color="#fff" stop-opacity=".12"/>
  <stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>`;

/** Four-point sparkle star. */
export const sparkle = (x, y, s, color = PALETTE.goldLight, op = 1) =>
  `<path d="M${x} ${y - s}Q${x + s * 0.14} ${y - s * 0.14} ${x + s} ${y}Q${x + s * 0.14} ${y + s * 0.14} ${x} ${y + s}Q${x - s * 0.14} ${y + s * 0.14} ${x - s} ${y}Q${x - s * 0.14} ${y - s * 0.14} ${x} ${y - s}Z" fill="${color}" opacity="${op}"/>`;

/** Scatter of glowing gold dust particles in a box. */
export function dust(seed, x0, y0, w, h, count, maxR = 2.2, color = PALETTE.goldLight) {
  const r = rng(seed);
  return Array.from({ length: count }, () => {
    const cx = x0 + r() * w;
    const cy = y0 + r() * h;
    const rad = 0.5 + r() * maxR;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(2)}" fill="${color}" opacity="${(0.15 + r() * 0.6).toFixed(2)}"/>`;
  }).join('');
}

/** A faceted gem (top-down brilliant), centred at cx,cy with radius r. */
export function gem(cx, cy, r, light = '#9fe8ff', deep = '#1d6fa8') {
  const pts = (rad, off = 0) => Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + off;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a) * 0.85];
  });
  const outer = pts(r, Math.PI / 8);
  const inner = pts(r * 0.52, Math.PI / 8);
  const facets = outer.map((p, i) => {
    const q = outer[(i + 1) % 8];
    const a = inner[i];
    const b = inner[(i + 1) % 8];
    const shade = i % 2 ? light : deep;
    return `<path d="M${p}L${q}L${b}L${a}Z" fill="${shade}" opacity="${0.75 + (i % 3) * 0.08}"/>`;
  }).join('');
  return `<g>${facets}<path d="M${inner.join('L')}Z" fill="${light}" opacity=".9"/>
    <path d="M${outer.join('L')}Z" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="${Math.max(0.8, r * 0.04)}"/>
    ${sparkle(cx - r * 0.25, cy - r * 0.3, r * 0.28, '#fff', 0.9)}</g>`;
}
