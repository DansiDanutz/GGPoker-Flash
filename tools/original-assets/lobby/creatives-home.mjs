// Home-feed art: hero, For You cards, tournament banners, feature tiles, casino tiles and
// table-TV thumbnails. All original DanGG artwork; labels name DanGG features only.
import { FONT, PALETTE, card, chipStack, chipTop, dust, gem } from './shared.mjs';
import { CREATURES } from './creatures.mjs';
import { frame, medallion, miniTable, panel, pill, sparkle, streaks, text, trophy } from './creatives-kit.mjs';

const INK = '#1a1208';

/* ------------------------------- hero 800x250 ------------------------------ */
export function hero() {
  const W = 800;
  const H = 250;
  const p = panel('hbg', W, H, '#6b1520', { r: 0, cx: 0.78, cy: 0.45 });
  const rays = Array.from({ length: 18 }, (_, i) => {
    const a = -Math.PI / 2 + (i - 9) * 0.16;
    return `<path d="M610 150L${(610 + 520 * Math.cos(a)).toFixed(0)} ${(150 + 520 * Math.sin(a)).toFixed(0)}L${(610 + 520 * Math.cos(a + 0.07)).toFixed(0)} ${(150 + 520 * Math.sin(a + 0.07)).toFixed(0)}Z" fill="${PALETTE.goldLight}" opacity=".07"/>`;
  }).join('');
  const stacks = [
    chipStack(520, 228, 7, 30, 'red'), chipStack(700, 230, 9, 30, 'black', '♠'), chipStack(752, 236, 5, 26, 'gold'),
    chipStack(568, 238, 4, 26, 'green'), chipStack(650, 244, 3, 28, 'purple'),
  ].join('');
  const body = `${p.body}${rays}${streaks(W, H, 4, 0.025)}
    ${dust(901, 380, 0, 420, 250, 70, 2)}
    <ellipse cx="620" cy="236" rx="190" ry="26" fill="#000" opacity=".6" filter="url(#soft)"/>
    ${trophy(612, 118, 1.5, '♠')}
    ${stacks}
    ${card(470, 150, 46, 'A', 's', -22, 'k')}${card(498, 146, 46, 'A', 'h', -6, 'k')}
    ${gem(560, 60, 12, '#ffe3ea', '#c21f3a')}${gem(700, 70, 10, '#a8f0ff', '#1b6fa8')}
    ${sparkle(540, 40, 10)}${sparkle(735, 120, 8)}${sparkle(452, 96, 6)}
    ${text(48, 64, 'DANGG · PLAY MONEY', { size: 13, weight: 700, fill: PALETTE.gold, spacing: 4 })}
    ${text(44, 122, 'NOVEMBER', { size: 54, weight: 900, fill: 'url(#goldtext)', stroke: '#2a1206', spacing: 1 })}
    ${text(44, 176, 'CHIP RUSH', { size: 54, weight: 900, fill: 'url(#goldtext)', stroke: '#2a1206', spacing: 1 })}
    <rect x="46" y="194" width="236" height="30" rx="15" fill="#140708" stroke="${PALETTE.gold}" stroke-opacity=".8"/>
    ${text(164, 214, 'Freerolls & guarantees all month', { size: 13, weight: 600, fill: PALETTE.goldLight, anchor: 'middle', filter: '' })}`;
  return frame(W, H, body, p.def);
}

/* ---------------------------- For You 226x234 ----------------------------- */
function forYou(id, tint, title, sub, art, button, buttonFill) {
  const W = 226;
  const H = 234;
  const p = panel(id, W, H, tint, { cx: 0.75, cy: 0.55 });
  const body = `${p.body}${streaks(W, H, 2)}${dust(id.length * 31, 0, 60, W, 140, 18, 1.4)}
    ${art}
    ${text(16, 30, title, { size: 16 })}
    ${text(16, 48, sub, { size: 11, weight: 600, fill: '#c9d1d6', filter: '' })}
    ${pill(56, 210, button, 84, buttonFill)}`;
  return frame(W, H, body, p.def);
}

