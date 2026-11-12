// Promotion tiles (ui/discover, 226x230) and table-colour previews (ui/option_page, 564x400).
// File names are kept because the app references them; artwork and labels are original.
import { renderPng } from '../render.mjs';
import { FONT, PALETTE, svg, cardDefs, chipDefs, dust } from './shared.mjs';
import * as E from './emblems.mjs';

const W = 226;
const H = 230;

/** [file stem, background tint, title, optional kicker, emblem svg] */
const TILES = Object.freeze([
  ['Bg_Discove_WeeklyFreeroll_EN', '#5a3a14', 'Weekly Freeroll', '', E.ticket()],
  ['Bg_Discover_AoF', '#5a1a1e', 'All-in or Fold', '', E.allInFold()],
  ['Bg_Discover_CasinoBonus_EN', '#4a1a3a', 'Casino Bonus', '', E.slots()],
  ['Bg_Discover_DailyFreebie', '#1e4a3a', 'Daily Freebie', '', E.giftBox()],
  ['Bg_Discover_Fishbuffet', '#14405a', 'Prize Wheel', '', E.wheel(false)],
  ['Bg_Discover_Fishbuffet_Platinum', '#2c3a4a', 'Prize Wheel Platinum', '', E.wheel(true)],
  ['Bg_Discover_GGcare', '#173a2b', 'Player Care', '', E.shieldHeart()],
  ['Bg_Discover_Honeymoon', '#5a2234', 'Welcome Bonus', '', E.envelope()],
  ['Bg_Discover_Leaderboard_FlipNGo', '#3a2a5a', 'Quick Flip', 'LEADERBOARD', E.leaderboard(E.motifs.text('FLIP', 16))],
  ['Bg_Discover_Leaderboard_Holdem', '#173a2b', "Hold'em", 'LEADERBOARD', E.leaderboard(E.motifs.spade)],
  ['Bg_Discover_Leaderboard_MysterBattleRoyal', '#3a1e4a', 'Battle Royale', 'LEADERBOARD', E.leaderboard(E.motifs.text('?', 30))],
  ['Bg_Discover_Leaderboard_PLO6', '#1a2a4a', 'PLO6', 'LEADERBOARD', E.leaderboard(E.motifs.text('6', 30))],
  ['Bg_Discover_Leaderboard_RushNCash_Holdem', '#1a3a4a', 'Fast Fold', 'LEADERBOARD', E.leaderboard(E.motifs.bolt)],
  ['Bg_Discover_Leaderboard_ShortDeck', '#4a2a1a', 'Short Deck', 'LEADERBOARD', E.leaderboard(E.motifs.text('6+', 22))],
  ['Bg_Discover_Leaderboard_SpinNGold', '#4a3a14', 'Jackpot SNG', 'LEADERBOARD', E.leaderboard(E.motifs.star)],
  ['Bg_Discover_MysteryBattleRoyal', '#2e1a4a', 'Battle Royale', '', E.swordsBox()],
  ['Bg_Discover_RushNCash_Holdem', '#14384a', "Fast Fold Hold'em", '', E.fastFold()],
  ['Bg_Discover_SpinNGold', '#4a3410', 'Jackpot Sit & Go', '', E.jackpotSng()],
  ['Bg_Discover_WSOPExpress_Promo1_EN', '#3a1418', 'Live Series', '', E.liveSeries()],
  ['D_Discover_OceanRewards_Whale', '#0f3a5a', 'Rewards', '', E.rewardsWhale()],
]);

function tileDefs(tint) {
  return `${cardDefs('tc')}${chipDefs()}
    <radialGradient id="bg" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="${tint}"/><stop offset="1" stop-color="#060807"/></radialGradient>
    <radialGradient id="halo" cx=".5" cy=".45" r=".5"><stop offset="0" stop-color="${PALETTE.goldLight}" stop-opacity=".22"/><stop offset="1" stop-color="${PALETTE.goldLight}" stop-opacity="0"/></radialGradient>
    <linearGradient id="goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c4"/><stop offset=".45" stop-color="${PALETTE.gold}"/><stop offset="1" stop-color="${PALETTE.goldDeep}"/></linearGradient>
    <linearGradient id="silverv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b9c2cc"/><stop offset="1" stop-color="#59626c"/></linearGradient>
    <linearGradient id="redv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALETTE.red2}"/><stop offset="1" stop-color="#5e0f1a"/></linearGradient>
    <linearGradient id="purplev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a54c8"/><stop offset="1" stop-color="#2c1856"/></linearGradient>
    <linearGradient id="plaque" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2420"/><stop offset="1" stop-color="#090c0b"/></linearGradient>`;
}

