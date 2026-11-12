// Login hero art: a premium lounge scene (green felt table, leather rail, pendant light,
// chip stacks and two kings) with the headline block top-left, clear of the login card.
import { renderPng } from '../render.mjs';
import { FONT, PALETTE, svg, card, cardDefs, chipStack, chipDefs, dust } from './shared.mjs';

const LAYOUTS = Object.freeze({
  desktop: {
    w: 860, h: 964,
    text: { x: 104, y: 112, kicker: 15, head: 74, sub: 21, gap: 84 },
    table: { cx: 520, cy: 1010, rx: 700, ry: 440 },
    lamp: { x: 640, y: 0, len: 120 },
    stacks: [[205, 640, 12, 58, 'black', '♠'], [330, 618, 9, 56, 'red'], [140, 720, 7, 56, 'cream'], [275, 742, 3, 60, 'black', '♠']],
    cards: [[372, 812, 150, 'K', 's', -12], [500, 800, 150, 'K', 'h', 9]],
  },
  mobile: {
    w: 840, h: 630,
    text: { x: 58, y: 86, kicker: 15, head: 66, sub: 20, gap: 74 },
    table: { cx: 470, cy: 780, rx: 720, ry: 400 },
    lamp: { x: 640, y: 0, len: 70 },
    stacks: [[575, 430, 10, 50, 'black', '♠'], [690, 420, 8, 50, 'red'], [505, 478, 6, 50, 'cream'], [620, 488, 2, 54, 'black', '♠']],
    cards: [[600, 548, 122, 'K', 's', -10], [705, 540, 122, 'K', 'h', 8]],
  },
});

function defs({ w, h, lamp }) {
  return `${cardDefs('hc')}${chipDefs()}
  <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1412"/><stop offset=".55" stop-color="#120d0c"/><stop offset="1" stop-color="#080606"/></linearGradient>
  <radialGradient id="lampglow" cx="${lamp.x / w}" cy="${(lamp.len + 40) / h}" r=".55"><stop offset="0" stop-color="#ffd896" stop-opacity=".42"/><stop offset=".35" stop-color="#c88a3a" stop-opacity=".14"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <radialGradient id="felt" cx=".5" cy=".18" r=".75"><stop offset="0" stop-color="#2a5a43"/><stop offset=".45" stop-color="#173a2b"/><stop offset="1" stop-color="#08140f"/></radialGradient>
  <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3420"/><stop offset=".25" stop-color="#2c170f"/><stop offset="1" stop-color="#120806"/></linearGradient>
  <linearGradient id="goldtxt" x1="0" x2="1"><stop offset="0" stop-color="${PALETTE.goldLight}"/><stop offset="1" stop-color="${PALETTE.gold}"/></linearGradient>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1c10"/><stop offset="1" stop-color="#0d0805"/></linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="bokeh"><feGaussianBlur stdDeviation="3"/></filter>`;
}

function wall({ w, h }) {
  const panels = [];
  for (let x = -40; x < w + 80; x += 170) {
    panels.push(`<rect x="${x + 14}" y="40" width="142" height="${h * 0.44}" rx="3" fill="none" stroke="#3a2a1c" stroke-opacity=".55" stroke-width="2"/>
      <rect x="${x + 22}" y="48" width="126" height="${h * 0.44 - 16}" rx="2" fill="#000" opacity=".12"/>`);
  }
  return `<rect width="${w}" height="${h}" fill="url(#wall)"/>${panels.join('')}
    <rect y="${h * 0.44 + 46}" width="${w}" height="6" fill="#3a2716" opacity=".7"/>`;
}

