// Centre-piece illustrations for the 226x230 promotion tiles. Each returns SVG drawn around
// the tile centre (113, 100); gradients come from tileDefs() in discover.mjs.
import { FONT, PALETTE, card, chipTop, chipStack, gem, sparkle } from './shared.mjs';
import { CREATURES } from './creatures.mjs';

const INK = '#1a1208';

export function ticket() {
  return `<g transform="translate(113 96) rotate(-16)">
    <path d="M-74 -38H74V-14A14 14 0 0 0 74 14V38H-74V14A14 14 0 0 0 -74 -14Z" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="2.5"/>
    <path d="M-40 -38V38" stroke="${INK}" stroke-opacity=".5" stroke-width="2" stroke-dasharray="5 5"/>
    <text x="-57" y="8" text-anchor="middle" font-family="${FONT.serif}" font-size="26" fill="${INK}">♠</text>
    <text x="17" y="-6" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="15" letter-spacing="1.5" fill="${INK}">ADMIT ONE</text>
    <text x="17" y="16" text-anchor="middle" font-family="${FONT.display}" font-weight="700" font-size="11" letter-spacing="2" fill="${INK}" opacity=".7">FREE ENTRY</text>
  </g>${sparkle(178, 44, 9)}${sparkle(46, 150, 6)}`;
}

export function allInFold() {
  return `<g transform="translate(113 100)">
    <g transform="translate(-30 4) rotate(-10)">${chipTop(0, 0, 44, 'red', '')}</g>
    <g transform="translate(30 -4) rotate(10)">${chipTop(0, 0, 44, 'black', '')}</g>
    <path d="M10 -62L-26 6H2L-12 62L32 -8H4Z" fill="url(#goldv)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  </g>`;
}

export function slots() {
  const reel = (x, sym, col) => `<rect x="${x - 22}" y="-26" width="44" height="52" rx="6" fill="#fbf6ea" stroke="${INK}" stroke-width="2"/>
    <text x="${x}" y="14" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="32" fill="${col}">${sym}</text>`;
  return `<g transform="translate(113 100)">
    <rect x="-82" y="-54" width="164" height="108" rx="16" fill="url(#redv)" stroke="url(#goldv)" stroke-width="5"/>
    ${reel(-50, '7', PALETTE.red)}${reel(0, '7', PALETTE.red)}${reel(50, '7', PALETTE.red)}
    <rect x="-82" y="-4" width="164" height="3" fill="${PALETTE.goldLight}" opacity=".8"/>
    <rect x="86" y="-40" width="8" height="46" rx="4" fill="#cfcfcf" stroke="${INK}" stroke-width="1.5"/><circle cx="90" cy="-44" r="10" fill="${PALETTE.red2}" stroke="${INK}" stroke-width="2"/>
  </g>${sparkle(40, 40, 8)}${sparkle(190, 150, 7)}`;
}

export function giftBox(ribbon = PALETTE.red) {
  return `<g transform="translate(113 106)">
    <rect x="-56" y="-24" width="112" height="76" rx="6" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="2.5"/>
    <rect x="-64" y="-44" width="128" height="26" rx="5" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="2.5"/>
    <rect x="-11" y="-44" width="22" height="96" fill="${ribbon}"/>
    <path d="M0 -44C-30 -84 -66 -60 -36 -46Z M0 -44C30 -84 66 -60 36 -46Z" fill="${ribbon}" stroke="${INK}" stroke-width="2"/>
  </g>${sparkle(42, 60, 9)}${sparkle(184, 52, 7)}${sparkle(176, 156, 5)}`;
}

