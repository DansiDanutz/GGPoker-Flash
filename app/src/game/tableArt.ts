/** Wordless table artwork (public/assets/table/ui); every label on top of it is live text. */
const UI = '/assets/table/ui';

export const ART = {
  badge: {
    sitout: `${UI}/badge-sitout.webp`,
    offline: `${UI}/badge-offline.webp`,
    allin: `${UI}/badge-allin.webp`,
    winner: `${UI}/badge-winner.webp`,
  },
  icon: {
    straddle: `${UI}/ic-straddle.webp`,
    sitoutHand: `${UI}/ic-sitout-hand.webp`,
    sitoutBB: `${UI}/ic-sitout-bb.webp`,
    addChips: `${UI}/ic-addchips.webp`,
    history: `${UI}/ic-history.webp`,
    gear: `${UI}/ic-gear.webp`,
  },
} as const;

type SeatLike = { sittingOut?: boolean; disconnected?: boolean; allIn?: boolean; inHand?: boolean; folded?: boolean; winAmount?: number };

/** One badge over the avatar: winner, then offline, then all-in, then sitting out. */
export function seatStatusArt(p: SeatLike): string | null {
  if ((p.winAmount || 0) > 0) return ART.badge.winner;
  if (p.disconnected) return ART.badge.offline;
  if (p.allIn && p.inHand && !p.folded) return ART.badge.allin;
  if (p.sittingOut) return ART.badge.sitout;
  return null;
}

export type DockKey = keyof typeof ART.icon;
export type DockItem = { key: DockKey; label: string; icon: string };

const DOCK: Record<Exclude<DockKey, 'gear'>, string> = {
  straddle: 'Auto-straddle',
  sitoutHand: 'Sit out next hand',
  sitoutBB: 'Sit out next big blind',
  addChips: 'Add chips',
  history: 'Hand history',
};

/** Quick controls beside the table (reference: GG sit-out bar). */
export function dockItems({ seated, cash, straddleAllowed }: { seated: boolean; cash: boolean; straddleAllowed: boolean }): DockItem[] {
  if (!seated) return [];
  const keys: Exclude<DockKey, 'gear'>[] = [
    ...(straddleAllowed ? ['straddle' as const] : []),
    'sitoutHand',
    ...(cash ? ['sitoutBB' as const, 'addChips' as const] : []),
  ];
  return keys.map((key) => ({ key, label: DOCK[key], icon: ART.icon[key] }));
}