export const forYouRecent = () => forYou('fr', '#12506a', 'Recent game', 'Jump back to a live table',
  `${miniTable(140, 120, 62, 34, '#1f6b4a', 6)}${card(128, 122, 26, 'A', 's', -10, 'k')}${card(148, 120, 26, 'K', 'h', 8, 'k')}
   ${chipStack(186, 176, 3, 12, 'red')}`, 'Join');

export const forYouFreebie = () => forYou('ff', '#2a3a7a', 'Daily Freebie', 'A free gift every day',
  `<g transform="translate(150 132)">
     <ellipse cy="52" rx="58" ry="10" fill="#000" opacity=".5" filter="url(#soft)"/>
     <rect x="-44" y="-14" width="88" height="62" rx="5" fill="url(#purplev)" stroke="#1a0f33" stroke-width="2"/>
     <rect x="-50" y="-30" width="100" height="22" rx="4" fill="url(#purplev)" stroke="#1a0f33" stroke-width="2"/>
     <rect x="-8" y="-30" width="16" height="78" fill="url(#goldv)"/>
     <path d="M0 -30C-24 -64 -54 -44 -28 -32Z M0 -30C24 -64 54 -44 28 -32Z" fill="url(#goldv)" stroke="${INK}" stroke-width="1.5"/>
   </g>${sparkle(92, 92, 8)}${sparkle(204, 84, 6)}${sparkle(196, 182, 5)}`, 'Claim');

