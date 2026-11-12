// Geometry for the original DanGG card-squeeze animation.
//
// Cards lie face down in a stack (frame 0), fan out (frames 0-14), then each card's near-left
// corner peels: the back layer folds up along a moving fold line and the white face band
// underneath is uncovered. The app draws the face strip (from the inner sheet) clipped to the
// uncovered polygon, so the same numbers drive both the frame art and the JSON masks.
export const FRAME_COUNT = 61;
const SPREAD_END = 14;
const REVEAL_START = 16;
const FOLD_START_DEG = 55;

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const rad = (deg) => (deg * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;

/** Keep points P with (P - a)·n >= 0 (Sutherland-Hodgman against one half-plane). */
export function clipHalfPlane(poly, a, n) {
  const side = (p) => (p.x - a.x) * n.x + (p.y - a.y) * n.y;
  const out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const sp = side(p); const sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  });
  return out;
}

export const polygonArea = (poly) => Math.abs(poly.reduce((s, p, i) => {
  const q = poly[(i + 1) % poly.length];
  return s + p.x * q.y - q.x * p.y;
}, 0)) / 2;

/** Rounded rectangle [0,w]×[0,h] as a convex polygon (clockwise in screen space). */
export function roundedRect(w, h, r, steps = 5) {
  const corners = [[w - r, r, -90], [w - r, h - r, 0], [r, h - r, 90], [r, r, 180]];
  return corners.flatMap(([cx, cy, start]) => Array.from({ length: steps + 1 }, (_, k) => {
    const a = rad(start + (90 * k) / steps);
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  }));
}

/** Card layout for a format: size, fan positions and the face band height. */
export function layout({ cards, width, minHeight, cardWidth, bandRatio }) {
  const fit = minHeight - 4;
  const spreadDeg = cards === 2 ? 4 : 8 / (cards - 1);
  const maxDeg = (spreadDeg * (cards - 1)) / 2;
  const sin = Math.sin(rad(maxDeg)); const cos = Math.cos(rad(maxDeg));
  const w = cardWidth;
  const h = Math.min(w * 1.2, (fit - w * sin) / cos);
  const extW = w * cos + h * sin;
  const dx = (width - 8 - extW) / (cards - 1);
  const slots = Array.from({ length: cards }, (_, i) => ({
    cx: 4 + extW / 2 + i * dx,
    cy: fit / 2 + 2,
    deg: (i - (cards - 1) / 2) * spreadDeg,
  }));
  return { w, h, r: Math.round(w * 0.06), band: h * bandRatio, dx, slots, stack: { cx: width / 2, cy: fit / 2 + 2 } };
}

/** Placement of slot i at frame f: centre and rotation, from the neat stack to the fan. */
export function placement(lay, i, f) {
  const t = easeOut(clamp01(f / SPREAD_END));
  const s = lay.slots[i];
  return { cx: lerp(lay.stack.cx - i * 0.6, s.cx, t), cy: lerp(lay.stack.cy - i * 0.8, s.cy, t), deg: lerp(0, s.deg, t) };
}

/** Local card coordinates → frame coordinates. */
export function toFrame(lay, pl) {
  const c = Math.cos(rad(pl.deg)); const s = Math.sin(rad(pl.deg));
  return (p) => {
    const u = p.x - lay.w / 2; const v = p.y - lay.h / 2;
    return { x: pl.cx + u * c - v * s, y: pl.cy + u * s + v * c };
  };
}

/** Reveal progress (0..1) of slot i at frame f; cards peel left to right with overlap. */
export function revealProgress(cards, i, f) {
  const step = cards === 1 ? 0 : Math.min(14, 24 / (cards - 1));
  const duration = 60 - REVEAL_START - (cards - 1) * step;
  return easeInOut(clamp01((f - (REVEAL_START + i * step)) / duration));
}

/**
 * Peel state in local coordinates: the fold line through (0, h - lift) at angle phi, the
 * uncovered face region below it, the remaining back above it, and the folded flap.
 */
export function peel(lay, p) {
  const outline = roundedRect(lay.w, lay.h, lay.r);
  if (p <= 0) return { outline, back: outline, face: [], flap: [], fold: null };
  const lift = lay.band * p;
  const phi = rad(FOLD_START_DEG * (1 - p));
  const a = { x: 0, y: lay.h - lift };
  const n = { x: -Math.sin(phi), y: Math.cos(phi) };
  const face = clipHalfPlane(outline, a, n);
  const back = clipHalfPlane(outline, a, { x: -n.x, y: -n.y });
  const d = { x: Math.cos(phi), y: Math.sin(phi) };
  const reflect = (q) => {
    const k = (q.x - a.x) * n.x + (q.y - a.y) * n.y;
    return { x: q.x - 2 * k * n.x, y: q.y - 2 * k * n.y };
  };
  let flap = face.map(reflect).reverse();
  for (const [pa, pn] of [[{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 1 }], [{ x: lay.w, y: lay.h }, { x: -1, y: 0 }]]) {
    flap = clipHalfPlane(flap, pa, pn);
  }
  return { outline, back, face, flap, fold: { a, d, n } };
}