function plaque(title, kicker) {
  const size = Math.min(17, 188 / (title.length * 0.6));
  const kick = kicker
    ? `<text x="${W / 2}" y="163" text-anchor="middle" font-family="${FONT.display}" font-weight="700" font-size="10" letter-spacing="3" fill="${PALETTE.gold}">${kicker}</text>`
    : '';
  return `${kick}<rect x="14" y="168" width="${W - 28}" height="30" rx="6" fill="url(#plaque)" stroke="${PALETTE.gold}" stroke-opacity=".8" stroke-width="1.5"/>
    <text x="${W / 2}" y="${183 + size * 0.36}" text-anchor="middle" font-family="${FONT.display}" font-weight="800" font-size="${size.toFixed(1)}" fill="${PALETTE.goldLight}">${title.replace('&', '&amp;')}</text>`;
}

function tileSvg([stem, tint, title, kicker, emblem], seed) {
  const streaks = [0, 1, 2].map((i) => `<path d="M${60 + i * 50} 0L${10 + i * 50} ${H}" stroke="#fff" stroke-opacity=".03" stroke-width="18"/>`).join('');
  const body = `<rect width="${W}" height="${H}" fill="url(#bg)"/>${streaks}
    ${dust(seed, 0, 0, W, H, 34, 1.6)}
    <ellipse cx="113" cy="100" rx="100" ry="86" fill="url(#halo)"/>
    ${emblem}${plaque(title, kicker)}`;
  return svg(W, H, body, tileDefs(tint));
}

/** Table-colour preview: felt in the theme colour inside a dark rail, with a gold line. */
const THEMES = Object.freeze({
  Black: '#2a2c2c', Brown: '#6a4529', ChocoBrown: '#45291b', Cobalt: '#2457a0', Cooper: '#9a5428',
  Gray: '#555a5d', Green: '#24694a', Navy: '#1f3563', Purple: '#4a2c72', Red: '#7c2230',
});

function themeSvg(color) {
  const w = 564;
  const h = 400;
  const body = `<rect width="${w}" height="${h}" fill="url(#room)"/>
    <ellipse cx="282" cy="214" rx="262" ry="160" fill="#000" opacity=".55" filter="url(#sh)"/>
    <ellipse cx="282" cy="204" rx="256" ry="156" fill="url(#rail)"/>
    <ellipse cx="282" cy="200" rx="256" ry="156" fill="none" stroke="#5a4636" stroke-width="2" opacity=".6"/>
    <ellipse cx="282" cy="204" rx="226" ry="128" fill="${PALETTE.goldDeep}"/>
    <ellipse cx="282" cy="204" rx="223" ry="125" fill="url(#felt)"/>
    <ellipse cx="282" cy="210" rx="168" ry="84" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".5" stroke-width="2"/>
    <text x="282" y="222" text-anchor="middle" font-family="${FONT.serif}" font-size="44" fill="#000" opacity=".18">♠</text>`;
  const defs = `<radialGradient id="room" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="#050606"/></radialGradient>
    <radialGradient id="felt" cx=".5" cy=".4" r=".65"><stop offset="0" stop-color="${color}"/><stop offset=".7" stop-color="${color}"/><stop offset="1" stop-color="#000" stop-opacity=".9"/></radialGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a20"/><stop offset=".5" stop-color="#1a120d"/><stop offset="1" stop-color="#0a0706"/></linearGradient>
    <filter id="sh"><feGaussianBlur stdDeviation="10"/></filter>`;
  return svg(w, h, body, defs);
}

export async function renderDiscover() {
  const out = [];
  for (const [i, tile] of TILES.entries()) out.push(await renderPng(`ui/discover/${tile[0]}.png`, tileSvg(tile, 100 + i), W, H));
  for (const [name, color] of Object.entries(THEMES)) {
    out.push(await renderPng(`ui/option_page/SettingPage_ColoredBG_${name}.png`, themeSvg(color), 564, 400));
  }
  return out;
}
