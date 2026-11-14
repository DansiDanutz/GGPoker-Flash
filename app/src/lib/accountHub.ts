// Phone My Page hub: its entries and the VIP progress bar. Free of React so Node can test it.

/** Where a hub entry goes: a My Page pane (`tab`) or another page (`route`). */
export type HubTarget = { readonly tab: string } | { readonly route: string };

export type HubIconName =
  | 'messages' | 'settings' | 'history' | 'propbet' | 'friends' | 'help'
  | 'profile' | 'wallet' | 'receipt' | 'verify' | 'notes' | 'shield' | 'missions';

type Entry = { readonly key: string; readonly label: string; readonly target: HubTarget };
export type QuickTile = Entry & { readonly icon: HubIconName };
export type PromoRow = Entry & { readonly sub: string; readonly art: string };
export type AccountRow = Entry & { readonly icon: HubIconName };

/** The icon row under the wallet (reference: Messages, Settings, PokerCraft, Prop Bet, Help, Network). */
export const QUICK_TILES: readonly QuickTile[] = Object.freeze([
  { key: 'messages', label: 'Messages', icon: 'messages', target: { tab: 'messages' } },
  { key: 'settings', label: 'Settings', icon: 'settings', target: { route: '/settings' } },
  { key: 'history', label: 'Hand History', icon: 'history', target: { route: '/hand-history' } },
  { key: 'propbet', label: 'Prop Bet', icon: 'propbet', target: { route: '/propbet' } },
  { key: 'friends', label: 'Friends', icon: 'friends', target: { tab: 'friends' } },
  { key: 'help', label: 'Help', icon: 'help', target: { route: '/support' } },
]);

export const PROMO_ROWS: readonly PromoRow[] = Object.freeze([
  { key: 'missions', label: 'Weekly Missions', sub: 'Claim chips for hands you play', art: '/assets/ui/creatives/foryou-freebie.png', target: { tab: 'missions' } },
  { key: 'rewards', label: 'Daily Rewards', sub: 'Streaks, chests and the prize wheel', art: '/assets/ui/creatives/foryou-recent.png', target: { route: '/rewards' } },
  { key: 'ocean', label: 'Ocean Rewards', sub: 'Level up for bigger hauls', art: '/assets/ui/creatives/foryou-ocean.png', target: { route: '/ocean' } },
  { key: 'promotions', label: 'All promotions', sub: 'Coupons and running offers', art: '/assets/ui/creatives/foryou-live-series.png', target: { route: '/promotions' } },
]);

export const ACCOUNT_ROWS: readonly AccountRow[] = Object.freeze([
  { key: 'overview', label: 'My Game Profile', icon: 'profile', target: { tab: 'overview' } },
  { key: 'wallet', label: 'My Wallet', icon: 'wallet', target: { tab: 'wallet' } },
  { key: 'transactions', label: 'Transaction History', icon: 'receipt', target: { tab: 'transactions' } },
  { key: 'missions', label: 'Weekly Mission', icon: 'missions', target: { tab: 'missions' } },
  { key: 'notes', label: 'Player Notes', icon: 'notes', target: { tab: 'notes' } },
  { key: 'verify', label: 'Verify ID', icon: 'verify', target: { tab: 'verify' } },
  { key: 'security', label: 'Security & Responsible Gaming', icon: 'shield', target: { tab: 'security' } },
]);

/** VIP progress inside the current level; same curve as the desktop My Page (level² × 1200 XP). */
export function vipProgress(xp: number, vipLevel: number): { level: number; pct: number } {
  const level = Math.max(1, Math.floor(Number(vipLevel) || 1));
  const span = level * level * 1200;
  const into = Math.max(0, Number(xp) || 0) % span;
  return { level, pct: Math.min(100, Math.round((into / span) * 100)) };
}
