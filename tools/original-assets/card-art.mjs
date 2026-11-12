// Original DanGG card art: suit glyphs, deck colours and per-card SVG face builders.
// Every shape here is drawn from scratch; faces are built for a 108×152 card body.
import { PALETTE } from './render.mjs';

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS = ['c', 'd', 'h', 's'];
export const rankLabel = (r) => (r === 'T' ? '10' : r);

/** Suit glyphs in a 100×100 box (club drawn as three lobes plus a flared stem). */
const SUIT_SHAPES = {
  h: '<path d="M50 93C22 70 4 53 4 31C4 15 16 5 29.5 5C39 5 46 11 50 20C54 11 61 5 70.5 5C84 5 96 15 96 31C96 53 78 70 50 93Z"/>',
  d: '<path d="M50 2C61 21 75 37 93 50C75 63 61 79 50 98C39 79 25 63 7 50C25 37 39 21 50 2Z"/>',
  s: '<path d="M50 3C61 21 95 37 95 61C95 77 84 86 72 86C63 86 57 82 53.5 76C54.5 87 59 93 67 98H33C41 93 45.5 87 46.5 76C43 82 37 86 28 86C16 86 5 77 5 61C5 37 39 21 50 3Z"/>',
  c: '<circle cx="50" cy="27" r="22"/><circle cx="26.5" cy="60" r="22"/><circle cx="73.5" cy="60" r="22"/><path d="M38 42H62V62H38Z"/><path d="M45.5 58C45.5 80 41 90 31 98H69C59 90 54.5 80 54.5 58Z"/>',
};

/** `<symbol>` definitions; reference with `use(suit, x, y, size, fill)`. */
export const suitDefs = () => SUITS.map((s) => `<symbol id="suit-${s}" viewBox="0 0 100 100">${SUIT_SHAPES[s]}</symbol>`).join('');

export function use(suit, cx, cy, size, fill, flip = false) {
  const x = cx - size / 2;
  const y = cy - size / 2;
  const rot = flip ? ` transform="rotate(180 ${cx} ${cy})"` : '';
  return `<use href="#suit-${suit}" x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}"${rot}/>`;
}

export const TWO_COLOUR = Object.freeze({ c: '#141414', d: '#c41f30', h: '#c41f30', s: '#141414' });
export const FOUR_COLOUR = Object.freeze({ c: '#17803f', d: '#1f58c4', h: '#c41f30', s: '#141414' });
const FILLED = Object.freeze({
  c: ['#25a457', '#0f5e2e'], d: ['#2f72dc', '#173f8f'], h: ['#d8333f', '#861521'], s: ['#3a3a3a', '#111111'],
});

export const CARD = Object.freeze({ w: 108, h: 152, r: 7 });
const INDEX_FONT = "'Avenir Next Condensed','Helvetica Neue',Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const text = (x, y, size, fill, str, extra = '') =>
  `<text x="${x}" y="${y}" font-family="${INDEX_FONT}" font-weight="700" font-size="${size}" fill="${fill}" text-anchor="middle"${extra}>${str}</text>`;

/** Big corner index: rank over suit, the part that must read at 30px card widths. */
function cornerIndex(rank, suit, colour, { size = 40, x = 19, pip = 22 } = {}) {
  const label = rankLabel(rank);
  const squeeze = label.length > 1 ? ` textLength="${size * 0.82}" lengthAdjust="spacingAndGlyphs"` : '';
  return text(x, 6 + size * 0.86, size, colour, label, squeeze) + use(suit, x, 12 + size * 0.86 + pip / 2, pip, colour);
}

