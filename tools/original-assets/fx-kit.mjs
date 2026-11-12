// Small drawing kit shared by the original DanGG table effects (pure functions, SVG strings out).
import { PALETTE as P } from './render.mjs';

/** Deterministic PRNG (mulberry32) so every render is byte-for-byte reproducible. */
export function seeded(seed) {
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
/** Progress of t inside [a, b], clamped to 0..1. */
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const easeOut = (k) => 1 - (1 - k) ** 3;
export const easeIn = (k) => k ** 3;
export const easeInOut = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
export const easeBack = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
/** Fade in over [a, a+inLen] and out over [b-outLen, b]. */
export const envelope = (t, a, inLen, b, outLen) => Math.min(seg(t, a, a + inLen), 1 - seg(t, b - outLen, b));

const deg = (d) => (d * Math.PI) / 180;
export const polar = (cx, cy, r, angleDeg) => [cx + r * Math.sin(deg(angleDeg)), cy - r * Math.cos(deg(angleDeg))];
const f = (n) => Number(n.toFixed(2));

/** Shared gradients and glows. Every scene includes this once inside its <svg>. */
export function defs() {
  return `<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.goldLight}"/><stop offset=".55" stop-color="${P.gold}"/><stop offset="1" stop-color="${P.goldDeep}"/></linearGradient>
  <linearGradient id="goldH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${P.goldDeep}"/><stop offset=".5" stop-color="${P.goldLight}"/><stop offset="1" stop-color="${P.goldDeep}"/></linearGradient>
  <linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.red2}"/><stop offset="1" stop-color="#6e1520"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="${P.goldLight}" stop-opacity=".95"/><stop offset=".35" stop-color="${P.gold}" stop-opacity=".45"/><stop offset="1" stop-color="${P.gold}" stop-opacity="0"/></radialGradient>
  <radialGradient id="whiteGlow"><stop offset="0" stop-color="#fffbea" stop-opacity="1"/><stop offset=".4" stop-color="${P.goldLight}" stop-opacity=".5"/><stop offset="1" stop-color="${P.goldLight}" stop-opacity="0"/></radialGradient>
  <radialGradient id="shade"><stop offset="0" stop-color="${P.ink}" stop-opacity=".78"/><stop offset=".7" stop-color="${P.ink}" stop-opacity=".5"/><stop offset="1" stop-color="${P.ink}" stop-opacity="0"/></radialGradient>
  <linearGradient id="ray" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${P.goldLight}" stop-opacity=".85"/><stop offset="1" stop-color="${P.goldLight}" stop-opacity="0"/></linearGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`;
}

export function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs()}${body}</svg>`;
}

/** Four-point twinkle star. */
export function sparkle(x, y, r, opacity, rot = 0) {
  if (opacity <= 0.01 || r <= 0.2) return '';
  const k = r * 0.22;
  const d = `M0 ${-r} Q${k} ${-k} ${r} 0 Q${k} ${k} 0 ${r} Q${-k} ${k} ${-r} 0 Q${-k} ${-k} 0 ${-r}Z`;
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)})" opacity="${f(opacity)}"><circle r="${f(r * 0.9)}" fill="url(#whiteGlow)"/><path d="${d}" fill="#fffaf0"/></g>`;
}

