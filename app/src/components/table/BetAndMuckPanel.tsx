import React from 'react';

export function BetAndMuckPanel({ eligible, flag, selected, onToggle }: {
  eligible: boolean;
  flag: { status: string; action: string; amount: number } | null;
  selected: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <div className="bet-muck-panel" role="group" aria-label="Bet-and-Muck" data-selected={selected}>
      {eligible && <label className="bet-muck-toggle"><input type="checkbox" checked={selected} onChange={(event) => onToggle(event.target.checked)} /><span>Bet & Muck</span></label>}
      {flag?.status === 'awaiting-response' && <p role="status">Flagged {flag.action}. A call folds the bettor; a raise returns to ordinary play. Cards stay closed.</p>}
    </div>
  );
}
