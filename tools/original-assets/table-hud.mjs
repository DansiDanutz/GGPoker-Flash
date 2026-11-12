// Small in-game table pieces: clock digits + frame, dealer button, bet-slider knob, take-seat
// control, avatar rings, reserved-seat checkbox states and the four chip denominations.
import { PALETTE as P } from './render.mjs';
import { CHIP_STYLES, chip, goldGradient, r2, silverGradient, svg } from './table-kit.mjs';

const job = (path, w, h, body) => ({ path, w, h, html: svg(w, h, body) });

/** Seven-segment layout inside a 15×26 cell: segment -> polygon. Lit set per digit. */
const SEG = {
  a: 'M4,1.5 H13 L11.2,3.6 H5.8 Z', g: 'M4.6,13 L5.8,11.9 H11.2 L12.4,13 L11.2,14.1 H5.8 Z', d: 'M4,24.5 L5.8,22.4 H11.2 L13,24.5 Z',
  f: 'M3.4,2.2 L5.2,4.2 V11.2 L4,12.3 L3.4,11.7 Z', b: 'M13.6,2.2 V11.7 L13,12.3 L11.8,11.2 V4.2 Z',
  e: 'M3.4,14.3 L4,13.7 L5.2,14.8 V21.8 L3.4,23.8 Z', c: 'M13.6,14.3 V23.8 L11.8,21.8 V14.8 L13,13.7 Z',
};
const DIGITS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];

function digit(n, hot) {
  const lit = hot ? '#ff5a63' : P.goldLight;
  const glow = hot ? '#d33746' : P.gold;
  const segs = Object.entries(SEG).map(([k, d]) => (DIGITS[n].includes(k)
    ? `<path d="${d}" fill="${lit}" filter="url(#g)"/>` : '')).join('');
  return `<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".7" result="b"/>`
    + `<feFlood flood-color="${glow}" flood-opacity=".8"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${segs}`;
}

function clockJobs() {
  const out = [];
  for (const hot of [false, true]) {
    const sfx = hot ? '-hot' : '';
    for (let n = 0; n < 10; n += 1) out.push(job(`table/clock/${n}${sfx}.png`, 15, 26, digit(n, hot)));
    const c = hot ? '#ff5a63' : P.goldLight;
    out.push(job(`table/clock/10${sfx}.png`, 5, 26, `<circle cx="2.5" cy="9" r="1.7" fill="${c}"/><circle cx="2.5" cy="17" r="1.7" fill="${c}"/>`));
  }
  out.push(job('table/clock/frame.png', 116, 50, `<defs>${goldGradient('gg')}
      <linearGradient id="lcd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16231e"/><stop offset="1" stop-color="#070b09"/></linearGradient></defs>
    <rect x="1" y="1" width="114" height="48" rx="9" fill="#050706" stroke="url(#gg)" stroke-width="2"/>
    <rect x="6" y="6" width="104" height="38" rx="6" fill="url(#lcd)" stroke="#000" stroke-opacity=".6"/>
    <rect x="8" y="8" width="100" height="12" rx="5" fill="#fff" opacity=".05"/>
    <path d="M10 40 H106" stroke="${P.gold}" stroke-opacity=".25"/>`));
  return out;
}

const dealer = () => job('table/dealer-disc.png', 40, 38, `<defs>${goldGradient('rim')}
    <radialGradient id="face" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e2d6bc"/></radialGradient></defs>
  <ellipse cx="20" cy="21" rx="18.5" ry="16" fill="${P.goldDeep}"/>
  <ellipse cx="20" cy="18" rx="18.5" ry="16" fill="url(#rim)"/>
  <ellipse cx="20" cy="18" rx="15" ry="12.8" fill="url(#face)"/>
  <text x="20" y="24.2" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="17" fill="#1a1410">D</text>`);

const betThumb = () => job('table/bet-thumb.png', 59, 63, `<defs>${goldGradient('rim')}
    <radialGradient id="face" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#2a2b30"/><stop offset="1" stop-color="#0b0b0d"/></radialGradient></defs>
  <ellipse cx="29.5" cy="35" rx="28.5" ry="27" fill="${P.goldDeep}"/>
  <circle cx="29.5" cy="29.5" r="28.5" fill="url(#rim)"/>
  <circle cx="29.5" cy="29.5" r="24" fill="url(#face)"/>
  <circle cx="29.5" cy="29.5" r="26.2" fill="none" stroke="#0b0b0d" stroke-width="3" stroke-dasharray="6 7.7"/>
  <circle cx="29.5" cy="29.5" r="15" fill="none" stroke="${P.gold}" stroke-width="1.6"/>
  <path d="M29.5 19 L38 29.5 L29.5 40 L21 29.5 Z" fill="url(#rim)"/>
  <ellipse cx="25" cy="20" rx="13" ry="6" fill="#fff" opacity=".09"/>`);

