// 3D icons for the phone Poker and Casino menu rows, cut from the ChatGPT sprite sheets (216 px WebP).

const MENU_ICON_DIR = '/assets/menu';

/** Path of the 3D menu icon for a game badge name (e.g. 'holdem', 'roulette'). */
export function menuIconSrc(name: string): string {
  return `${MENU_ICON_DIR}/${name}.webp`;
}
