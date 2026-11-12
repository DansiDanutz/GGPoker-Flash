import { useEffect, useState } from 'react';
import { FAST_FOLD_CHECK_WARNING, fastFoldButton, type FastFoldSeat, type QuickFoldState } from '../../game/fastFold';

interface FastFoldButtonProps {
  game: string | undefined;
  street: string | undefined;
  handNo: number | undefined;
  me: FastFoldSeat | null;
  quickFold: QuickFoldState | null | undefined;
  onFastFold: () => void;
}

/**
 * Rush "Fast Fold": fold before your turn and go straight to a new table. When the hero
 * could check for free (the unopened big blind) the first press asks for confirmation.
 */
export default function FastFoldButton({ game, street, handNo, me, quickFold, onFastFold }: FastFoldButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => { setConfirming(false); setSent(false); }, [handNo, street]);

  const button = fastFoldButton(game, street, me, quickFold);
  if (!button.visible) return null;

  const fold = () => {
    if (sent) return;
    if (button.warnCheck && !confirming) { setConfirming(true); return; }
    setSent(true);
    onFastFold();
  };

  return (
    <div className="fast-fold-row" role="group" aria-label="Fast Fold">
      {confirming && <span className="fast-fold-warning" role="alert">{FAST_FOLD_CHECK_WARNING}</span>}
      <button
        type="button"
        className={'act-btn act-fold fast-fold-btn' + (confirming ? ' confirming' : '')}
        disabled={!button.enabled || sent}
        title={button.title}
        aria-label={button.title}
        onClick={fold}
      >
        {sent ? 'Moving…' : confirming ? 'Fast Fold anyway' : 'Fast Fold'}
      </button>
      {confirming && (
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>Keep my hand</button>
      )}
    </div>
  );
}
