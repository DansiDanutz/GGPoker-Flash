// Shared pieces for the home-feed and series art (ui/creatives). Drawn at 1x coordinates and
// rendered at SCALE so the art stays sharp on high-density screens.
import { FONT, PALETTE, cardDefs, chipDefs, sparkle } from './shared.mjs';

export const SCALE = 2;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** SVG root with a 1x viewBox drawn at SCALE. */
export const frame = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SCALE}" height="${h * SCALE}" viewBox="0 0 ${w} ${h}" style="display:block"><defs>${baseDefs()}${defs}</defs>${body}</svg>`;

function baseDefs() {
  return `${cardDefs('k')}${chipDefs()}
    <linearGradient id="goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c8"/><stop offset=".45" stop-color="${PALETTE.gold}"/><stop offset="1" stop-color="${PALETTE.goldDeep}"/></linearGradient>
    <linearGradient id="goldtext" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8"/><stop offset=".5" stop-color="#f1cf7e"/><stop offset=".52" stop-color="#d9a744"/><stop offset="1" stop-color="#a6782e"/></linearGradient>
    <linearGradient id="silverv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b9c2cc"/><stop offset="1" stop-color="#59626c"/></linearGradient>
    <linearGradient id="redv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALETTE.red2}"/><stop offset="1" stop-color="#5e0f1a"/></linearGradient>
    <linearGradient id="greenv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#43b56a"/><stop offset="1" stop-color="#1f6b35"/></linearGradient>
    <linearGradient id="purplev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a54c8"/><stop offset="1" stop-color="#2c1856"/></linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity=".7"/></filter>`;
}

/** Rounded panel filled with a radial tint, the base of every card. */
export function panel(id, w, h, tint, { r = 10, cx = 0.7, cy = 0.3 } = {}) {
  const def = `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r=".95"><stop offset="0" stop-color="${tint}"/><stop offset=".65" stop-color="#0d0f12"/><stop offset="1" stop-color="#07080a"/></radialGradient>`;
  const body = `<rect width="${w}" height="${h}" rx="${r}" fill="url(#${id})"/>
    <rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${r}" fill="none" stroke="#fff" stroke-opacity=".08"/>`;
  return { def, body };
}

/** Light streaks across a panel. */
export const streaks = (w, h, n = 3, op = 0.035) => Array.from({ length: n }, (_, i) =>
  `<path d="M${w * 0.35 + i * w * 0.22} 0L${w * 0.1 + i * w * 0.22} ${h}" stroke="#fff" stroke-opacity="${op}" stroke-width="${w * 0.08}"/>`).join('');

export function text(x, y, value, { size = 16, weight = 800, fill = '#fff', anchor = 'start', font = FONT.display, spacing = 0, stroke = '', opacity = 1, filter = 'drop' } = {}) {
  const outline = stroke ? `stroke="${stroke}" stroke-width="${size * 0.12}" paint-order="stroke" stroke-linejoin="round"` : '';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}" fill="${fill}" opacity="${opacity}" ${outline} ${filter ? `filter="url(#${filter})"` : ''}>${esc(value)}</text>`;
}

/** Capsule button drawn into the art (the whole card is the click target). */
export function pill(cx, cy, label, w = 84, fill = 'url(#greenv)') {
  return `<rect x="${cx - w / 2}" y="${cy - 13}" width="${w}" height="26" rx="13" fill="${fill}" stroke="#000" stroke-opacity=".4"/>
    <rect x="${cx - w / 2 + 2}" y="${cy - 11}" width="${w - 4}" height="11" rx="6" fill="url(#gloss)"/>
    ${text(cx, cy + 4.5, label, { size: 12, anchor: 'middle', filter: '' })}`;
}

/** Trophy cup with a motif on its face. */
export function trophy(cx, cy, s = 1, motif = '♠') {
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
    <path d="M-30 -48H30V-20Q30 8 0 12Q-30 8 -30 -20Z" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="2"/>
    <path d="M-30 -40Q-50 -40 -45 -24Q-41 -14 -27 -12M30 -40Q50 -40 45 -24Q41 -14 27 -12" fill="none" stroke="url(#goldv)" stroke-width="5"/>
    <rect x="-6" y="12" width="12" height="10" fill="${PALETTE.goldDeep}"/><rect x="-18" y="20" width="36" height="9" rx="2" fill="url(#goldv)"/>
    <path d="M-20 -42Q-22 -16 -8 -4" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>
    <text y="-14" text-anchor="middle" font-family="${FONT.serif}" font-size="26" fill="#2a1a06">${motif}</text>
  </g>`;
}

/** Ring of gold and a dark centre: the medallion on tournament banners. */
export function medallion(cx, cy, r, inner, tint = '#3a1418') {
  const rays = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return `<path d="M0 0L${(r * 1.45 * Math.cos(a)).toFixed(1)} ${(r * 1.45 * Math.sin(a)).toFixed(1)}L${(r * 1.45 * Math.cos(a + 0.09)).toFixed(1)} ${(r * 1.45 * Math.sin(a + 0.09)).toFixed(1)}Z" fill="${PALETTE.goldLight}" opacity=".12"/>`;
  }).join('');
  const notches = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return `<circle cx="${((r - 4) * Math.cos(a)).toFixed(1)}" cy="${((r - 4) * Math.sin(a)).toFixed(1)}" r="1.4" fill="#fff4cf" opacity=".8"/>`;
  }).join('');
  return `<g transform="translate(${cx} ${cy})">${rays}
    <circle r="${r + 3}" fill="#000" opacity=".5" filter="url(#soft)"/>
    <circle r="${r}" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="2"/>${notches}
    <circle r="${r - 9}" fill="${tint}" stroke="#2a1a06" stroke-width="2"/>
    <circle r="${r - 9}" fill="url(#gloss)"/>
    ${inner}</g>`;
}

/** Plain top-down poker table (felt, rail, seats) centred on cx, cy. */
export function miniTable(cx, cy, rx, ry, felt, seats = 6) {
  const seatDots = Array.from({ length: seats }, (_, i) => {
    const a = (i / seats) * Math.PI * 2 + Math.PI / 2;
    const x = cx + (rx + 9) * Math.cos(a);
    const y = cy + (ry + 9) * Math.sin(a);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="#20252a" stroke="#4a525a" stroke-width="1.5"/>
      <circle cx="${x.toFixed(1)}" cy="${(y - 2).toFixed(1)}" r="3" fill="#7d8790"/><path d="M${(x - 5).toFixed(1)} ${(y + 5).toFixed(1)}Q${x.toFixed(1)} ${(y - 1).toFixed(1)} ${(x + 5).toFixed(1)} ${(y + 5).toFixed(1)}" fill="#7d8790"/>`;
  }).join('');
  return `<ellipse cx="${cx}" cy="${cy + 4}" rx="${rx + 8}" ry="${ry + 8}" fill="#000" opacity=".55" filter="url(#soft)"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx + 6}" ry="${ry + 6}" fill="#2a1d14" stroke="#5a4636" stroke-width="1.5"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${felt}"/>
    <ellipse cx="${cx}" cy="${cy - ry * 0.25}" rx="${rx * 0.8}" ry="${ry * 0.55}" fill="#fff" opacity=".06"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.72}" ry="${ry * 0.62}" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".35"/>
    ${seatDots}`;
}

export { sparkle };
