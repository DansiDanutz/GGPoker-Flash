// 3D emblems (art 5 and 10) for the menus; every label next to them is live text.

const EMBLEMS = '/assets/ui/emblems';
const emblem = (name: string): string => `${EMBLEMS}/emblem-${name}.webp`;

/** Desktop game-mode row, in display order. */
export const GAME_TAB_EMBLEM = Object.freeze({
  home: emblem('home'),
  aof: emblem('target'),
  rush: emblem('bolt'),
  holdem: emblem('holdem'),
  plo: emblem('cards'),
  short: emblem('short'),
  spin: emblem('wheel'),
  battle: emblem('battle'),
}) as Readonly<Record<string, string>>;

/** Phone shortcut tiles and tab bar. */
export const PHONE_MENU_EMBLEM = Object.freeze({
  poker: emblem('chip'),
  events: emblem('trophy'),
  casino: emblem('roulette'),
  rewards: emblem('gift'),
});
