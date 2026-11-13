// Lobby chrome: the jackpot ticker banner, the header promo banner and the gem-sale splash.
// The game tab plates (chrome/tab_*.png) are Dan's own artwork and are not generated here.
import { renderPng } from '../render.mjs';
import { FONT, PALETTE, svg, card, cardDefs, chipStack, chipDefs, chipTop, dust, gem, sparkle } from './shared.mjs';

function jackpotSvg() {
  const w = 324;
  const h = 51;
  const body = `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="7" fill="url(#jbg)" stroke="${PALETTE.goldDeep}" stroke-width="1.5"/>
    <rect x="3" y="3" width="${w - 6}" height="2" rx="1" fill="${PALETTE.goldLight}" opacity=".18"/>
    ${dust(51, 100, 30, 220, 18, 26, 1.6)}
    <path d="M8 8H98L110 25.5L98 43H8Z" fill="url(#jbadge)" stroke="${PALETTE.goldLight}" stroke-width="1.2"/>
    <text x="55" y="32" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="15" letter-spacing="1.5" fill="#fff4d6">JACKPOT</text>
    ${sparkle(102, 12, 4)}
    <g transform="translate(130 25.5)">${chipTop(0, 0, 11, 'gold', '')}</g>
    <text x="${w - 14}" y="34" text-anchor="end" font-family="${FONT.display}" font-weight="800" font-size="24" fill="url(#jnum)" letter-spacing=".5">1,990,265</text>`;
  const defs = `<linearGradient id="jbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2621"/><stop offset="1" stop-color="#070a09"/></linearGradient>
    <linearGradient id="jbadge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALETTE.red2}"/><stop offset="1" stop-color="#6e1520"/></linearGradient>
    <linearGradient id="jnum" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4d6"/><stop offset=".55" stop-color="${PALETTE.goldLight}"/><stop offset="1" stop-color="${PALETTE.gold}"/></linearGradient>`;
  return svg(w, h, body, defs);
}

function promoSvg() {
  const w = 845;
  const h = 143;
  const body = `<rect width="${w}" height="${h}" fill="url(#pbg)"/>
    <rect width="${w}" height="${h}" fill="url(#pglow)"/>
    ${Array.from({ length: 14 }, (_, i) => `<path d="M${420 + i * 34} 0L${380 + i * 34} ${h}" stroke="${PALETTE.gold}" stroke-opacity=".05" stroke-width="12"/>`).join('')}
    ${dust(97, 0, 0, w, h, 70, 1.8)}
    ${chipStack(70, 128, 7, 34, 'black', '♠')}${chipStack(148, 132, 5, 34, 'red')}${chipStack(112, 134, 2, 32, 'gold', '♠')}
    ${card(220, 76, 64, 'A', 's', -14, 'pc')}${card(262, 72, 64, 'A', 'h', 10, 'pc')}
    <text x="330" y="38" font-family="${FONT.display}" font-weight="600" font-size="13" letter-spacing="4" fill="${PALETTE.gold}">EVERY DAY · PLAY CHIPS</text>
    <text x="328" y="86" font-family="${FONT.display}" font-weight="800" font-size="35" fill="url(#ptxt)">DAILY CHIP FLIPOUT</text>
    <text x="330" y="114" font-family="${FONT.sans}" font-size="16" fill="#d9d1c0">100,000 play chips up for grabs, every single day.</text>
    <g transform="translate(762 72)">
      <circle r="52" fill="url(#medal)" stroke="${PALETTE.goldLight}" stroke-width="2"/>
      <circle r="44" fill="none" stroke="#5c4319" stroke-width="2" stroke-dasharray="3 4"/>
      <text y="14" text-anchor="middle" font-family="${FONT.serif}" font-size="44" fill="#1a1208">♠</text>
      <text y="-22" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="12" letter-spacing="2" fill="#3a2a0e">DAILY</text>
      <text y="34" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="12" letter-spacing="2" fill="#3a2a0e">FLIP</text>
    </g>
    ${sparkle(712, 26, 7)}${sparkle(810, 120, 5)}
    <rect y="${h - 2}" width="${w}" height="2" fill="${PALETTE.gold}" opacity=".6"/>`;
  const defs = `${cardDefs('pc')}${chipDefs()}
    <linearGradient id="pbg" x1="0" x2="1"><stop offset="0" stop-color="#0d1a14"/><stop offset=".5" stop-color="#173528"/><stop offset="1" stop-color="#0a120e"/></linearGradient>
    <radialGradient id="pglow" cx=".3" cy=".5" r=".5"><stop offset="0" stop-color="${PALETTE.gold}" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="ptxt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="${PALETTE.goldLight}"/></linearGradient>
    <radialGradient id="medal" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff0c4"/><stop offset=".5" stop-color="${PALETTE.gold}"/><stop offset="1" stop-color="#7a5a22"/></radialGradient>`;
  return svg(w, h, body, defs);
}

