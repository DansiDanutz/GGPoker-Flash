// The play-money casino games, shared by the Casino hub and the Home "Casino" row.

export type CasinoGame = {
  readonly key: string;
  readonly name: string;
  readonly desc: string;
  readonly badge: string;
  readonly tags: readonly string[];
  readonly route: string;
};

export const CASINO_GAMES: readonly CasinoGame[] = Object.freeze([
  { key: 'slots', name: 'Slots', desc: 'Spin for your next big win', badge: 'slots', tags: ['5 reels', 'Paylines'], route: '/slots' },
  { key: 'roulette', name: 'Roulette', desc: 'European single-zero wheel', badge: 'roulette', tags: ['Single zero', 'Inside bets'], route: '/casino?game=roulette' },
  { key: 'blackjack', name: 'Blackjack', desc: 'Classic 21 against the dealer', badge: 'blackjack', tags: ['Classic 21'], route: '/casino?game=blackjack' },
  { key: 'crash', name: 'Crash', desc: 'Cash out before it crashes', badge: 'crash', tags: ['Live multiplier'], route: '/casino?game=crash' },
  { key: 'baccarat', name: 'Baccarat', desc: 'Player, Banker or Tie', badge: 'baccarat', tags: ['Player', 'Banker', 'Tie'], route: '/casino?game=baccarat' },
  { key: 'dragontiger', name: 'Dragon Tiger', desc: 'One card each, high card wins', badge: 'dragontiger', tags: ['Fast rounds'], route: '/casino?game=dragontiger' },
  { key: 'sicbo', name: 'Sic Bo', desc: 'Three dice, many ways to win', badge: 'sicbo', tags: ['Three dice'], route: '/casino?game=sicbo' },
]);

/** The casino game a `/casino?game=` route asks for, or `lobby`. */
export function casinoTabFromRoute(route: string): string {
  const key = new URLSearchParams(route.split('?')[1] || '').get('game') || '';
  return CASINO_GAMES.some((g) => g.key === key && g.key !== 'slots') ? key : 'lobby';
}
