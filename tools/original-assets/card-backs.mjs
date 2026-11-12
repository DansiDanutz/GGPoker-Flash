// Original DanGG card backs: a diamond lattice with a central rosette, in named colourways.
import { PALETTE } from './render.mjs';

/** Colourways: panel gradient (light, dark), lattice line colour, accent (rosette/frame). */
export const BACK_COLOURS = Object.freeze({
  black: { light: '#2b2b2b', dark: '#0b0b0b', line: PALETTE.gold, accent: PALETTE.goldLight },
  blue: { light: '#2f6fc0', dark: '#163a78', line: '#9cc3f2', accent: '#e6f0ff' },
  gray: { light: '#8d9196', dark: '#55595e', line: '#d6d9dc', accent: '#ffffff' },
  green: { light: '#2f8f5b', dark: '#12482c', line: '#9fdcb6', accent: PALETTE.goldLight },
  orange: { light: '#f0913a', dark: '#b4520f', line: '#ffd6a8', accent: '#fff3e2' },
  pink: { light: '#ec7fae', dark: '#b03c74', line: '#ffd0e4', accent: '#fff2f8' },
  red: { light: '#d23a48', dark: '#7e1420', line: '#f5b2b8', accent: '#fff0f1' },
});

const panelGradient = (id, c) =>
  `<radialGradient id="${id}" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="${c.light}"/><stop offset="1" stop-color="${c.dark}"/></radialGradient>`;

/** Lattice pattern: rotated grid of thin lines with a dot at every crossing. */
const lattice = (id, c, cell = 9) =>
  `<pattern id="${id}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">`
  + `<path d="M0 0H${cell}M0 0V${cell}" stroke="${c.line}" stroke-opacity=".55" stroke-width=".8" fill="none"/>`
  + `<circle cx="${cell / 2}" cy="${cell / 2}" r=".9" fill="${c.line}" fill-opacity=".5"/></pattern>`;

/** Eight-point rosette inside nested diamonds, centred at (cx, cy). */
function rosette(cx, cy, size, c, panelId) {
  const d = (s) => `M${cx} ${cy - s}L${cx + s * 0.72} ${cy}L${cx} ${cy + s}L${cx - s * 0.72} ${cy}Z`;
  const star = Array.from({ length: 16 }, (_, i) => {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 ? size * 0.22 : size * 0.5;
    return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
  return `<path d="${d(size * 1.25)}" fill="url(#${panelId})" stroke="${c.accent}" stroke-width="1.4"/>`
    + `<path d="${d(size * 1.05)}" fill="none" stroke="${c.line}" stroke-opacity=".8" stroke-width=".8"/>`
    + `<polygon points="${star}" fill="${c.accent}" fill-opacity=".9"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${size * 0.12}" fill="${c.dark}"/>`;
}

/**
 * A patterned back as SVG markup of the given size, with the card body at (x, y, w, h).
 * `border` is the white rim width (0 for a full-bleed back).
 */
export function patternBack(key, { width, height, x, y, w, h, r, border = 5, shadow = true }) {
  const c = BACK_COLOURS[key];
  const ix = x + border; const iy = y + border; const iw = w - border * 2; const ih = h - border * 2;
  const cx = x + w / 2; const cy = y + h / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>
    ${panelGradient('panel', c)}${lattice('lat', c)}
    <filter id="drop" x="-10%" y="-10%" width="125%" height="125%"><feDropShadow dx="1.2" dy="2" stdDeviation="1.6" flood-color="#000" flood-opacity=".45"/></filter>
    <clipPath id="inner"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${Math.max(2, r - border + 1)}"/></clipPath>
  </defs>
  <g${shadow ? ' filter="url(#drop)"' : ''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fbfaf6" stroke="#d8d3c8" stroke-width=".8"/></g>
  <g clip-path="url(#inner)">
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="url(#panel)"/>
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="url(#lat)"/>
    <rect x="${ix + 4}" y="${iy + 4}" width="${iw - 8}" height="${ih - 8}" rx="3" fill="none" stroke="${c.accent}" stroke-opacity=".85" stroke-width="1.2"/>
    <rect x="${ix + 7}" y="${iy + 7}" width="${iw - 14}" height="${ih - 14}" rx="2" fill="none" stroke="${c.line}" stroke-opacity=".6" stroke-width=".7"/>
    ${rosette(cx, cy, Math.min(iw, ih) * 0.3, c, 'panel')}
  </g></svg>`;
}

/** Plain red back: soft gradient, a fine inset rule and a small centred diamond. */
export function plainBack({ width, height, x, y, w, h, r }) {
  const c = BACK_COLOURS.red;
  const cx = x + w / 2; const cy = y + h / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${panelGradient('panel', c)}
    <filter id="drop" x="-10%" y="-10%" width="125%" height="125%"><feDropShadow dx="1.2" dy="2" stdDeviation="1.6" flood-color="#000" flood-opacity=".45"/></filter></defs>
    <g filter="url(#drop)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#panel)" stroke="#5e0e17" stroke-width=".8"/></g>
    <rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" rx="${r - 3}" fill="none" stroke="#f5b2b8" stroke-opacity=".45" stroke-width="1"/>
    <path d="M${cx} ${cy - 13}L${cx + 9} ${cy}L${cx} ${cy + 13}L${cx - 9} ${cy}Z" fill="#f5b2b8" fill-opacity=".35"/></svg>`;
}

/** Neutral grey DanGG back: concentric rings, a "DG" monogram and the DanGG wordmark. */
export function monogramBack({ width, height, x, y, w, h, r }) {
  const cx = x + w / 2; const cy = y + h / 2 - 6;
  const rings = [40, 33, 26].map((rr, i) => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="#e9e7e2" stroke-opacity="${0.18 + i * 0.12}" stroke-width="${i === 2 ? 1.6 : 0.8}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a8d90"/><stop offset=".55" stop-color="#6c6f73"/><stop offset="1" stop-color="#4d5054"/></linearGradient>
    <pattern id="lines" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 0V6" stroke="#fff" stroke-opacity=".06" stroke-width="2"/></pattern></defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#g)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#lines)"/>
    <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="${r - 2}" fill="none" stroke="#e9e7e2" stroke-opacity=".35" stroke-width="1"/>
    ${rings}
    <text x="${cx}" y="${cy + 10}" font-family="Georgia,serif" font-weight="700" font-size="29" fill="#f2f0ea" text-anchor="middle" letter-spacing="-1">DG</text>
    <text x="${cx}" y="${y + h - 16}" font-family="'Avenir Next','Helvetica Neue',sans-serif" font-weight="600" font-size="10" fill="#f2f0ea" fill-opacity=".8" text-anchor="middle" letter-spacing="2">DanGG</text></svg>`;
}