function chest(cx, cy) {
  return `<g transform="translate(${cx} ${cy})">
    <ellipse cx="0" cy="96" rx="170" ry="22" fill="#000" opacity=".5"/>
    <ellipse cx="0" cy="-30" rx="190" ry="150" fill="url(#chestglow)"/>
    <rect x="-130" y="0" width="260" height="96" rx="8" fill="url(#wood)" stroke="${PALETTE.goldDeep}" stroke-width="3"/>
    <rect x="-130" y="0" width="260" height="14" fill="${PALETTE.gold}" opacity=".85"/>
    <rect x="-70" y="0" width="16" height="96" fill="${PALETTE.gold}" opacity=".8"/><rect x="54" y="0" width="16" height="96" fill="${PALETTE.gold}" opacity=".8"/>
    <path d="M-132 2L-122 -78Q0 -118 122 -78L132 2Z" fill="url(#wood)" stroke="${PALETTE.goldDeep}" stroke-width="3"/>
    <path d="M-116 0L-108 -66Q0 -100 108 -66L116 0Z" fill="#1f0f07"/>
    <rect x="-18" y="18" width="36" height="40" rx="6" fill="url(#gold)" stroke="#5c4319"/>
    ${gem(-60, -10, 34, '#a8f0ff', '#1b6fa8')}${gem(4, -32, 44, '#c8b4ff', '#4b2fa0')}${gem(70, -6, 30, '#9ff5c8', '#1a7d4f')}
    ${[-100, -30, 40, 104].map((x, i) => chipTop(x, 4 - (i % 2) * 6, 18, 'gold', '')).join('')}
    ${sparkle(-110, -90, 10, '#fff')}${sparkle(110, -110, 8, '#fff')}${sparkle(20, -150, 12, '#fff')}
  </g>`;
}

function splashSvg() {
  const w = 800;
  const h = 481;
  const body = `<rect width="${w}" height="${h}" fill="url(#sbg)"/>
    ${Array.from({ length: 7 }, (_, i) => `<path d="M${180 + i * 70} 0L${120 + i * 90} ${h}L${150 + i * 90} ${h}L${200 + i * 70} 0Z" fill="#9fe0ff" opacity=".035"/>`).join('')}
    ${dust(301, 0, 0, w, h, 90, 2.2, '#bfeaff')}
    <path d="M0 ${h}V400Q120 360 260 392T560 380T800 396V${h}Z" fill="#06121c"/>
    ${chest(270, 300)}
    <text x="40" y="58" font-family="${FONT.display}" font-weight="800" font-size="30" fill="${PALETTE.text}">Dan<tspan fill="${PALETTE.gold}">GG</tspan></text>
    <text x="760" y="110" text-anchor="end" font-family="${FONT.display}" font-weight="800" font-size="68" fill="url(#stxt)">GEM SALE</text>
    <text x="760" y="150" text-anchor="end" font-family="${FONT.display}" font-weight="600" font-size="20" letter-spacing="3" fill="#bfe4f5">THIS WEEK ONLY</text>
    <g transform="translate(560 214) rotate(-6)">
      <rect x="-10" y="0" width="220" height="104" rx="14" fill="${PALETTE.red}" stroke="#ffd7d7" stroke-opacity=".5" stroke-width="2"/>
      <text x="100" y="40" text-anchor="middle" font-family="${FONT.display}" font-weight="700" font-size="20" fill="#ffe9e9">UP TO</text>
      <text x="100" y="88" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="40" fill="#fff">50% OFF</text>
    </g>
    <g transform="translate(520 360)">
      <rect width="250" height="76" rx="12" fill="#0b1a26" stroke="${PALETTE.gold}" stroke-width="2"/>
      <text x="125" y="30" text-anchor="middle" font-family="${FONT.display}" font-size="17" fill="#8aa3b3" text-decoration="line-through">5,000 GEMS</text>
      ${gem(34, 54, 12)}
      <text x="148" y="63" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="26" fill="${PALETTE.text}">2,500 GEMS</text>
    </g>`;
  const defs = `${chipDefs()}
    <linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d3550"/><stop offset=".6" stop-color="#071d2e"/><stop offset="1" stop-color="#030a10"/></linearGradient>
    <radialGradient id="chestglow"><stop offset="0" stop-color="#ffe6a6" stop-opacity=".55"/><stop offset="1" stop-color="#ffe6a6" stop-opacity="0"/></radialGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a3a1c"/><stop offset="1" stop-color="#2a140a"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALETTE.goldLight}"/><stop offset="1" stop-color="${PALETTE.goldDeep}"/></linearGradient>
    <linearGradient id="stxt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bff0ff"/><stop offset="1" stop-color="#5cc7f0"/></linearGradient>`;
  return svg(w, h, body, defs);
}

export async function renderChrome() {
  const out = [];
  out.push(await renderPng('chrome/jackpot.png', jackpotSvg(), 324, 51));
  out.push(await renderPng('chrome/promo.png', promoSvg(), 845, 143));
  out.push(await renderPng('chrome/splash.png', splashSvg(), 800, 481));
  return out;
}