export const forYouOcean = () => forYou('fo', '#0f5a7a', 'Ocean Rewards', 'Every journey starts here',
  `<g transform="translate(62 50) scale(.8)">${CREATURES.clownfish()}</g>
   ${[[60, 120, 4], [72, 98, 3], [196, 70, 5], [186, 100, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#bfefff" stroke-opacity=".6"/>`).join('')}
   <rect x="16" y="168" width="194" height="8" rx="4" fill="#0a1a24"/><rect x="16" y="168" width="58" height="8" rx="4" fill="url(#goldv)"/>
   ${text(210, 190, 'Next rank', { size: 10, weight: 600, fill: '#9fc3d3', anchor: 'end', filter: '' })}`, 'View', 'url(#goldv)');

export const forYouLiveSeries = () => forYou('fl', '#7a1a24', 'Live Series', 'Satellites to the Sunday Major',
  `${trophy(150, 120, 1.25, '★')}${chipStack(92, 186, 4, 18, 'red')}${chipStack(204, 186, 5, 18, 'black', '♠')}
   ${sparkle(110, 74, 7)}${sparkle(196, 88, 6)}`, 'Play', 'url(#redv)');

/* ------------------------- tournament banners 345x140 ---------------------- */
function banner(id, tint, title, line, footer, inner) {
  const W = 345;
  const H = 140;
  const p = panel(id, W, H, tint, { cx: 0.15, cy: 0.5 });
  const body = `${p.body}${streaks(W, H, 3, 0.03)}${dust(id.length * 7 + 3, 120, 0, 225, 100, 20, 1.3)}
    ${medallion(66, 64, 52, inner, tint)}
    ${text(134, 40, title, { size: 21, weight: 900, fill: 'url(#goldtext)', stroke: '#1a0a04' })}
    ${text(134, 62, line, { size: 12, weight: 600, fill: '#e6e0d4', filter: '' })}
    <rect x="124" y="102" width="${W - 124}" height="38" fill="url(#redv)"/>
    <rect x="124" y="102" width="${W - 124}" height="14" fill="url(#gloss)"/>
    ${text(140, 127, 'GTD', { size: 15, weight: 800 })}
    ${text(W - 14, 127, footer, { size: 15, weight: 800, fill: PALETTE.goldLight, anchor: 'end' })}`;
  return frame(W, H, body, p.def);
}

const crown = `<path d="M-26 6L-30 -22L-14 -8L0 -28L14 -8L30 -22L26 6Z" fill="url(#goldv)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <rect x="-27" y="6" width="54" height="9" rx="2" fill="url(#goldv)" stroke="${INK}" stroke-width="2"/>
  <text y="38" text-anchor="middle" font-family="${FONT.serif}" font-size="24" fill="${PALETTE.goldLight}">♠</text>`;
const calendar = `<rect x="-26" y="-24" width="52" height="50" rx="6" fill="#f5ecd8" stroke="${INK}" stroke-width="2"/>
  <rect x="-26" y="-24" width="52" height="15" rx="6" fill="url(#redv)"/>
  <text y="20" text-anchor="middle" font-family="${FONT.display}" font-weight="900" font-size="22" fill="${INK}">S·S</text>`;
const star = `<path d="M0 -32L9 -11L32 -10L14 4L20 27L0 14L-20 27L-14 4L-32 -10L-9 -11Z" fill="url(#goldv)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <text y="8" text-anchor="middle" font-family="${FONT.display}" font-weight="900" font-size="12" fill="${INK}">24/7</text>`;

export const tournMasters = () => banner('tm', '#3a1418', 'Masters', 'Our flagship weekly freezeout.', 'Big weekly pool', crown);
export const tournWeekender = () => banner('tw', '#14304a', 'Weekender', 'Relaxed events all weekend long.', 'Sat & Sun', calendar);
export const tournDaily = () => banner('td', '#3a2a10', 'Daily Guarantees', 'Guaranteed prize pools every day.', 'Every day', star);

/* --------------------------- feature tiles 225x140 ------------------------- */
function feature(id, tint, title, art) {
  const W = 225;
  const H = 140;
  const p = panel(id, W, H, tint, { cx: 0.35, cy: 0.4 });
  const body = `${p.body}${streaks(W, H, 2)}${art}
    <rect x="0" y="${H - 40}" width="${W}" height="40" fill="url(#fade-${id})"/>
    ${text(W - 12, H - 14, title, { size: 17, weight: 900, anchor: 'end', stroke: '#000' })}`;
  const def = `${p.def}<linearGradient id="fade-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient>`;
  return frame(W, H, body, def);
}

export const featureTimeBank = () => feature('ft', '#1f5a3a', 'Time Bank Card',
  `<g transform="translate(70 62) rotate(-8)"><rect x="-38" y="-46" width="76" height="92" rx="8" fill="url(#goldv)" stroke="${INK}" stroke-width="2"/>
     <rect x="-31" y="-39" width="62" height="78" rx="5" fill="#1a3a2a"/>
     <text y="12" text-anchor="middle" font-family="${FONT.display}" font-weight="900" font-size="22" fill="${PALETTE.goldLight}">+15s</text></g>
   <g transform="translate(160 56)"><circle r="34" fill="#f5ecd8" stroke="${INK}" stroke-width="3"/><circle r="28" fill="none" stroke="${PALETTE.goldDeep}" stroke-width="1.5"/>
     <path d="M0 0V-22M0 0L14 8" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/><rect x="-6" y="-46" width="12" height="9" rx="2" fill="url(#goldv)"/></g>`);

export const featureRunItTwice = () => feature('fr2', '#1a3a6a', 'Run It Twice',
  `${[0, 1, 2, 3, 4].map((i) => card(28 + i * 26, 40, 24, ['A', 'K', '9', '9', '4'][i], ['s', 'h', 'd', 'c', 's'][i], 0, 'k')).join('')}
   ${[0, 1, 2, 3, 4].map((i) => card(28 + i * 26, 82, 24, ['A', 'K', '9', 'Q', '2'][i], ['s', 'h', 'd', 'h', 'c'][i], 0, 'k')).join('')}
   <path d="M168 34Q200 34 200 60Q200 86 168 86" fill="none" stroke="url(#goldv)" stroke-width="5" stroke-linecap="round"/>
   <path d="M160 86L172 78V94Z" fill="${PALETTE.gold}"/>${text(205, 66, '×2', { size: 20, weight: 900, fill: PALETTE.goldLight, anchor: 'end' })}`);

export const featureSocial = () => feature('fs', '#5a3a14', 'Social Features',
  `<g transform="translate(36 22)"><rect width="88" height="44" rx="12" fill="#f5ecd8" stroke="${INK}" stroke-width="2"/><path d="M18 44L14 58L32 44Z" fill="#f5ecd8" stroke="${INK}" stroke-width="2"/>
     ${text(44, 28, 'nice hand!', { size: 12, weight: 700, fill: INK, anchor: 'middle', filter: '' })}</g>
   <g transform="translate(126 44)"><rect width="76" height="38" rx="12" fill="url(#greenv)" stroke="${INK}" stroke-width="2"/><path d="M60 38L66 50L50 38Z" fill="#2e8b3e" stroke="${INK}" stroke-width="2"/>
     ${text(38, 25, 'gg wp', { size: 12, weight: 700, anchor: 'middle', filter: '' })}</g>
   <g transform="translate(60 92)"><circle r="16" fill="url(#goldv)" stroke="${INK}" stroke-width="2"/><circle cx="-5" cy="-3" r="2.5" fill="${INK}"/><circle cx="5" cy="-3" r="2.5" fill="${INK}"/><path d="M-7 5Q0 12 7 5" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/></g>`);

export const featureHandHistory = () => feature('fh', '#4a1420', 'Hand History',
  `<rect x="20" y="18" width="140" height="80" rx="6" fill="#0d0f12" stroke="#ffffff" stroke-opacity=".15"/>
   ${[40, 62, 34, 70, 52, 84].map((v, i) => `<rect x="${32 + i * 20}" y="${88 - v * 0.75}" width="12" height="${v * 0.75}" rx="2" fill="${i % 2 ? PALETTE.red2 : PALETTE.green2}" opacity=".85"/>`).join('')}
   <path d="M32 74L52 60L72 66L92 44L112 50L140 30" fill="none" stroke="url(#goldv)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
   ${card(186, 60, 34, 'Q', 'd', 12, 'k')}`);

/* ---------------------------- casino tiles 225x205 ------------------------- */
function casinoTile(id, tint, title, art) {
  const W = 225;
  const H = 205;
  const p = panel(id, W, H, tint, { cx: 0.5, cy: 0.38 });
  const body = `${p.body}${streaks(W, H, 2)}${dust(id.charCodeAt(1) * 3, 0, 0, W, 150, 26, 1.6)}${art}
    ${text(10, 20, 'SLOTS', { size: 10, weight: 800, fill: PALETTE.gold, spacing: 2 })}
    ${text(W / 2, 176, title, { size: 22, weight: 900, fill: 'url(#goldtext)', anchor: 'middle', stroke: '#1a0a04' })}
    ${text(W / 2, 194, 'DanGG Original', { size: 10, weight: 700, fill: '#d6d0c4', anchor: 'middle', spacing: 1, filter: '' })}`;
  return frame(W, H, body, p.def);
}

export const casinoOlympus = () => casinoTile('co', '#5a4210',
  'Olympus Gold', `<g transform="translate(112 84)">
    <path d="M-60 40H60L52 28H-52Z" fill="url(#goldv)" stroke="${INK}" stroke-width="2"/>
    ${[-40, -14, 14, 40].map((x) => `<rect x="${x - 8}" y="-30" width="16" height="58" fill="#f5ecd8" stroke="${INK}" stroke-width="1.5"/><rect x="${x - 11}" y="-36" width="22" height="8" fill="url(#goldv)" stroke="${INK}" stroke-width="1.5"/>`).join('')}
    <path d="M-62 -36L0 -66L62 -36Z" fill="url(#goldv)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M10 -96L-8 -66H4L-6 -44L14 -74H2Z" fill="#fff4b0" stroke="${INK}" stroke-width="1.5" filter="url(#glow)"/></g>`);

export const casinoDiscoCat = () => casinoTile('cd', '#4a1a5a',
  'Disco Cat', `<g transform="translate(112 82)">
    ${Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return `<path d="M0 0L${(90 * Math.cos(a)).toFixed(0)} ${(90 * Math.sin(a)).toFixed(0)}L${(90 * Math.cos(a + 0.2)).toFixed(0)} ${(90 * Math.sin(a + 0.2)).toFixed(0)}Z" fill="${['#ff4fd8', '#4fe3ff', '#ffe04f'][i % 3]}" opacity=".16"/>`; }).join('')}
    <path d="M-34 -30L-40 -60L-14 -40ZM34 -30L40 -60L14 -40Z" fill="#2a2a32" stroke="${INK}" stroke-width="2"/>
    <circle r="40" fill="#2a2a32" stroke="${INK}" stroke-width="2"/>
    <rect x="-30" y="-14" width="26" height="14" rx="4" fill="#ff4fd8"/><rect x="4" y="-14" width="26" height="14" rx="4" fill="#4fe3ff"/>
    <rect x="-4" y="-10" width="8" height="4" fill="#2a2a32"/>
    <path d="M-10 16Q0 24 10 16" stroke="#f5ecd8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="0" cy="-62" r="12" fill="url(#silverv)" stroke="${INK}" stroke-width="1.5"/></g>`);

export const casinoRoboRush = () => casinoTile('cr', '#14405a',
  'Robo Rush', `<g transform="translate(112 86)">
    <rect x="-38" y="-46" width="76" height="62" rx="10" fill="url(#silverv)" stroke="${INK}" stroke-width="2"/>
    <circle cx="-15" cy="-18" r="10" fill="#0b2a3a"/><circle cx="15" cy="-18" r="10" fill="#0b2a3a"/>
    <circle cx="-15" cy="-18" r="5" fill="#4fe3ff" filter="url(#glow)"/><circle cx="15" cy="-18" r="5" fill="#4fe3ff" filter="url(#glow)"/>
    <rect x="-18" y="2" width="36" height="6" rx="3" fill="#0b2a3a"/>
    <path d="M0 -46V-62" stroke="${INK}" stroke-width="3"/><circle cy="-66" r="6" fill="${PALETTE.red2}" stroke="${INK}" stroke-width="1.5"/>
    <rect x="-30" y="20" width="60" height="30" rx="6" fill="url(#silverv)" stroke="${INK}" stroke-width="2"/>
    ${chipTop(-62, 40, 18, 'gold')}${chipTop(62, 36, 16, 'blue')}</g>`);

export const casinoClover = () => casinoTile('cc', '#1a5a2a',
  'Clover Cash', `<g transform="translate(112 80)">
    ${[0, 90, 180, 270].map((r) => `<g transform="rotate(${r})"><path d="M0 0C-30 -10 -34 -46 -12 -50C-2 -52 0 -40 0 -36C0 -40 2 -52 12 -50C34 -46 30 -10 0 0Z" fill="url(#greenv)" stroke="${INK}" stroke-width="2"/></g>`).join('')}
    <circle r="8" fill="url(#goldv)" stroke="${INK}" stroke-width="2"/>
    <path d="M4 8Q14 40 30 56" stroke="#1f6b35" stroke-width="6" fill="none" stroke-linecap="round"/></g>
    ${chipStack(40, 150, 4, 16, 'gold')}${chipStack(186, 150, 3, 16, 'green')}`);

/* ----------------------------- table TV 225x140 ---------------------------- */
export function tableTv(i) {
  const W = 225;
  const H = 140;
  const felts = ['#1f6b4a', '#2457a0', '#6a2a72', '#7c2230'];
  const boards = [['A', 's', 'K', 'h', '9', 'd'], ['Q', 'c', 'Q', 'd', '7', 's'], ['J', 'h', '10', 'h', '2', 'c'], ['8', 's', '8', 'c', '8', 'h']];
  const b = boards[i];
  const p = panel(`tv${i}`, W, H, felts[i], { r: 0, cx: 0.5, cy: 0.5 });
  const body = `${p.body}
    ${miniTable(W / 2, 72, 76, 40, felts[i], 8)}
    ${[0, 1, 2].map((k) => card(84 + k * 28, 70, 22, b[k * 2], b[k * 2 + 1], 0, 'k')).join('')}
    ${chipStack(112, 102, 3, 10, 'red')}
    <circle cx="${W / 2}" cy="70" r="22" fill="#000" opacity=".45"/>
    <path d="M${W / 2 - 7} 59L${W / 2 + 11} 70L${W / 2 - 7} 81Z" fill="#fff"/>
    <rect x="8" y="8" width="46" height="18" rx="4" fill="${PALETTE.red}"/>
    <circle cx="18" cy="17" r="3.5" fill="#fff"/>
    ${text(36, 21.5, 'LIVE', { size: 10, weight: 800, anchor: 'middle', filter: '' })}`;
  return frame(W, H, body, p.def);
}