export function wheel(platinum = false) {
  const n = 12;
  const cols = platinum ? ['#e9eef3', '#8f9aa6', '#5b6b7c'] : [PALETTE.red, PALETTE.gold, '#1f6b4a'];
  const seg = Array.from({ length: n }, (_, i) => {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p = (a) => `${(62 * Math.cos(a)).toFixed(1)} ${(62 * Math.sin(a)).toFixed(1)}`;
    return `<path d="M0 0L${p(a0)}A62 62 0 0 1 ${p(a1)}Z" fill="${cols[i % 3]}" stroke="${INK}" stroke-width="1.2"/>`;
  }).join('');
  const bulbs = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return `<circle cx="${(70 * Math.cos(a)).toFixed(1)}" cy="${(70 * Math.sin(a)).toFixed(1)}" r="3" fill="#fff7d6"/>`; }).join('');
  return `<g transform="translate(113 102)">
    <circle r="76" fill="url(${platinum ? '#silverv' : '#goldv'})" stroke="${INK}" stroke-width="2"/>${bulbs}${seg}
    <circle r="16" fill="url(${platinum ? '#silverv' : '#goldv'})" stroke="${INK}" stroke-width="2"/>
    <text y="6" text-anchor="middle" font-family="${FONT.serif}" font-size="18" fill="${INK}">♠</text>
    <path d="M-10 -86H10L0 -64Z" fill="${PALETTE.red2}" stroke="${INK}" stroke-width="2"/>
  </g>`;
}

export function shieldHeart() {
  return `<g transform="translate(113 100)">
    <path d="M0 -70L58 -50V0Q58 50 0 74Q-58 50 -58 0V-50Z" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="3"/>
    <path d="M0 -58L46 -42V0Q46 40 0 60Q-46 40 -46 0V-42Z" fill="#123a2b"/>
    <path d="M0 34C-40 6 -30 -30 0 -14C30 -30 40 6 0 34Z" fill="${PALETTE.red2}" stroke="${INK}" stroke-width="2"/>
    <path d="M-14 -10Q-8 -18 0 -12" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>${sparkle(46, 46, 7)}${sparkle(184, 140, 6)}`;
}

export function envelope() {
  return `<g transform="translate(113 104)">
    ${[[-58, -40], [56, -36], [-46, 40]].map(([x, y]) => chipTop(x, y, 18, 'gold', '')).join('')}
    <rect x="-64" y="-36" width="128" height="84" rx="8" fill="#f5ecd8" stroke="${PALETTE.goldDeep}" stroke-width="2.5"/>
    <path d="M-64 -32L0 14L64 -32" fill="none" stroke="${PALETTE.goldDeep}" stroke-width="2.5"/>
    <circle cx="0" cy="12" r="18" fill="${PALETTE.red}" stroke="${INK}" stroke-width="2"/>
    <path d="M0 22C-14 12 -10 0 0 6C10 0 14 12 0 22Z" fill="#ffe1e1"/>
  </g>${sparkle(180, 48, 8)}${sparkle(44, 150, 6)}`;
}

/** Trophy over a three-step podium, with a small motif on the cup. */
export function leaderboard(motif) {
  return `<g transform="translate(113 88)">
    <rect x="-78" y="34" width="52" height="30" fill="#2a2f2c" stroke="${PALETTE.goldDeep}" stroke-width="1.5"/>
    <rect x="26" y="40" width="52" height="24" fill="#2a2f2c" stroke="${PALETTE.goldDeep}" stroke-width="1.5"/>
    <rect x="-26" y="22" width="52" height="42" fill="#343b37" stroke="${PALETTE.goldDeep}" stroke-width="1.5"/>
    <text x="0" y="52" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="20" fill="${PALETTE.gold}">1</text>
    <path d="M-36 -64H36V-30Q36 2 0 6Q-36 2 -36 -30Z" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="2.5"/>
    <path d="M-36 -54Q-60 -54 -54 -34Q-50 -22 -32 -20M36 -54Q60 -54 54 -34Q50 -22 32 -20" fill="none" stroke="url(#goldv)" stroke-width="6"/>
    <rect x="-8" y="6" width="16" height="10" fill="${PALETTE.goldDeep}"/><rect x="-20" y="14" width="40" height="8" rx="2" fill="url(#goldv)"/>
    ${motif}
  </g>${sparkle(44, 40, 8)}${sparkle(186, 60, 6)}`;
}

