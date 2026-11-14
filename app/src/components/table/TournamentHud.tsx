import { useEffect, useState } from 'react';
import { money } from '../../lib/api';

type T = {
  name?: string; prizePool?: number; level?: number; mode?: string; bounty?: number;
  playersLeft?: number | null; tables?: number; nextBlindAt?: number | null;
};

/** Tournament HUD on the felt: level, blinds, next level, field and prize pool (reference 04). */
export function TournamentHud({ tournament, sb, bb, ante }: { tournament: T; sb: number; bb: number; ante: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = tournament.nextBlindAt ? Math.max(0, Math.ceil((tournament.nextBlindAt - now) / 1000)) : null;
  const mm = left != null ? Math.floor(left / 60) : 0;
  const ss = left != null ? left % 60 : 0;

  return (
    <div className="tt-hud" role="status" aria-label="Tournament status">
      <div className="tt-hud-top">
        <span className="tt-hud-mode">{String(tournament.mode || 'NLH').replace(/_/g, ' ')}</span>
        <b>{tournament.name || 'Tournament'}</b>
      </div>
      <div className="tt-hud-grid">
        <div><span>Level</span><b>{tournament.level ?? 1}</b></div>
        <div><span>Blinds</span><b>{money(sb)}/{money(bb)}{ante ? ` (${money(ante)})` : ''}</b></div>
        <div><span>Next level</span><b>{left != null ? `${mm}:${String(ss).padStart(2, '0')}` : '—'}</b></div>
        <div><span>Players left</span><b>{tournament.playersLeft != null ? tournament.playersLeft.toLocaleString() : '—'}</b></div>
        <div><span>Prize pool</span><b className="gold">{money(tournament.prizePool || 0)}</b></div>
        {(tournament.bounty || 0) > 0 && <div><span>Bounty</span><b className="gold">{money(tournament.bounty || 0)}</b></div>}
      </div>
    </div>
  );
}
