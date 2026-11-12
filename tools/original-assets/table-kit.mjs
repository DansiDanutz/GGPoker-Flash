// Shared drawing helpers for the original DanGG in-game table art (pure functions, SVG strings out).
import { PALETTE as P } from './render.mjs';

/** Deterministic PRNG (mulberry32) so every render is reproducible. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
export const easeOut = (k) => 1 - (1 - k) ** 3;
export const r2 = (n) => Math.round(n * 100) / 100;

/** Wraps SVG content in a root <svg> of the given size. */
export const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block">${body}</svg>`;

/** Closed path through `points` with every corner rounded by `radius` (quadratic corners). */
export function roundedPolygon(points, radius) {
  const n = points.length;
  const parts = points.map((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const toward = (q) => {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy);
      const k = Math.min(radius, len / 2) / len;
      return [r2(p[0] + dx * k), r2(p[1] + dy * k)];
    };
    return { a: toward(prev), b: toward(next), p };
  });
  const head = `M${parts[0].b[0]},${parts[0].b[1]}`;
  const body = [...parts.slice(1), parts[0]].map(({ a, b, p }) => `L${a[0]},${a[1]} Q${p[0]},${p[1]} ${b[0]},${b[1]}`).join(' ');
  return `${head} ${body} Z`;
}

/** Chip colourways by denomination: face, edge-spot and inlay colours. */
export const CHIP_STYLES = Object.freeze({
  1: { face: '#e9e5db', rim: '#b9b2a2', spot: '#2f6fb3', inlay: '#f7f3ea' },
  5: { face: P.red, rim: '#7c1823', spot: '#f1e8d6', inlay: '#c93a49' },
  25: { face: P.green, rim: '#1c6646', spot: '#f1e8d6', inlay: '#3bb27b' },
  100: { face: '#15161a', rim: '#050506', spot: P.gold, inlay: '#26272c' },
  shuffle: { face: '#8e1b2a', rim: '#56101a', spot: '#f0e2c0', inlay: '#a52637' },
});

/**
 * One chip seen from a raised angle: an ellipse face of radius rx×ry on top of an edge band
 * `thick` px tall. (cx, cy) is the centre of the top face. Returns SVG.
 */
export function chip(cx, cy, rx, ry, thick, style, { face = true, id = 'c' } = {}) {
  const s = style;
  const spots = 8;
  const circumference = Math.PI * 2 * rx;
  const dash = circumference / spots / 2;
  const band = `<path d="M${r2(cx - rx)},${r2(cy)} v${thick} a${rx},${ry} 0 0 0 ${2 * rx},0 v${-thick} Z" fill="${s.rim}"/>`
    + `<path d="M${r2(cx - rx)},${r2(cy + thick / 2)} a${rx},${ry} 0 0 0 ${2 * rx},0" fill="none" stroke="${s.spot}" stroke-width="${r2(thick * 0.62)}" stroke-dasharray="${r2(dash * 0.55)} ${r2(dash * 1.45)}" opacity=".9"/>`;
  if (!face) return band;
  const top = `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${rx}" ry="${ry}" fill="${s.face}"/>`
    + `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx * 0.98)}" ry="${r2(ry * 0.98)}" fill="none" stroke="${s.spot}" stroke-width="${r2(Math.max(1, rx * 0.16))}" stroke-dasharray="${r2(dash * 0.5)} ${r2(dash * 1.5)}"/>`
    + `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx * 0.62)}" ry="${r2(ry * 0.62)}" fill="${s.inlay}" stroke="${s.rim}" stroke-width="${r2(Math.max(0.6, rx * 0.04))}"/>`
    + `<ellipse cx="${r2(cx - rx * 0.12)}" cy="${r2(cy - ry * 0.25)}" rx="${r2(rx * 0.7)}" ry="${r2(ry * 0.45)}" fill="#fff" opacity=".10"/>`;
  return band + top;
}

/** Gold linear gradient definition (vertical by default). */
export const goldGradient = (id, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">`
  + `<stop offset="0" stop-color="${P.goldLight}"/><stop offset=".45" stop-color="${P.gold}"/>`
  + `<stop offset=".75" stop-color="${P.goldDeep}"/><stop offset="1" stop-color="#e7c77f"/></linearGradient>`;

/** Silver linear gradient definition. */
export const silverGradient = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">`
  + `<stop offset="0" stop-color="#f4f6f7"/><stop offset=".45" stop-color="#aab1b6"/>`
  + `<stop offset=".75" stop-color="#5f676d"/><stop offset="1" stop-color="#d7dcdf"/></linearGradient>`;
