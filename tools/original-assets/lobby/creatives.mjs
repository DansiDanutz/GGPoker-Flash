// Home feed, promo carousel and tournament series art (ui/creatives/*), rendered at 2x.
// Replaces third-party promotional images with original DanGG artwork.
import { renderPng } from '../render.mjs';
import { FONT, PALETTE } from './shared.mjs';
import { SCALE, frame, sparkle, text, trophy } from './creatives-kit.mjs';
import * as H from './creatives-home.mjs';

const INK = '#1a1208';

/** Series tab plate (145x44): icon on the left, wordmark on the right. */
function seriesTab(label, icon, accent, w = 145) {
  const h = 44;
  const def = `<linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2e"/><stop offset="1" stop-color="#101012"/></linearGradient>`;
  const size = label.length > 12 ? 11.5 : 13.5;
  const body = `<rect width="${w}" height="${h}" fill="url(#plate)"/>
    <rect width="${w}" height="${h}" fill="url(#gloss)"/>
    <rect y="${h - 3}" width="${w}" height="3" fill="${accent}"/>
    <g transform="translate(22 21)">${icon}</g>
    ${text(42, 27, label, { size, weight: 900, fill: 'url(#goldtext)', stroke: '#000' })}`;
  return frame(w, h, body, def);
}

const ICON = {
  millions: `<circle r="13" fill="url(#goldv)" stroke="${INK}" stroke-width="1.5"/><text y="5" text-anchor="middle" font-family="${FONT.display}" font-weight="900" font-size="14" fill="${INK}">M</text>`,
  plo: `<g transform="scale(.42)">${[-18, -6, 6, 18].map((x, i) => `<rect x="${x - 12}" y="-22" width="24" height="34" rx="3" fill="#fbf8f1" stroke="${INK}" stroke-width="2" transform="rotate(${(i - 1.5) * 12} ${x} 20)"/>`).join('')}</g>`,
  masters: `<path d="M-13 5L-15 -9L-7 -2L0 -12L7 -2L15 -9L13 5Z" fill="url(#goldv)" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><rect x="-13" y="5" width="26" height="5" rx="1" fill="url(#goldv)" stroke="${INK}" stroke-width="1.2"/>`,
  live: `<circle r="13" fill="url(#redv)" stroke="${INK}" stroke-width="1.5"/><circle r="5" fill="#fff"/><circle r="9" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>`,
  jackpot: `<circle r="13" fill="url(#goldv)" stroke="${INK}" stroke-width="1.5"/>${sparkle(0, 0, 8, INK)}`,
  battle: `<rect x="-12" y="-12" width="24" height="24" rx="4" fill="url(#purplev)" stroke="url(#goldv)" stroke-width="2"/><text y="6" text-anchor="middle" font-family="${FONT.display}" font-weight="900" font-size="16" fill="${PALETTE.goldLight}">?</text>`,
  flip: `<path d="M4 -14L-8 2H0L-4 14L10 -4H2Z" fill="url(#goldv)" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`,
};

function tournamentsTab() {
  const w = 147;
  const h = 44;
  const body = `<rect width="${w}" height="${h}" fill="url(#redv)"/><rect width="${w}" height="${h}" fill="url(#gloss)"/>
    ${trophy(22, 24, 0.36, '')}
    ${text(40, 28, 'Tournaments', { size: 16, weight: 900, stroke: '#3a060c' })}`;
  return frame(w, h, body);
}

/** [file, svg factory, width, height] at 1x; files are written at SCALE. */
export const CREATIVES = Object.freeze([
  ['hero-november', H.hero, 800, 250],
  ['foryou-recent', H.forYouRecent, 226, 234],
  ['foryou-freebie', H.forYouFreebie, 226, 234],
  ['foryou-ocean', H.forYouOcean, 226, 234],
  ['foryou-live-series', H.forYouLiveSeries, 226, 234],
  ['tourn-masters', H.tournMasters, 345, 140],
  ['tourn-weekender', H.tournWeekender, 345, 140],
  ['tourn-daily', H.tournDaily, 345, 140],
  ['feature-time-bank', H.featureTimeBank, 225, 140],
  ['feature-run-it-twice', H.featureRunItTwice, 225, 140],
  ['feature-social', H.featureSocial, 225, 140],
  ['feature-hand-history', H.featureHandHistory, 225, 140],
  ['casino-olympus-gold', H.casinoOlympus, 225, 205],
  ['casino-disco-cat', H.casinoDiscoCat, 225, 205],
  ['casino-robo-rush', H.casinoRoboRush, 225, 205],
  ['casino-clover-cash', H.casinoClover, 225, 205],
  ...[0, 1, 2, 3].map((i) => [`tv-${i}`, () => H.tableTv(i), 225, 140]),
  ['series-tournaments', tournamentsTab, 147, 44],
  ['series-millions', () => seriesTab('Millions Festival', ICON.millions, PALETTE.gold), 145, 44],
  ['series-plo', () => seriesTab('PLO Series', ICON.plo, PALETTE.blue), 145, 44],
  ['series-masters', () => seriesTab('Masters', ICON.masters, PALETTE.gold), 145, 44],
  ['series-live', () => seriesTab('Live Series', ICON.live, PALETTE.red2), 145, 44],
  ['series-jackpot', () => seriesTab('Jackpot SNG', ICON.jackpot, PALETTE.gold), 145, 44],
  ['series-battle', () => seriesTab('Battle Royale', ICON.battle, PALETTE.purple), 145, 44],
  ['series-flip', () => seriesTab('Quick Flip', ICON.flip, '#e07b12'), 145, 44],
]);

export async function renderCreatives() {
  const out = [];
  for (const [name, draw, w, h] of CREATIVES) out.push(await renderPng(`ui/creatives/${name}.png`, draw(), w * SCALE, h * SCALE));
  return out;
}
