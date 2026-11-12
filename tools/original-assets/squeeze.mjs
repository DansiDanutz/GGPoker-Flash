// Generates the original DanGG card-squeeze set: 61 frames per format, inner face sheets,
// felt, Open buttons and the four JSON manifests read by app/src/game/squeeze.ts.
// Usage (repo root): node tools/original-assets/squeeze.mjs
//
// Contract (app/src/game/squeeze.ts): frames[f] is drawn at (0,0) after translate(container)
// and scale(scale); for each slot, glyphs[ordinal] of `inner` is drawn through
// matrix(sx·cos y, sx·sin y, -sx·sin x, sx·cos x, t.x, t.y) clipped to masks[f].array.
import fs from 'node:fs';
import path from 'node:path';
import { renderPng, closeRenderer, manifestEntries, OUT } from './render.mjs';
import { FRAME_COUNT, layout, placement, toFrame, revealProgress, peel, clipHalfPlane, polygonArea } from './squeeze-geometry.mjs';
import { glyphRects, innerSheetSvg, frameDefs, backArt, feltSvg, openButtonSvg } from './squeeze-art.mjs';

const FORMATS = [
  { name: 'holdem', inner: 'native-squeeze-inner.png', cards: 2, cardWidth: 190, bandRatio: 0.4 },
  { name: 'plo', inner: 'native-squeeze-plo-inner.png', cards: 4, cardWidth: 150, bandRatio: 0.42 },
  { name: 'plo5', inner: 'native-squeeze-plo5-inner.png', cards: 5, cardWidth: 138, bandRatio: 0.42 },
  { name: 'plo6', inner: 'native-squeeze-plo6-inner.png', cards: 6, cardWidth: 128, bandRatio: 0.42 },
];
const CANVAS = [652, 484];
const CONTAINER = [80, 117];
const SCALE = 1.5;
const INNER_SIZE = 1024;
const MAX_GLYPH = { w: 250, h: 76 }; // 4×(w+2)+2 and 13×(h+2)+2 must fit in 1024.

const round = (v) => Math.round(v * 100) / 100;
const pts = (poly) => poly.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
const framePath = (name, f) => `squeeze/native-squeeze-${name}${String(f).padStart(4, '0')}.png`;
const HIDDEN_T = (index) => ({ index, x: 0, y: 0, scaleX: 0, scaleY: 0, skewX: 0, skewY: 0, visible: false });
const HIDDEN_M = (index) => ({ index, array: [{ x: 0, y: 0 }], visible: false });

/** Glyph size per format so one strip spans the card width at the band's aspect ratio. */
function glyphSize(lay) {
  const gw = Math.min(MAX_GLYPH.w, Math.floor((MAX_GLYPH.h * lay.w) / lay.band));
  return { gw, gh: Math.round((gw * lay.band) / lay.w) };
}

/** One card's SVG in local coordinates at peel state `st`. */
function cardSvg(lay, pl, st, id) {
  const g = `translate(${round(pl.cx)} ${round(pl.cy)}) rotate(${round(pl.deg)}) translate(${round(-lay.w / 2)} ${round(-lay.h / 2)})`;
  let out = `<g transform="${g}"><clipPath id="b${id}"><polygon points="${pts(st.back)}"/></clipPath>`
    + `<polygon points="${pts(st.outline)}" fill="#000" filter="url(#cardShadow)" opacity=".9"/>`
    + `<g clip-path="url(#b${id})">${backArt(lay.w, lay.h, lay.r)}</g>`;
  if (st.face.length > 2) {
    out += `<polygon points="${pts(st.face)}" fill="url(#paper)"/>`;
  }
  if (st.flap.length > 2) {
    const { a, n } = st.fold;
    const far = { x: a.x - n.x * lay.band * 2, y: a.y - n.y * lay.band * 2 };
    out += `<linearGradient id="fl${id}" gradientUnits="userSpaceOnUse" x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(far.x)}" y2="${round(far.y)}">`
      + '<stop offset="0" stop-color="#9c9890"/><stop offset=".35" stop-color="#e7e3da"/><stop offset=".8" stop-color="#ffffff"/><stop offset="1" stop-color="#d9d5cc"/></linearGradient>'
      + `<polygon points="${pts(st.flap)}" fill="url(#fl${id})" stroke="#b8b3a8" stroke-width=".6" filter="url(#flapShadow)"/>`;
  }
  return `${out}</g>`;
}

