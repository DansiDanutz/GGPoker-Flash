import React from 'react';
import { money } from '../lib/api';
import type { WinnerRow } from '../lib/slotGames';

/** Marquee of today's biggest wins. Pure presentation; data comes from the caller. */
export function WinnersTicker({ winners, labelFor, empty = 'No wins yet today — the first one is yours.' }: {
  winners: readonly WinnerRow[];
  labelFor?: (w: WinnerRow) => string;
  empty?: string;
}) {
  if (!winners.length) return <div className="slots-ticker slots-ticker-empty">{empty}</div>;
  const row = (key: string) => (
    <div className="slots-ticker-row" key={key} aria-hidden={key === 'b'}>
      {winners.map((w, i) => (
        <span className="slots-ticker-item" key={`${key}-${i}`}>
          <i aria-hidden="true">🏆</i>
          <b>{w.nick}</b>
          <em>{labelFor ? labelFor(w) : w.memo}</em>
          <strong>{money(w.amount)}</strong>
        </span>
      ))}
    </div>
  );
  return (
    <div className="slots-ticker" role="marquee" aria-label="Today's biggest wins">
      <span className="slots-ticker-label">BIGGEST WINS</span>
      <div className="slots-ticker-track">{row('a')}{row('b')}</div>
    </div>
  );
}