/** Gold coin seen at an angle (squash 0..1 fakes a spin), with an optional face label. */
export function coin(x, y, r, squash, opacity, rot = 0, label = '') {
  if (opacity <= 0.01) return '';
  const sx = Math.max(0.12, Math.abs(squash));
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(rot)}) scale(${f(sx)} 1)" opacity="${f(opacity)}">
<circle r="${f(r)}" fill="${P.goldDeep}"/><circle r="${f(r * 0.86)}" fill="url(#gold)"/><circle r="${f(r * 0.6)}" fill="none" stroke="${P.goldDeep}" stroke-width="${f(r * 0.1)}"/>${label ? `<text text-anchor="middle" dominant-baseline="central" font-family="'Avenir Next', 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="${f(r * 0.9)}" fill="${P.goldDeep}">${label}</text>` : ''}</g>`;
}

/** N light rays fanning around (cx, cy). A flat `fill` encodes far smaller than the default gradient. */
export function rays(cx, cy, n, inner, outer, width, rotation, opacity, fill = 'url(#ray)') {
  if (opacity <= 0.01) return '';
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = rotation + (360 / n) * i;
    out += `<path d="M${-width / 2} ${-inner} L0 ${-outer} L${width / 2} ${-inner}Z" fill="${fill}" transform="translate(${f(cx)} ${f(cy)}) rotate(${f(a)})"/>`;
  }
  return `<g opacity="${f(opacity)}">${out}</g>`;
}

/** Expanding shock ring. */
export function ring(cx, cy, r, width, opacity, color = P.goldLight) {
  if (opacity <= 0.01 || r <= 0) return '';
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${color}" stroke-width="${f(width)}" opacity="${f(opacity)}"/>`;
}

/**
 * Seeded burst particles: each flies from the origin with its own speed/angle under gravity.
 * Returns a renderer (t -> svg) for a burst that starts at `start` and lives for `life`.
 */
export function burst({ seed, count, cx, cy, speed, gravity, start, life, kind = 'mix', spreadDeg = 360, upward = false }) {
  const rnd = seeded(seed);
  const parts = Array.from({ length: count }, () => ({
    a: upward ? -spreadDeg / 2 + rnd() * spreadDeg : rnd() * 360,
    v: speed * (0.45 + rnd() * 0.75),
    size: 3 + rnd() * 6,
    spin: (rnd() - 0.5) * 900,
    delay: rnd() * 0.12,
    isCoin: kind === 'coin' || (kind === 'mix' && rnd() < 0.45),
  }));
  return (t) => parts.map((p) => {
    const k = seg(t, start + p.delay * life, start + life);
    if (k <= 0 || k >= 1) return '';
    const [dx, dy] = polar(0, 0, p.v * easeOut(k), p.a);
    const x = cx + dx;
    const y = cy + dy + gravity * k * k;
    const alpha = 1 - easeIn(k);
    return p.isCoin
      ? coin(x, y, p.size * 1.2, Math.cos(deg(p.spin * k)), alpha, p.spin * 0.05)
      : sparkle(x, y, p.size * 1.4, alpha, p.spin * k);
  }).join('');
}

/** One casino chip in 3/4 view: top ellipse plus a striped edge band. */
export function chip(x, y, rx, color, opacity = 1) {
  if (opacity <= 0.01) return '';
  const ry = rx * 0.36;
  const band = rx * 0.2;
  const side = `M${-rx} 0 A${rx} ${f(ry)} 0 0 0 ${rx} 0 L${rx} ${f(band)} A${rx} ${f(ry)} 0 0 1 ${-rx} ${f(band)}Z`;
  let stripes = '';
  for (let i = 0; i < 6; i++) {
    const sx = -rx + (2 * rx * (i + 0.5)) / 6;
    const top = ry * Math.sqrt(1 - (sx / rx) ** 2);
    stripes += `<rect x="${f(sx - rx * 0.06)}" y="${f(top)}" width="${f(rx * 0.12)}" height="${f(band)}" fill="#f4efe2" opacity=".85"/>`;
  }
  return `<g transform="translate(${f(x)} ${f(y)})" opacity="${f(opacity)}">
<path d="${side}" fill="${color}"/><path d="${side}" fill="#000" opacity=".32"/>${stripes}
<path d="M${-rx} ${f(band)} A${rx} ${f(ry)} 0 0 0 ${rx} ${f(band)}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
<ellipse cx="0" cy="0" rx="${rx}" ry="${f(ry)}" fill="${color}"/>
<ellipse cx="0" cy="0" rx="${f(rx * 0.78)}" ry="${f(ry * 0.78)}" fill="none" stroke="#f4efe2" stroke-width="2" stroke-dasharray="6 5" opacity=".9"/>
<ellipse cx="0" cy="0" rx="${f(rx * 0.5)}" ry="${f(ry * 0.5)}" fill="url(#gold)"/>
</g>`;
}
