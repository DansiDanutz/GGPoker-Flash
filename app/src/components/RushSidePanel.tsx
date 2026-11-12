import React from 'react';
import type { RushLeaderRow } from '../lib/api';
import { CASHDROP_DEFAULT_AMOUNT_BB, CASHDROP_RULE_LABEL, CashDropConfig, cashDropRateLabel } from '../lib/cashDrop';
import { leaderboardRows } from '../lib/rushPools';

type Props = {
  leaderboard: readonly RushLeaderRow[] | undefined;
  myId: number | null | undefined;
  /** Opens {@link RushInfoDialog}; the Lobby renders it at page level like its other modals. */
  onShowInfo: () => void;
};

/**
 * Rush tab right panel (P0 slice R3): today's Rush leaderboard (Cash Drops + Rush pot wins,
 * play money) and the "Rush & Cash Information" dialog.
 */
export function RushSidePanel({ leaderboard, myId, onShowInfo }: Props) {
  const rows = leaderboardRows(leaderboard, myId);
  return (
    <section className="rush-board" aria-labelledby="rush-board-title">
      <div className="rush-board-head">
        <h4 id="rush-board-title">Rush Leaderboard</h4>
        <span className="muted small">Today · play money</span>
      </div>
      <table className="rush-board-table">
        <thead><tr><th scope="col">Flag</th><th scope="col">Player</th><th scope="col">Chips won</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.isMe ? 'me' : undefined}>
              <td><span className="rush-rank">{r.rank}</span><span aria-hidden="true">{r.flag}</span></td>
              <td className="rush-nick">{r.nick}</td>
              <td className="gold">{r.chips}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="muted small rush-board-empty">No Rush winners yet today.</div>}
      <button type="button" className="lob-link rush-info-link" onClick={onShowInfo}>Rush &amp; Cash Information</button>
    </section>
  );
}

/** Rush & Cash Information: quick fold, a new table each hand, and the DanGG Cash Drop rule. */
export function RushInfoDialog({ cashDrop, onClose }: { cashDrop: CashDropConfig | undefined; onClose: () => void }) {
  const amountBb = cashDrop?.amountBb ?? CASHDROP_DEFAULT_AMOUNT_BB;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rush-info-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id="rush-info-title">Rush &amp; Cash Information</h3>
          <button type="button" className="title-icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body rush-info">
          <h4>Quick Fold</h4>
          <p>Folding in a Rush hand marks you to move on. When that hand ends, you leave the table with your stack.</p>
          <h4>A new table every hand</h4>
          <p>Each pool is a set of tables at one game and stake. After a fold, your next hand is dealt at another table in the same pool, against new opponents. If no seat is free, you wait in the pool queue until one opens.</p>
          <h4>Cash Drop · {cashDrop?.rule || CASHDROP_RULE_LABEL}</h4>
          <p>
            After a Rush hand, there is a {cashDropRateLabel(cashDrop?.rate)} chance that a Cash Drop of {amountBb} big blinds
            goes to one random real (non-bot) player in that hand. It is a flat amount at that stake, not a share of the pot.
            This is a DanGG rule; it is not taken from GGPoker.
          </p>
        </div>
        <div className="modal-foot"><button type="button" className="btn btn-dark" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