function lampAndLight({ w, h, lamp }) {
  const { x, len } = lamp;
  const top = len;
  return `<rect width="${w}" height="${h}" fill="url(#lampglow)"/>
    <path d="M${x - 20} ${top + 46}L${x - 260} ${h}L${x + 260} ${h}L${x + 20} ${top + 46}Z" fill="#ffd896" opacity=".05"/>
    <line x1="${x}" y1="0" x2="${x}" y2="${top}" stroke="#2b2118" stroke-width="3"/>
    <path d="M${x - 16} ${top}L${x + 16} ${top}L${x + 64} ${top + 46}L${x - 64} ${top + 46}Z" fill="url(#shade)" stroke="${PALETTE.goldDeep}" stroke-width="1.5"/>
    <path d="M${x - 64} ${top + 46}L${x + 64} ${top + 46}" stroke="${PALETTE.gold}" stroke-width="2"/>
    <ellipse cx="${x}" cy="${top + 50}" rx="58" ry="9" fill="#fff1c8" opacity=".9" filter="url(#bokeh)"/>
    <ellipse cx="${x}" cy="${top + 52}" rx="120" ry="40" fill="#ffd27a" opacity=".22" filter="url(#soft)"/>`;
}

function table({ table: t }) {
  const { cx, cy, rx, ry } = t;
  return `<ellipse cx="${cx}" cy="${cy + 30}" rx="${rx + 70}" ry="${ry + 70}" fill="#000" opacity=".6" filter="url(#soft)"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx + 46}" ry="${ry + 46}" fill="url(#rail)"/>
    <ellipse cx="${cx}" cy="${cy - 2}" rx="${rx + 40}" ry="${ry + 40}" fill="none" stroke="#8a5a36" stroke-opacity=".5" stroke-width="2"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx + 4}" ry="${ry + 4}" fill="${PALETTE.goldDeep}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#felt)"/>
    <ellipse cx="${cx}" cy="${cy + 10}" rx="${rx - 70}" ry="${ry - 60}" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".55" stroke-width="2"/>`;
}

function headline({ text }) {
  const { x, y, kicker, head, sub, gap } = text;
  return `<text x="${x}" y="${y}" font-family="${FONT.display}" font-weight="600" font-size="${kicker}" letter-spacing="${kicker * 0.42}" fill="${PALETTE.gold}">PLAY MONEY POKER</text>
    <text font-family="${FONT.display}" font-weight="700" font-size="${head}" fill="${PALETTE.text}" letter-spacing="-1">
      <tspan x="${x - 4}" y="${y + gap}">Pull up</tspan><tspan x="${x - 4}" y="${y + gap * 2}">a chair.</tspan></text>
    <text x="${x}" y="${y + gap * 2 + sub * 2.4}" font-family="${FONT.sans}" font-size="${sub}" fill="#cfc6b6">Real tables, play chips, zero cash at stake.</text>
    <rect x="${x}" y="${y + gap * 2 + sub * 3.6}" width="64" height="3" fill="url(#goldtxt)"/>`;
}

function props(layout) {
  const stacks = [...layout.stacks]
    .sort((a, b) => a[1] - b[1])
    .map(([x, y, n, r, c, g]) => chipStack(x, y, n, r, c, g ?? '')).join('');
  const cards = layout.cards.map(([x, y, w, rank, suit, rot]) => card(x, y, w, rank, suit, rot, 'hc')).join('');
  return `${stacks}${cards}`;
}

function scene(layout) {
  const { w, h } = layout;
  const body = `${wall(layout)}${lampAndLight(layout)}${table(layout)}
    ${dust(7 + w, 0, 0, w, h * 0.6, 60, 2.4)}
    ${props(layout)}
    <rect width="${w}" height="${h}" fill="url(#vignette)"/>
    ${headline(layout)}`;
  const vignette = `<radialGradient id="vignette" cx=".55" cy=".5" r=".8"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`;
  return svg(w, h, body, defs(layout) + vignette);
}

export async function renderLogin() {
  const out = [];
  out.push(await renderPng('login/hero.png', scene(LAYOUTS.desktop), 860, 964));
  out.push(await renderPng('login/hero-mobile.png', scene(LAYOUTS.mobile), 840, 630));
  return out;
}
