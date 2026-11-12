// Original DanGG squeeze art: face strips (inner sheet), card-back fill, felt and Open buttons.
import { PALETTE } from './render.mjs';
import { RANKS, SUITS, TWO_COLOUR, rankLabel, suitDefs, use } from './card-art.mjs';

const INDEX_FONT = "'Avenir Next Condensed','Helvetica Neue',Arial,sans-serif";

/**
 * The near band of a card face, gw×gh: stacked corner index at the left (the part a
 * partially covered card still shows), then a large pip / court monogram.
 */
function strip(rank, suit, gw, gh) {
  const col = TWO_COLOUR[suit];
  const label = rankLabel(rank);
  const size = gh * 0.58;
  const ix = gh * 0.3;
  const fit = label.length > 1 ? ` textLength="${size * 0.8}" lengthAdjust="spacingAndGlyphs"` : '';
  const index = `<text x="${ix}" y="${size * 0.92}" font-family="${INDEX_FONT}" font-weight="700" font-size="${size}" fill="${col}" text-anchor="middle"${fit}>${label}</text>`
    + use(suit, ix, size + gh * 0.18, gh * 0.3, col);
  const mid = gw * 0.56;
  if ('JQK'.includes(rank)) {
    return index
      + `<rect x="${mid - gh * 0.62}" y="${gh * 0.08}" width="${gh * 1.24}" height="${gh * 0.84}" rx="${gh * 0.08}" fill="${PALETTE.gold}" fill-opacity=".25" stroke="${col}" stroke-width="${gh * 0.03}"/>`
      + `<text x="${mid}" y="${gh * 0.78}" font-family="Georgia,serif" font-weight="700" font-size="${gh * 0.7}" fill="${col}" text-anchor="middle">${rank}</text>`
      + use(suit, Math.min(mid + gh * 0.95, gw - gh * 0.25), gh * 0.5, gh * 0.4, col);
  }
  const ring = rank === 'A' ? `<circle cx="${mid}" cy="${gh * 0.5}" r="${gh * 0.44}" fill="none" stroke="${PALETTE.gold}" stroke-width="${gh * 0.04}"/>` : '';
  return index + ring + use(suit, mid, gh * 0.5, gh * (rank === 'A' ? 0.6 : 0.7), col);
}

/** Glyph rectangles keyed by ordinal (rank index × 4 + suit index), 4 suit columns × 13 ranks. */
export function glyphRects(gw, gh) {
  const rects = {};
  RANKS.forEach((_, r) => SUITS.forEach((_s, s) => {
    rects[r * 4 + s] = { x: 2 + s * (gw + 2), y: 2 + r * (gh + 2), w: gw, h: gh };
  }));
  return rects;
}

export function innerSheetSvg(gw, gh, size) {
  const rects = glyphRects(gw, gh);
  const body = RANKS.flatMap((rank, r) => SUITS.map((suit, s) => {
    const g = rects[r * 4 + s];
    return `<g transform="translate(${g.x} ${g.y})" clip-path="url(#cell)">${strip(rank, suit, gw, gh)}</g>`;
  })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs>${suitDefs()}<clipPath id="cell"><rect width="${gw}" height="${gh}"/></clipPath></defs>${body}</svg>`;
}

/** Shared defs for every squeeze frame: back fill, face paper, flap sheen and shadows. */
export function frameDefs() {
  return `<defs>
    <radialGradient id="bk" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="#1f3a2e"/><stop offset="1" stop-color="${PALETTE.ink}"/></radialGradient>
    <pattern id="lat" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H10M0 0V10" stroke="${PALETTE.gold}" stroke-opacity=".42" stroke-width=".8" fill="none"/><circle cx="5" cy="5" r="1" fill="${PALETTE.goldLight}" fill-opacity=".45"/></pattern>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e6df"/><stop offset=".25" stop-color="#fbfaf6"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#000" flood-opacity=".55"/></filter>
    <filter id="flapShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="-2" stdDeviation="2.5" flood-color="#000" flood-opacity=".5"/></filter>
  </defs>`;
}

/** Back of one card in local coordinates (clipped by the caller): panel, lattice, frame, rosette. */
export function backArt(w, h, r) {
  const cx = w / 2; const cy = h / 2; const s = Math.min(w, h) * 0.2;
  return `<rect width="${w}" height="${h}" rx="${r}" fill="#f4f1e8"/>`
    + `<rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="${Math.max(2, r - 3)}" fill="url(#bk)"/>`
    + `<rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="${Math.max(2, r - 3)}" fill="url(#lat)"/>`
    + `<rect x="8" y="8" width="${w - 16}" height="${h - 16}" rx="3" fill="none" stroke="${PALETTE.goldLight}" stroke-opacity=".75" stroke-width="1.1"/>`
    + `<path d="M${cx} ${cy - s}L${cx + s * 0.75} ${cy}L${cx} ${cy + s}L${cx - s * 0.75} ${cy}Z" fill="${PALETTE.ink}" stroke="${PALETTE.gold}" stroke-width="1.4"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${s * 0.28}" fill="${PALETTE.gold}"/>`;
}

/** Felt panel behind the squeeze canvas: a feathered green dome with a gold rule. */
export function feltSvg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>
    <radialGradient id="f" cx=".5" cy=".55" r=".62"><stop offset="0" stop-color="${PALETTE.feltLight}"/><stop offset=".7" stop-color="${PALETTE.felt2}"/><stop offset="1" stop-color="${PALETTE.felt}"/></radialGradient>
    <radialGradient id="fade" cx=".5" cy=".6" r=".6"><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <mask id="m"><ellipse cx="${w / 2}" cy="${h * 0.62}" rx="${w * 0.5}" ry="${h * 0.62}" fill="url(#fade)"/></mask>
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .06 0"/></filter>
  </defs><g mask="url(#m)" opacity=".92">
    <rect width="${w}" height="${h}" fill="url(#f)"/><rect width="${w}" height="${h}" filter="url(#n)"/>
    <path d="M${w * 0.06} ${h * 0.5}Q${w * 0.5} ${h * 0.3} ${w * 0.94} ${h * 0.5}" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".45" stroke-width="1.6"/>
    <path d="M${w * 0.1} ${h * 0.53}Q${w * 0.5} ${h * 0.34} ${w * 0.9} ${h * 0.53}" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".2" stroke-width="1"/>
  </g></svg>`;
}

/** Text-free pill button (the app prints "Open" over it); `down` is the pressed state. */
export function openButtonSvg(w, h, down) {
  const lift = down ? 2 : 0;
  const top = down ? ['#1f7a4f', '#155c3a'] : [PALETTE.green2, PALETTE.green];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top[0]}"/><stop offset="1" stop-color="${top[1]}"/></linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALETTE.goldLight}"/><stop offset="1" stop-color="${PALETTE.goldDeep}"/></linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${down ? 0.08 : 0.35}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <rect x="2" y="10" width="${w - 4}" height="${h - 12}" rx="${(h - 12) / 2}" fill="#050807"/>
    <rect x="5" y="${4 + lift}" width="${w - 10}" height="${h - 14}" rx="${(h - 14) / 2}" fill="url(#rim)"/>
    <rect x="8" y="${7 + lift}" width="${w - 16}" height="${h - 20}" rx="${(h - 20) / 2}" fill="url(#b)"/>
    <rect x="16" y="${10 + lift}" width="${w - 32}" height="${(h - 20) * 0.42}" rx="${(h - 20) * 0.21}" fill="url(#gl)"/>
  </svg>`;
}
