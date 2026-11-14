// Poker Home content: the hero carousel, the "For You" promotion cards and the pure helpers
// that pick live tables for the Home page. All art is DanGG's own (tools/original-assets).

/** Where a Home item leads: a lobby game tab, or an app route. */
export type HomeTarget = { tab: string } | { route: string };

export type HeroSlide = {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  cta: string;
  art: string;
  artWide: string;
  artPhone: string;
  bg: string;
  target: HomeTarget;
};

export type PromoCard = {
  key: string;
  title: string;
  sub: string;
  art: string;
  target: HomeTarget;
};

const DISCOVER = '/assets/ui/discover/';

export const HERO_SLIDES: readonly HeroSlide[] = Object.freeze([
  {
    key: 'flipout', kicker: 'Every day · Play chips', title: 'Daily Chip Flipout', sub: '100,000 play chips up for grabs, every single day.',
    cta: 'Join now', art: `${DISCOVER}Bg_Discover_Leaderboard_FlipNGo.png`, artWide: '/assets/hero/flipout.svg', artPhone: '/assets/hero/phone-flipout.svg', bg: 'linear-gradient(110deg, #3a1d05 0%, #1a0d03 55%, #090502 100%)',
    target: { route: '/tournaments' },
  },
  {
    key: 'aof', kicker: 'All-in or Fold', title: 'One decision. Fast action.', sub: 'Shove or fold, nothing in between. Hands fly by.',
    cta: 'Play now', art: `${DISCOVER}Bg_Discover_AoF.png`, artWide: '/assets/hero/aof.svg', artPhone: '/assets/hero/phone-aof.svg', bg: 'linear-gradient(110deg, #4a0f14 0%, #1f070a 55%, #0b0304 100%)',
    target: { tab: 'aof' },
  },
  {
    key: 'rush', kicker: 'Rush & Cash', title: 'Fold. Move. Play again.', sub: 'Quick-fold to a fresh table and watch for Cash Drops.',
    cta: 'Play now', art: `${DISCOVER}Bg_Discover_RushNCash_Holdem.png`, artWide: '/assets/hero/rush.svg', artPhone: '/assets/hero/phone-rush.svg', bg: 'linear-gradient(110deg, #06343a 0%, #04191c 55%, #020a0b 100%)',
    target: { tab: 'rush' },
  },
  {
    key: 'plo', kicker: 'PLO Series', title: 'PLO6 is live', sub: 'Six cards. Six-max. More outs than ever.',
    cta: 'Play now', art: `${DISCOVER}Bg_Discover_Leaderboard_PLO6.png`, artWide: '/assets/hero/plo.svg', artPhone: '/assets/hero/phone-plo.svg', bg: 'linear-gradient(110deg, #0c2550 0%, #071429 55%, #03080f 100%)',
    target: { tab: 'plo' },
  },
  {
    key: 'spin', kicker: 'Jackpot SNG', title: 'Spin for the jackpot', sub: 'Three players, one wheel, prizes up to 12,000x.',
    cta: 'Spin now', art: `${DISCOVER}Bg_Discover_SpinNGold.png`, artWide: '/assets/hero/spin.svg', artPhone: '/assets/hero/phone-spin.svg', bg: 'linear-gradient(110deg, #47330a 0%, #1f1604 55%, #0b0802 100%)',
    target: { tab: 'spin' },
  },
  {
    key: 'battle', kicker: 'Battle Royale', title: 'Last one standing', sub: 'Bounty tournaments with hidden prizes on every head.',
    cta: 'Register', art: `${DISCOVER}Bg_Discover_MysteryBattleRoyal.png`, artWide: '/assets/hero/battle.svg', artPhone: '/assets/hero/phone-battle.svg', bg: 'linear-gradient(110deg, #2c0f4a 0%, #150725 55%, #07030c 100%)',
    target: { tab: 'battle' },
  },
]);

export const PROMO_CARDS: readonly PromoCard[] = Object.freeze([
  { key: 'freebie', title: 'Daily Freebie', sub: 'A free gift every day', art: `${DISCOVER}Bg_Discover_DailyFreebie.png`, target: { route: '/rewards' } },
  { key: 'freeroll', title: 'Weekly Freeroll', sub: 'Free entry, real prizes', art: `${DISCOVER}Bg_Discove_WeeklyFreeroll_EN.png`, target: { route: '/tournaments' } },
  { key: 'welcome', title: 'Welcome Bonus', sub: 'New player welcome package', art: `${DISCOVER}Bg_Discover_Honeymoon.png`, target: { route: '/promotions' } },
  { key: 'wheel', title: 'Prize Wheel', sub: 'Spin to win up to 100,000x', art: `${DISCOVER}Bg_Discover_Fishbuffet.png`, target: { route: '/rewards' } },
  { key: 'ocean', title: 'DanGG Rewards', sub: 'Collect gems, climb the reef', art: `${DISCOVER}D_Discover_OceanRewards_Whale.png`, target: { route: '/ocean' } },
  { key: 'holdem-lb', title: "Hold'em Leaderboard", sub: 'Weekly race for the top', art: `${DISCOVER}Bg_Discover_Leaderboard_Holdem.png`, target: { route: '/leaderboard' } },
  { key: 'care', title: 'Player Care', sub: 'Bad beat protection & daily prizes', art: `${DISCOVER}Bg_Discover_GGcare.png`, target: { route: '/promotions' } },
  { key: 'casino', title: 'Casino Bonus', sub: 'Weekly free spins', art: `${DISCOVER}Bg_Discover_CasinoBonus_EN.png`, target: { route: '/casino' } },
]);

/** How often the hero carousel advances on its own. */
export const HERO_INTERVAL_MS = 6000;

/** The next slide index after `step` (+1 forward, -1 back), wrapping around. */
export function stepSlide(active: number, step: number, count: number): number {
  if (count <= 0) return 0;
  return (((active + step) % count) + count) % count;
}

type HomeTable = { id: string; players: number; seats: number; running: boolean; private?: boolean; game: string; avgPot: number };

/** Games that are tournaments or pools, not sit-down tables you can join from Home. */
const NOT_WATCHABLE = new Set(['spingold', 'battleroyale', 'flipandgo', 'rush', 'rushplo']);

/** A table with a free seat to suggest under "Jump back in": busiest first, never full. */
export function suggestedTable<T extends HomeTable>(tables: readonly T[]): T | null {
  const open = tables.filter((t) => !t.private && !NOT_WATCHABLE.has(t.game) && t.players < t.seats);
  if (!open.length) return null;
  return open.slice().sort((a, b) => b.players - a.players || b.avgPot - a.avgPot)[0];
}