export const motifs = Object.freeze({
  spade: `<text x="0" y="-22" text-anchor="middle" font-family="${FONT.serif}" font-size="34" fill="${INK}">♠</text>`,
  text: (t, size = 20) => `<text x="0" y="-26" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="${size}" fill="${INK}">${t}</text>`,
  bolt: `<path d="M4 -58L-12 -30H0L-6 -10L12 -38H0Z" fill="${INK}"/>`,
  star: `<path d="M0 -56L5 -43L19 -42L8 -33L12 -20L0 -27L-12 -20L-8 -33L-19 -42L-5 -43Z" fill="${INK}"/>`,
});

export function swordsBox() {
  return `<g transform="translate(113 104)">
    <g stroke="${INK}" stroke-width="2"><path d="M-70 -70L30 30L22 38L-78 -62Z" fill="#dfe6ea"/><path d="M70 -70L-30 30L-22 38L78 -62Z" fill="#dfe6ea"/>
      <rect x="18" y="26" width="26" height="8" transform="rotate(45 31 30)" fill="url(#goldv)"/><rect x="-44" y="26" width="26" height="8" transform="rotate(-45 -31 30)" fill="url(#goldv)"/></g>
    <rect x="-36" y="-10" width="72" height="62" rx="8" fill="url(#purplev)" stroke="url(#goldv)" stroke-width="4"/>
    <text y="38" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="46" fill="${PALETTE.goldLight}">?</text>
  </g>`;
}

export function fastFold() {
  const lines = Array.from({ length: 6 }, (_, i) => `<path d="M${20 + i * 3} ${60 + i * 16}H${70 + i * 8}" stroke="${PALETTE.goldLight}" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`).join('');
  return `${lines}${card(108, 104, 64, 'A', 's', -14, 'tc')}${card(146, 98, 64, 'K', 'h', 10, 'tc')}
    <path d="M172 34L148 84H166L154 126L192 70H172L184 34Z" fill="url(#goldv)" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
}

export function jackpotSng() {
  return `<g transform="translate(113 100)">
    ${Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return `<path d="M0 0L${(84 * Math.cos(a)).toFixed(1)} ${(84 * Math.sin(a)).toFixed(1)}L${(84 * Math.cos(a + 0.14)).toFixed(1)} ${(84 * Math.sin(a + 0.14)).toFixed(1)}Z" fill="${PALETTE.goldLight}" opacity=".18"/>`; }).join('')}
    <circle r="58" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="3"/>
    <circle r="48" fill="#1a1208"/>
    <text y="-8" text-anchor="middle" font-family="${FONT.display}" font-weight="700" font-size="12" letter-spacing="2" fill="${PALETTE.gold}">UP TO</text>
    <text y="22" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="30" fill="${PALETTE.goldLight}">x1000</text>
  </g>`;
}

export function liveSeries() {
  return `<g transform="translate(113 98)">
    <path d="M-44 -66H44Q48 -10 12 6V28H28V46H-28V28H-12V6Q-48 -10 -44 -66Z" fill="url(#goldv)" stroke="${PALETTE.goldDeep}" stroke-width="2.5"/>
    <path d="M-30 -56Q-30 -20 -6 -6" stroke="#fff" stroke-opacity=".5" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${chipStack(-58, 64, 4, 22, 'red')}${chipStack(58, 64, 5, 22, 'black', '♠')}
    ${gem(0, -40, 12, '#ffe3ea', '#c21f3a')}
  </g>${sparkle(40, 40, 8)}${sparkle(188, 44, 9)}`;
}

export function rewardsWhale() {
  return `<g transform="translate(23 6) scale(.9)">${CREATURES.whale()}</g>
    ${gem(52, 150, 14, '#a8f0ff', '#1b6fa8')}${gem(176, 146, 12, '#c8b4ff', '#4b2fa0')}${gem(150, 164, 9, '#9ff5c8', '#1a7d4f')}`;
}