/** Frame art plus each slot's transform and mask for frame f. */
function buildFrame(fmt, lay, glyph, f) {
  const states = lay.slots.map((_, i) => {
    const pl = placement(lay, i, f);
    return { pl, st: peel(lay, revealProgress(fmt.cards, i, f)), map: toFrame(lay, pl) };
  });
  const svgCards = states.map(({ pl, st }, i) => cardSvg(lay, pl, st, i)).join('');
  const slots = states.map(({ pl, st, map }, i) => {
    let mask = st.face.map(map);
    // Cards above this one (higher slots sit to the right) hide everything right of their left edge.
    for (let j = i + 1; j < states.length; j += 1) {
      const top = states[j].map({ x: 0, y: 0 });
      const bottom = states[j].map({ x: 0, y: lay.h });
      const edge = { x: bottom.x - top.x, y: bottom.y - top.y };
      mask = clipHalfPlane(mask, top, { x: -edge.y, y: edge.x });
    }
    if (mask.length < 3 || polygonArea(mask) < 1) return null;
    const origin = map({ x: 0, y: lay.h - lay.band });
    const scale = round((100 * lay.w) / glyph.gw);
    return {
      t: { index: f, x: round(origin.x), y: round(origin.y), scaleX: scale, scaleY: scale, skewX: round(pl.deg), skewY: round(pl.deg), visible: true },
      m: { index: f, array: mask.map((p) => ({ x: round(p.x), y: round(p.y) })), visible: true },
    };
  });
  const bounds = states.flatMap(({ st, map }) => st.outline.map(map));
  return { svg: `${frameDefs()}${svgCards}`, slots, bounds };
}

async function renderFormat(fmt, sizes) {
  const frames = Array.from({ length: FRAME_COUNT }, (_, f) => sizes.get(framePath(fmt.name, f)));
  if (frames.some((e) => !e)) throw new Error(`${fmt.name}: manifest lacks some of the ${FRAME_COUNT} frames`);
  const width = Math.min(...frames.map((e) => e.width));
  const minHeight = Math.min(...frames.map((e) => e.height));
  const lay = layout({ ...fmt, width, minHeight });
  const glyph = glyphSize(lay);
  lay.band = (glyph.gh * lay.w) / glyph.gw; // exact strip height on the card

  const slots = lay.slots.map(() => ({ transforms: [], masks: [] }));
  for (let f = 0; f < FRAME_COUNT; f += 1) {
    const { svg, slots: frameSlots, bounds } = buildFrame(fmt, lay, glyph, f);
    const { width: fw, height: fh } = frames[f];
    const over = bounds.find((p) => p.x < 0 || p.y < 0 || p.x > fw || p.y > fh);
    if (over) throw new Error(`${fmt.name} frame ${f}: card outside ${fw}×${fh} at ${round(over.x)},${round(over.y)}`);
    await renderPng(framePath(fmt.name, f), `<svg xmlns="http://www.w3.org/2000/svg" width="${fw}" height="${fh}">${svg}</svg>`, fw, fh);
    frameSlots.forEach((s, i) => {
      slots[i].transforms.push(s ? s.t : HIDDEN_T(f));
      slots[i].masks.push(s ? s.m : HIDDEN_M(f));
    });
  }
  const innerSize = sizes.get(`squeeze/${fmt.inner}`);
  await renderPng(`squeeze/${fmt.inner}`, innerSheetSvg(glyph.gw, glyph.gh, INNER_SIZE), innerSize.width, innerSize.height);

  const data = {
    frames: Array.from({ length: FRAME_COUNT }, (_, f) => `/assets/${framePath(fmt.name, f)}`),
    inner: `/assets/squeeze/${fmt.inner}`,
    glyphs: glyphRects(glyph.gw, glyph.gh),
    slots,
    canvas: CANVAS,
    container: CONTAINER,
    scale: SCALE,
    ordinal: 'rank23456789TJQKA ×4 +suitcdhs',
  };
  fs.writeFileSync(path.join(OUT, `squeeze/native-squeeze-${fmt.name}.json`), `${JSON.stringify(data)}\n`);
  const firstVisible = slots.map((s) => s.transforms.findIndex((t) => t.visible));
  console.log(`${fmt.name}: card ${round(lay.w)}×${round(lay.h)}, band ${round(lay.band)}, glyph ${glyph.gw}×${glyph.gh}, first visible ${firstVisible}`);
}

async function main() {
  const sizes = new Map(manifestEntries('squeeze/').map((e) => [e.path, e]));
  for (const fmt of FORMATS) await renderFormat(fmt, sizes);
  const felt = sizes.get('squeeze/native-squeeze-felt.png');
  await renderPng('squeeze/native-squeeze-felt.png', feltSvg(felt.width, felt.height), felt.width, felt.height);
  for (const [file, down] of [['native-squeeze-open.png', false], ['native-squeeze-open-down.png', true]]) {
    const e = sizes.get(`squeeze/${file}`);
    await renderPng(`squeeze/${file}`, openButtonSvg(e.width, e.height, down), e.width, e.height);
  }
}

main().finally(closeRenderer).catch((error) => { console.error(error); process.exitCode = 1; });
