// Rush Fast Fold button state. The server decides when a quick fold is legal
// (`state.quickFold`, see PokerTable.quickFoldState); this maps it to the button.

export interface QuickFoldState {
  allowed: boolean;
  /** The free-check big blind option: folding is legal but throws away a free look. */
  canCheck: boolean;
}

export interface FastFoldSeat {
  inHand?: boolean;
  folded?: boolean;
  allIn?: boolean;
}

export type FastFoldButton =
  | { visible: false }
  | { visible: true; enabled: boolean; warnCheck: boolean; title: string };

const BETTING_STREETS = ['preflop', 'flop', 'turn', 'river'];

export const FAST_FOLD_TITLE = 'Fast Fold: fold now and move to a new table';
export const FAST_FOLD_CHECK_WARNING = 'You can check for free. Fast Fold anyway?';
export const FAST_FOLD_FREE_CHECK_TITLE = 'Checking is free here: use Check/Fold instead';

export function isRushGame(game: string | undefined): boolean {
  return !!game && game.startsWith('rush');
}

/** Visible on Rush tables whenever the hero is live in a hand, before or on their turn. */
export function fastFoldButton(
  game: string | undefined,
  street: string | undefined,
  me: FastFoldSeat | null | undefined,
  quickFold: QuickFoldState | null | undefined,
): FastFoldButton {
  if (!isRushGame(game) || !street || !BETTING_STREETS.includes(street)) return { visible: false };
  if (!me || !me.inHand || me.folded || me.allIn) return { visible: false };
  const enabled = !!quickFold?.allowed;
  return {
    visible: true,
    enabled,
    warnCheck: enabled && !!quickFold?.canCheck,
    title: enabled ? FAST_FOLD_TITLE : FAST_FOLD_FREE_CHECK_TITLE,
  };
}