function takeSeat() {
  return [
    job('table/native-take-seat-base.png', 160, 160, `<defs><radialGradient id="b" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#1b2a24"/><stop offset="1" stop-color="#060908"/></radialGradient>${goldGradient('rim')}</defs>
      <circle cx="80" cy="80" r="79.5" fill="#030504" opacity=".85"/>
      <circle cx="80" cy="80" r="76" fill="url(#b)"/>
      <circle cx="80" cy="80" r="70" fill="none" stroke="url(#rim)" stroke-width="2.4" opacity=".85"/>
      <circle cx="80" cy="80" r="64" fill="none" stroke="${P.gold}" stroke-opacity=".18" stroke-width="1"/>
      <ellipse cx="80" cy="48" rx="46" ry="22" fill="#fff" opacity=".04"/>`),
    job('table/native-take-seat-glow.png', 184, 184, `<defs><filter id="bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs>
      <circle cx="92" cy="92" r="80" fill="none" stroke="${P.goldLight}" stroke-width="10" opacity=".85" filter="url(#bl)"/>
      <circle cx="92" cy="92" r="80" fill="none" stroke="#fff8e6" stroke-width="2.5"/>`),
    job('table/native-take-seat-arrow.png', 32, 42, `<defs>${goldGradient('a')}</defs>
      <path d="M11 2 H21 V20 H29 L16 39 L3 20 H11 Z" fill="url(#a)" stroke="#5f4520" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M13 4 H16 V22 H9 Z" fill="#fff" opacity=".25"/>`),
  ];
}

/** Avatar ring centred in its canvas (the app scales it with object-fit: contain). */
function ring(path, w, h, metal, crown) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 12;
  const grad = metal === 'gold' ? goldGradient('m') : silverGradient('m');
  const tone = metal === 'gold' ? P.gold : '#c6ccd0';
  const ornament = (y, flip) => `<g transform="translate(${cx} ${y}) scale(1 ${flip})"><path d="M-16 0 L0 -12 L16 0 L0 6 Z" fill="url(#m)" stroke="#2a2216" stroke-width="1"/><circle cy="-3" r="3.4" fill="${metal === 'gold' ? P.red : P.blue}" stroke="#fff" stroke-opacity=".5"/></g>`;
  const top = crown ? `<g transform="translate(${cx} ${cy - r - 4})"><path d="M-22 6 L-16 -14 L-7 -2 L0 -20 L7 -2 L16 -14 L22 6 Z" fill="url(#m)" stroke="#33393d" stroke-width="1.2"/></g>` : ornament(cy - r - 2, -1);
  return job(path, w, h, `<defs>${grad}<radialGradient id="glass" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="16" transform="translate(0 3)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#m)" stroke-width="12"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 5}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 6}" fill="url(#glass)" stroke="${tone}" stroke-opacity=".5" stroke-width="1.5"/>
    ${top}${ornament(cy + r + 2, 1)}`);
}

function reserved() {
  const box = (stroke, fill, extra = '') => `<rect x="2" y="2" width="22" height="22" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${extra}`;
  return [
    job('reserved/native-reserved-background.png', 40, 40, `<rect x="1" y="1" width="38" height="38" rx="9" fill="#0d1512" stroke="${P.goldDeep}" stroke-opacity=".7" stroke-width="2"/><rect x="4" y="4" width="32" height="10" rx="5" fill="#fff" opacity=".04"/>`),
    job('reserved/native-reserved-box.png', 26, 26, box('#6f7a73', '#09100d')),
    job('reserved/native-reserved-hover.png', 26, 26, box(P.goldLight, '#13201b', `<rect x="4.5" y="4.5" width="17" height="17" rx="2.5" fill="none" stroke="${P.gold}" stroke-opacity=".35"/>`)),
    job('reserved/native-reserved-selected.png', 26, 26, box(P.gold, '#2a2210', `<rect x="4" y="4" width="18" height="8" rx="3" fill="#fff" opacity=".08"/>`)),
    job('reserved/native-reserved-check.png', 23, 17, `<path d="M2.5 8.5 L8.5 14.2 L20.5 2.6" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  ];
}

const chips = () => [1, 5, 25, 100].map((d) => job(`chips/native-chip-${d}.png`, 36, 35,
  `<ellipse cx="18" cy="${r2(16.5 + 3.5)}" rx="17.5" ry="14.6" fill="#000" opacity=".25"/>${chip(18, 15, 17.4, 14.4, 4.6, CHIP_STYLES[d])}`));

/** Every small HUD/table job. */
export function hudJobs() {
  return [
    ...clockJobs(), dealer(), betThumb(), ...takeSeat(),
    ring('table/ring_gold.png', 190, 230, 'gold', false),
    ring('table/ring_silver.png', 200, 250, 'silver', true),
    ...reserved(), ...chips(),
  ];
}
