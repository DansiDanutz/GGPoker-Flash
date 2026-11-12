// Generates the original DanGG card faces (six 13×4 sprite sheets) and card backs.
// Usage (repo root): node tools/original-assets/cards.mjs
//
// Sprite grid (app/src/components/Card.tsx:4-5, app/src/responsive.css:559-565):
// 1586×648 = 13 columns × 4 rows of 122×162 cells; column = rank 2..A, row = suit c,d,h,s.
// Each card body sits at (7,5) inside its cell, 108×152, leaving room for a soft drop shadow.
import { renderPng, closeRenderer, manifestEntries } from './render.mjs';
import { RANKS, SUITS, CARD, TWO_COLOUR, FOUR_COLOUR, deckDefs, classicFace, simpleFace, filledFace } from './card-art.mjs';
import { BACK_COLOURS, patternBack, plainBack, monogramBack } from './card-backs.mjs';

const CELL = Object.freeze({ w: 122, h: 162 });
const BODY = Object.freeze({ x: 7, y: 5 });
const SHEET = Object.freeze({ w: CELL.w * RANKS.length, h: CELL.h * SUITS.length });

/** Variant intent, from each sheet's name and the original's layout. */
const VARIANTS = {
  'cards/faces_classic.png': (r, s) => classicFace(r, s, TWO_COLOUR),
  'cards/faces_classic_four.png': (r, s) => classicFace(r, s, FOUR_COLOUR),
  'cards/faces_two.png': (r, s) => simpleFace(r, s, TWO_COLOUR),
  'cards/faces_four.png': (r, s) => simpleFace(r, s, FOUR_COLOUR),
  'cards/faces_gold.png': (r, s) => simpleFace(r, s, TWO_COLOUR, 'url(#goldcard)', '#a9813a'),
  'cards/faces_filled.png': (r, s) => filledFace(r, s),
};

function sheetSvg(face) {
  const cells = SUITS.flatMap((suit, row) => RANKS.map((rank, col) => {
    const x = col * CELL.w + BODY.x;
    const y = row * CELL.h + BODY.y;
    return `<g transform="translate(${x} ${y})"><g filter="url(#drop)">${face(rank, suit)}</g></g>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET.w}" height="${SHEET.h}">${deckDefs()}${cells.join('')}</svg>`;
}

const BACK_BODY = { x: 6, y: 4, w: 108, h: 152, r: 7 };
const BACKS = {
  'cards/backs/black-pattern.png': (o) => patternBack('black', o),
  'cards/backs/blue-pattern.png': (o) => patternBack('blue', o),
  'cards/backs/gray-pattern.png': (o) => patternBack('gray', o),
  'cards/backs/green-pattern.png': (o) => patternBack('green', o),
  'cards/backs/orange-pattern.png': (o) => patternBack('orange', o),
  'cards/backs/pink-pattern.png': (o) => patternBack('pink', o),
  'cards/backs/red-pattern.png': (o) => patternBack('red', o),
  'cards/backs/red-plain.png': (o) => plainBack(o),
  'cards/backs/gg-gray.png': (o) => monogramBack(o),
  // Full-bleed small back used for previews over a #123c29 fallback colour.
  'cards/back_green.png': (o) => patternBack('green', { ...o, x: 0, y: 0, w: o.width, h: o.height, r: 6, border: 4, shadow: false }),
};

async function main() {
  const sizes = new Map(manifestEntries('cards/').map((e) => [e.path, e]));
  const expected = [...Object.keys(VARIANTS), ...Object.keys(BACKS)];
  const missing = [...sizes.keys()].filter((p) => !expected.includes(p));
  if (missing.length) throw new Error(`No generator for: ${missing.join(', ')}`);

  for (const [rel, face] of Object.entries(VARIANTS)) {
    const { width, height } = sizes.get(rel);
    if (width !== SHEET.w || height !== SHEET.h) throw new Error(`${rel}: manifest ${width}×${height} ≠ grid ${SHEET.w}×${SHEET.h}`);
    await renderPng(rel, sheetSvg(face), width, height);
    console.log('face sheet', rel);
  }
  for (const [rel, draw] of Object.entries(BACKS)) {
    const { width, height } = sizes.get(rel);
    await renderPng(rel, draw({ width, height, ...BACK_BODY }), width, height);
    console.log('back', rel, `${width}×${height}`);
  }
}

if (CARD.w !== 108 || CARD.h !== 152) throw new Error('Card body must match the sprite cell layout');
if (Object.keys(BACK_COLOURS).length !== 7) throw new Error('Expected seven patterned colourways');

main().finally(closeRenderer).catch((error) => { console.error(error); process.exitCode = 1; });
