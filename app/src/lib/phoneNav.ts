// Phone tab bar: the five destinations and which one a route belongs to. Free of React so Node can test it.

export type PhoneNavItem =
  | { readonly key: string; readonly label: string; readonly to: string; readonly kind: 'glyph'; readonly glyph: 'poker' | 'events' | 'casino' }
  | { readonly key: string; readonly label: string; readonly to: string; readonly kind: 'brand' | 'avatar' };

export const PHONE_NAV: readonly PhoneNavItem[] = Object.freeze([
  { key: 'poker', label: 'Poker', to: '/?play=1', kind: 'glyph', glyph: 'poker' },
  { key: 'events', label: 'Tournaments', to: '/tournaments', kind: 'glyph', glyph: 'events' },
  { key: 'home', label: 'Home', to: '/', kind: 'brand' },
  { key: 'casino', label: 'Casino', to: '/casino', kind: 'glyph', glyph: 'casino' },
  { key: 'me', label: 'My Page', to: '/my-page', kind: 'avatar' },
]);

/** Phone players land on the Poker game menu after login (as on GGPoker mobile); desktop lands on Home. */
export function landingRoute(phone: boolean): string {
  return phone ? '/?play=1' : '/';
}

const PREFIXES: readonly (readonly [string, string])[] = [
  ['/tournaments', 'events'],
  ['/propbet', 'events'],
  ['/casino', 'casino'],
  ['/slots', 'casino'],
  ['/my-page', 'me'],
  ['/profile', 'me'],
  ['/cashier', 'me'],
  ['/settings', 'me'],
  ['/hand-history', 'me'],
  ['/rewards', 'me'],
  ['/ocean', 'me'],
  ['/promotions', 'me'],
];

/** The tab a route lights up; anything unlisted counts as Home. */
export function activeNavKey(route: string): string {
  const [path] = route.split('?');
  if (/[?&]play=1\b/.test(route)) return 'poker';
  const hit = PREFIXES.find(([prefix]) => path.startsWith(prefix));
  return hit ? hit[1] : 'home';
}