// Pip centres for 2..10 as [column, row] in a 3×(0..1) grid.
const L = 0; const C = 1; const R = 2;
const PIPS = {
  2: [[C, 0], [C, 1]],
  3: [[C, 0], [C, 0.5], [C, 1]],
  4: [[L, 0], [R, 0], [L, 1], [R, 1]],
  5: [[L, 0], [R, 0], [C, 0.5], [L, 1], [R, 1]],
  6: [[L, 0], [R, 0], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  7: [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [L, 1], [R, 1]],
  8: [[L, 0], [R, 0], [C, 0.25], [L, 0.5], [R, 0.5], [C, 0.75], [L, 1], [R, 1]],
  9: [[L, 0], [R, 0], [L, 1 / 3], [R, 1 / 3], [C, 0.5], [L, 2 / 3], [R, 2 / 3], [L, 1], [R, 1]],
  10: [[L, 0], [R, 0], [C, 1 / 6], [L, 1 / 3], [R, 1 / 3], [L, 2 / 3], [R, 2 / 3], [C, 5 / 6], [L, 1], [R, 1]],
};

function pipField(rank, suit, colour) {
  const n = rank === 'T' ? 10 : Number(rank);
  const cols = [50, 70, 90];
  const top = 26; const bottom = 132;
  return PIPS[n].map(([c, r]) => use(suit, cols[c], top + (bottom - top) * r, 21, colour, r > 0.5)).join('');
}

function aceFace(suit, colour) {
  return `<circle cx="68" cy="88" r="31" fill="none" stroke="${PALETTE.gold}" stroke-width="2"/>`
    + `<circle cx="68" cy="88" r="36" fill="none" stroke="${colour}" stroke-opacity=".25" stroke-width="1"/>`
    + use(suit, 68, 88, 42, colour);
}

/** Court cards: a framed panel with a geometric emblem over a serif monogram. */
const EMBLEM = {
  K: (c) => `<path d="M53 44L57 30L63 40L69 26L75 40L81 30L85 44Z" fill="${PALETTE.gold}" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
  Q: (c) => `<path d="M54 44Q69 28 84 44Z" fill="${PALETTE.gold}" stroke="${c}" stroke-width="1.6"/><circle cx="58" cy="35" r="3" fill="${c}"/><circle cx="69" cy="29" r="3.4" fill="${c}"/><circle cx="80" cy="35" r="3" fill="${c}"/>`,
  J: (c) => `<path d="M57 44L69 28L81 44L69 38Z" fill="${PALETTE.gold}" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
};

function courtFace(rank, suit, colour) {
  return `<rect x="38" y="12" width="62" height="128" rx="5" fill="${colour}" fill-opacity=".07" stroke="${colour}" stroke-width="1.8"/>`
    + `<path d="M38 112L100 52V140H38Z" fill="${PALETTE.gold}" fill-opacity=".22"/>`
    + `<rect x="42" y="16" width="54" height="120" rx="3" fill="none" stroke="${PALETTE.goldDeep}" stroke-opacity=".6" stroke-width="1"/>`
    + EMBLEM[rank](colour)
    + `<text x="69" y="98" font-family="${SERIF}" font-weight="700" font-size="50" fill="${colour}" text-anchor="middle">${rank}</text>`
    + use(suit, 69, 118, 20, colour);
}

const cardBody = (fill, stroke = '#cfcac0') =>
  `<rect x=".5" y=".5" width="${CARD.w - 1}" height="${CARD.h - 1}" rx="${CARD.r}" fill="${fill}" stroke="${stroke}"/>`;

/** Classic layout: corner index plus pips / ace medallion / court panel. */
export function classicFace(rank, suit, colours) {
  const col = colours[suit];
  let body = pipField;
  if (rank === 'A') body = (_r, s, c) => aceFace(s, c);
  else if ('JQK'.includes(rank)) body = courtFace;
  return cardBody('url(#paper)') + cornerIndex(rank, suit, col) + body(rank, suit, col);
}

/** Simple layout: oversize index and one giant suit, the highest legibility at tiny sizes. */
export function simpleFace(rank, suit, colours, fill = 'url(#paper)', stroke = '#cfcac0') {
  const col = colours[suit];
  return cardBody(fill, stroke) + cornerIndex(rank, suit, col, { size: 42, x: 20, pip: 22 }) + use(suit, 74, 112, 58, col);
}

/** Filled layout: suit-coloured card, white index and an oversize rank. */
export function filledFace(rank, suit) {
  const label = rankLabel(rank);
  const fit = label.length > 1 ? ' textLength="64" lengthAdjust="spacingAndGlyphs"' : '';
  return cardBody(`url(#fill-${suit})`, FILLED[suit][1])
    + `<rect x="3" y="3" width="${CARD.w - 6}" height="${CARD.h - 6}" rx="5" fill="none" stroke="#fff" stroke-opacity=".28"/>`
    + use(suit, 82, 30, 34, '#fff').replace('/>', ' opacity=".2"/>')
    + cornerIndex(rank, suit, '#fff', { size: 30, x: 16, pip: 18 })
    + text(66, 140, 70, '#fff', label, fit);
}

/** Shared gradients for every sheet. */
export function deckDefs() {
  const fills = SUITS.map((s) => `<linearGradient id="fill-${s}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FILLED[s][0]}"/><stop offset="1" stop-color="${FILLED[s][1]}"/></linearGradient>`).join('');
  return `<defs>${suitDefs()}${fills}
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f7f6f2"/><stop offset="1" stop-color="#e6e3dc"/></linearGradient>
    <linearGradient id="goldcard" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbefc8"/><stop offset=".45" stop-color="${PALETTE.goldLight}"/><stop offset=".75" stop-color="${PALETTE.gold}"/><stop offset="1" stop-color="#b98f43"/></linearGradient>
    <filter id="drop" x="-10%" y="-10%" width="125%" height="125%"><feDropShadow dx="1.2" dy="2" stdDeviation="1.6" flood-color="#000" flood-opacity=".45"/></filter>
  </defs>`;
}
