// Original DanGG table effects. Each scene maps progress t (0..1) to one SVG frame.
// Every scene ends fully transparent so a held last frame is invisible.
import { PALETTE as P } from './render.mjs';
import {
  burst, chip, clamp, coin, easeBack, easeIn, easeInOut, easeOut, envelope, lerp, polar, rays, ring,
  seeded, seg, sparkle, svgDoc,
} from './fx-kit.mjs';

const FONT = "'Avenir Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const f = (n) => Number(n.toFixed(2));

/* ---------- Jackpot Sit & Go intro: prize wheel spins and lands on a multiplier ---------- */
const WHEEL = ['x2', 'x3', 'x5', 'x2', 'x10', 'x3', 'x25', 'x2', 'x5', 'x3', 'x100', 'x2'];
const WHEEL_FILL = [P.red, P.felt2, P.blue, P.feltLight, P.purple, P.felt2];
const WIN_INDEX = 4;

function wedge(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${cx} ${cy} L${f(x0)} ${f(y0)} A${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}Z`;
}

export function spinIntro(t, w = 640, h = 360) {
  const cx = w / 2, cy = h * 0.56, r = h * 0.33;
  const out = 1 - seg(t, 0.86, 1);
  const enter = easeBack(seg(t, 0, 0.16));
  const spin = easeOut(seg(t, 0.08, 0.66));
  const angle = spin * (360 * 3 + (360 - WIN_INDEX * 30));
  const landed = seg(t, 0.66, 0.72);
  const pulse = landed > 0 ? 0.5 + 0.5 * Math.sin(t * 60) : 0;
  const step = 360 / WHEEL.length;

  let wedges = '';
  WHEEL.forEach((label, i) => {
    const a0 = i * step - step / 2, a1 = a0 + step;
    const win = i === WIN_INDEX && landed > 0;
    const [tx, ty] = polar(cx, cy, r * 0.72, i * step);
    wedges += `<path d="${wedge(cx, cy, r, a0, a1)}" fill="${win ? 'url(#gold)' : WHEEL_FILL[i % WHEEL_FILL.length]}" stroke="${P.goldDeep}" stroke-width="1.5"/>`;
    wedges += `<text x="${f(tx)}" y="${f(ty)}" transform="rotate(${i * step} ${f(tx)} ${f(ty)})" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="800" font-size="${f(r * 0.15)}" fill="${win ? P.ink : P.text}">${label}</text>`;
  });
  let bulbs = '';
  for (let i = 0; i < 24; i++) {
    const [bx, by] = polar(cx, cy, r * 1.06, i * 15);
    const on = (i + Math.floor(t * 24)) % 2 === 0;
    bulbs += `<circle cx="${f(bx)}" cy="${f(by)}" r="${f(r * 0.03)}" fill="${on ? '#fffaf0' : P.goldDeep}"/>`;
  }
  const wheel = `<g transform="translate(${cx} ${cy}) scale(${f(Math.max(0.01, enter))}) translate(${-cx} ${-cy})">
<circle cx="${cx}" cy="${cy}" r="${f(r * 1.13)}" fill="url(#glow)" opacity="${f(0.35 + pulse * 0.4)}"/>
<circle cx="${cx}" cy="${cy}" r="${f(r * 1.1)}" fill="url(#gold)"/><circle cx="${cx}" cy="${cy}" r="${f(r * 1.02)}" fill="${P.ink}"/>
<g transform="rotate(${f(angle)} ${cx} ${cy})">${wedges}</g>${bulbs}
<circle cx="${cx}" cy="${cy}" r="${f(r * 0.24)}" fill="url(#gold)" stroke="${P.goldDeep}" stroke-width="2"/>
<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="Georgia, serif" font-style="italic" font-weight="700" font-size="${f(r * 0.13)}" fill="${P.ink}">DanGG</text>
<path d="M${cx - r * 0.1} ${f(cy - r * 1.17)} L${cx + r * 0.1} ${f(cy - r * 1.17)} L${cx} ${f(cy - r * 0.9)}Z" fill="${P.red2}" stroke="${P.goldLight}" stroke-width="2"/></g>`;

  const titleIn = easeOut(seg(t, 0.04, 0.2));
  const title = `<g opacity="${f(titleIn)}" transform="translate(0 ${f((1 - titleIn) * -14)})">
<text x="${cx}" y="${f(h * 0.1)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="800" letter-spacing="4" font-size="${f(h * 0.065)}" fill="url(#goldH)">JACKPOT SIT &amp; GO</text></g>`;

  const reveal = easeBack(seg(t, 0.7, 0.8));
  const multiplier = reveal > 0 ? `<g transform="translate(${cx} ${f(cy)}) scale(${f(reveal)})">
<circle r="${f(r * 0.62)}" fill="url(#glow)"/>
<text y="0" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="900" font-size="${f(r * 0.62)}" fill="url(#gold)" stroke="${P.ink}" stroke-width="3" paint-order="stroke">${WHEEL[WIN_INDEX]}</text>
<text y="${f(r * 0.5)}" text-anchor="middle" font-family="${FONT}" font-weight="700" letter-spacing="3" font-size="${f(r * 0.12)}" fill="${P.text}" stroke="${P.ink}" stroke-width="3" paint-order="stroke">PRIZE MULTIPLIER</text></g>` : '';

  const flash = ring(cx, cy, lerp(r * 0.4, r * 1.9, easeOut(seg(t, 0.7, 0.86))), 6, 1 - seg(t, 0.7, 0.86));
  return svgDoc(w, h, `<g opacity="${f(out)}">${title}${wheel}${flash}${multiplier}</g>`);
}

/* ---------- Jackpot prize win: gold burst with rays, shock rings and coins ---------- */
const spinWinBurst = burst({ seed: 11, count: 46, cx: 240, cy: 240, speed: 230, gravity: 60, start: 0.08, life: 0.8 });

export function spinWin(t, w = 480, h = 480) {
  const cx = w / 2, cy = h / 2;
  const out = 1 - seg(t, 0.8, 1);
  const pop = easeBack(seg(t, 0, 0.18));
  const raysOn = envelope(t, 0.04, 0.14, 0.95, 0.3);
  let body = `<circle cx="${cx}" cy="${cy}" r="${f(140 * pop)}" fill="url(#glow)" opacity=".6"/>`;
  body += rays(cx, cy, 12, 40, 220 * pop, 30, t * 30, raysOn * 0.35, P.goldLight);
  body += rays(cx, cy, 12, 30, 150 * pop, 12, t * 30 + 15, raysOn * 0.55, P.goldLight);
  for (const [s, e] of [[0.06, 0.4], [0.16, 0.55], [0.3, 0.7]]) {
    const k = seg(t, s, e);
    body += ring(cx, cy, lerp(30, 230, easeOut(k)), lerp(10, 1, k), k > 0 ? 1 - k : 0);
  }
  const starR = 70 * pop * (1 + 0.05 * Math.sin(t * 40));
  let star = '';
  for (let i = 0; i < 16; i++) {
    const [x, y] = polar(cx, cy, i % 2 ? starR * 0.45 : starR, i * 22.5 + t * 40);
    star += `${i ? 'L' : 'M'}${f(x)} ${f(y)}`;
  }
  body += `<path d="${star}Z" fill="url(#gold)" stroke="#fffaf0" stroke-width="2" opacity="${f(clamp(pop))}"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="${f(28 * pop)}" fill="url(#whiteGlow)"/>`;
  body += spinWinBurst(t);
  return svgDoc(w, h, `<g opacity="${f(out)}">${body}</g>`);
}

/* ---------- Mystery bounty: a gift box shakes, bursts open and releases its prize ---------- */
const boxBurst = burst({ seed: 23, count: 40, cx: 180, cy: 290, speed: 210, gravity: 140, start: 0.46, life: 0.42, upward: true, spreadDeg: 150 });

export function mysteryBox(t, w = 360, h = 490) {
  const cx = w / 2, baseY = h * 0.78;
  const bw = w * 0.5, bh = h * 0.26;
  const drop = seg(t, 0, 0.16);
  const fall = drop < 1 ? -h * 0.7 * (1 - easeIn(drop)) : 0;
  const bounce = Math.abs(Math.sin(seg(t, 0.16, 0.24) * Math.PI)) * -14 * (1 - seg(t, 0.16, 0.24));
  const shakeK = seg(t, 0.22, 0.46);
  const shake = Math.sin(t * 180) * 7 * shakeK * (t < 0.46 ? 1 : 0);
  const open = seg(t, 0.46, 0.7);
  const out = 1 - seg(t, 0.84, 1);
  const top = baseY - bh + fall + bounce;
  const x0 = cx - bw / 2;

  const shadow = `<ellipse cx="${cx}" cy="${f(baseY + 8)}" rx="${f(bw * 0.62 * (0.4 + 0.6 * drop))}" ry="10" fill="#000" opacity=".45" filter="url(#soft)"/>`;
  const glowLeak = shakeK > 0 ? `<rect x="${f(x0 + 4)}" y="${f(top - 6)}" width="${f(bw - 8)}" height="10" fill="${P.goldLight}" opacity="${f(shakeK * 0.9 * (1 - open))}" filter="url(#bloom)"/>` : '';
  const box = `<g transform="rotate(${f(shake * 0.6)} ${cx} ${baseY})">
<rect x="${f(x0)}" y="${f(top)}" width="${f(bw)}" height="${f(bh)}" rx="6" fill="url(#red)" stroke="${P.goldDeep}" stroke-width="2"/>
<rect x="${f(cx - bw * 0.08)}" y="${f(top)}" width="${f(bw * 0.16)}" height="${f(bh)}" fill="url(#goldH)"/>
<text x="${cx}" y="${f(top + bh * 0.56)}" text-anchor="middle" dominant-baseline="central" font-family="Georgia, serif" font-weight="700" font-size="${f(bh * 0.55)}" fill="${P.goldLight}" stroke="${P.ink}" stroke-width="3" paint-order="stroke">?</text></g>`;

  const lidLift = easeOut(open);
  const lidX = cx + lidLift * w * 0.28;
  const lidY = top - 14 - lidLift * h * 0.42;
  const lidRot = lidLift * 38 + shake;
  const lidAlpha = 1 - seg(t, 0.6, 0.76);
  const lid = `<g transform="translate(${f(lidX)} ${f(lidY)}) rotate(${f(lidRot)})" opacity="${f(lidAlpha)}">
<rect x="${f(-bw * 0.56)}" y="0" width="${f(bw * 1.12)}" height="${f(bh * 0.28)}" rx="5" fill="url(#red)" stroke="${P.goldDeep}" stroke-width="2"/>
<rect x="${f(-bw * 0.08)}" y="0" width="${f(bw * 0.16)}" height="${f(bh * 0.28)}" fill="url(#goldH)"/>
<path d="M0 2 C-30 -34 -52 -6 -6 2 M0 2 C30 -34 52 -6 6 2" fill="none" stroke="url(#goldH)" stroke-width="9" stroke-linecap="round"/></g>`;

  const beamK = envelope(t, 0.46, 0.06, 0.9, 0.2);
  const beam = beamK > 0 ? `<path d="M${f(x0 + 8)} ${f(top)} L${f(cx - w * 0.48)} 0 L${f(cx + w * 0.48)} 0 L${f(x0 + bw - 8)} ${f(top)}Z" fill="url(#ray)" opacity="${f(beamK * 0.7)}"/>
${rays(cx, top, 14, 10, h * 0.55, 18, t * 60, beamK * 0.6)}` : '';

  const prizeK = easeBack(seg(t, 0.5, 0.66));
  const prizeY = top - prizeK * h * 0.3;
  const prize = prizeK > 0 ? `<circle cx="${cx}" cy="${f(prizeY)}" r="${f(70 * prizeK)}" fill="url(#glow)"/>${coin(cx, prizeY, 34 * prizeK, 0.55 + 0.45 * Math.cos(t * 9), 1, 0, '$')}` : '';

  const flash = ring(cx, top, lerp(10, w * 0.7, easeOut(open)), 5, open > 0 ? 1 - open : 0);
  return svgDoc(w, h, `<g opacity="${f(out)}">${beam}${shadow}${glowLeak}${box}${lid}${flash}${prize}${boxBurst(t)}</g>`);
}

/* ---------- Pot win shine: a gold streak sweeps the pot with twinkles and rising chips ---------- */
const shineRnd = seeded(37);
const TWINKLES = Array.from({ length: 22 }, () => ({ x: shineRnd(), y: shineRnd(), at: shineRnd() * 0.6, r: 5 + shineRnd() * 9 }));
const potBurst = burst({ seed: 41, count: 22, cx: 240, cy: 150, speed: 120, gravity: -30, start: 0.05, life: 0.85, kind: 'coin', upward: true, spreadDeg: 140 });

export function winEffect(t, w = 480, h = 270) {
  const cx = w / 2, cy = h * 0.55;
  const out = 1 - seg(t, 0.78, 1);
  const pop = easeBack(seg(t, 0, 0.2));
  let body = `<ellipse cx="${cx}" cy="${cy}" rx="${f(w * 0.36 * pop)}" ry="${f(h * 0.3 * pop)}" fill="url(#glow)" opacity=".85"/>`;
  body += ring(cx, cy, lerp(20, w * 0.48, easeOut(seg(t, 0.02, 0.5))), 4, 1 - seg(t, 0.02, 0.5));
  const sweep = easeInOut(seg(t, 0.08, 0.62));
  const sx = lerp(-w * 0.2, w * 1.2, sweep);
  body += `<g opacity="${f(envelope(t, 0.08, 0.06, 0.66, 0.1))}">
<ellipse cx="${f(sx)}" cy="${cy}" rx="${f(w * 0.36)}" ry="5" fill="url(#whiteGlow)"/>
<ellipse cx="${f(sx)}" cy="${cy}" rx="${f(w * 0.12)}" ry="${f(h * 0.12)}" fill="url(#whiteGlow)" opacity=".7"/></g>`;
  body += `<rect x="${f(cx - w * 0.3)}" y="${f(cy - 2)}" width="${f(w * 0.6 * pop)}" height="4" transform="translate(${f(w * 0.3 * (1 - pop))} 0)" fill="url(#goldH)" opacity=".8" filter="url(#bloom)"/>`;
  for (const s of TWINKLES) {
    const k = seg(t, s.at, s.at + 0.3);
    body += sparkle(lerp(w * 0.12, w * 0.88, s.x), lerp(h * 0.18, h * 0.88, s.y), s.r * Math.sin(k * Math.PI), Math.sin(k * Math.PI), k * 90);
  }
  body += potBurst(t);
  return svgDoc(w, h, `<g opacity="${f(out)}">${body}</g>`);
}

/* ---------- Chip riffle: two stacks interleave into one, then split again ---------- */
const CHIP_COLORS = [[P.red, P.red2], [P.blue, P.purple]];
const PER_STACK = 5;

export function chipShuffle(t, w = 400, h = 300) {
  const rx = w * 0.11, gap = rx * 0.27, floor = h * 0.74;
  const left = w * 0.3, right = w * 0.7, mid = w / 2;
  const fade = envelope(t, 0, 0.08, 1, 0.12);
  const chips = [];
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < PER_STACK; i++) {
      const home = side ? right : left;
      const merged = i * 2 + side;
      const inStart = 0.12 + i * 0.05 + side * 0.025;
      const kIn = easeInOut(seg(t, inStart, inStart + 0.12));
      const outStart = 0.56 + i * 0.04;
      const kOut = easeInOut(seg(t, outStart, outStart + 0.12));
      const k = kIn * (1 - kOut);
      const x = lerp(home, mid, k);
      const level = lerp(i, merged, k);
      const hop = Math.sin(Math.PI * seg(t, inStart, inStart + 0.12)) * 26 + Math.sin(Math.PI * seg(t, outStart, outStart + 0.12)) * 26;
      const y = floor - level * gap - hop;
      chips.push({ level, x, y, color: CHIP_COLORS[side][i % 2] });
    }
  }
  chips.sort((a, b) => a.level - b.level);
  const settle = Math.sin(Math.PI * seg(t, 0.48, 0.56)) * 0.6;
  const glow = `<ellipse cx="${mid}" cy="${f(floor - 30)}" rx="${f(w * 0.3)}" ry="${f(h * 0.3)}" fill="url(#glow)" opacity="${f(settle * 0.7)}"/>`;
  const shadows = [left, mid, right].map((x) => `<ellipse cx="${f(x)}" cy="${f(floor + rx * 0.45)}" rx="${f(rx * 1.15)}" ry="${f(rx * 0.32)}" fill="#000" opacity=".35" filter="url(#soft)"/>`).join('');
  const sparks = [0.47, 0.5, 0.53].map((s, i) => sparkle(mid + (i - 1) * rx * 0.9, floor - PER_STACK * 2 * gap - 8, 9 * Math.sin(Math.PI * seg(t, s, s + 0.14)), Math.sin(Math.PI * seg(t, s, s + 0.14)), i * 30)).join('');
  const body = glow + shadows + chips.map((c) => chip(c.x, c.y, rx, c.color)).join('') + sparks;
  return svgDoc(w, h, `<g opacity="${f(fade)}">${body}</g>`);
}
