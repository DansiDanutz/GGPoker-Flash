import { useEffect, useState } from 'react';
import { getToken } from '../lib/api';
import { PlayingCard } from './Card';

type HudHand = { handNo: number; pot: number; won: number; board: string[]; cards: string[] | null };
type Hud = { hands: number; vpip: number; pfr: number; wins: number; recent: HudHand[] };

type Props = { tableId: string; nick: string; formatChips: (n: number) => string };

/** Room-scoped opponent stats and recent hands at this table (public information only). */
export function OpponentHud({ tableId, nick, formatChips }: Props) {
  const [hud, setHud] = useState<Hud | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setHud(null); setFailed(false);
    fetch(`/api/tables/${encodeURIComponent(tableId)}/hud?nick=${encodeURIComponent(nick)}`, {
      headers: { authorization: `Bearer ${getToken()}` }, signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setHud(d.hud))
      .catch((e) => { if (e?.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [tableId, nick]);

  if (failed) return <div className="opp-hud muted small">Table stats are unavailable right now.</div>;
  if (!hud) return <div className="opp-hud muted small">Loading table stats…</div>;
  if (!hud.hands) return <div className="opp-hud muted small">No hands with this player at this table yet.</div>;
  return (
    <div className="opp-hud">
      <div className="player-stats-row" title={`Last ${hud.hands} hands at this table`}>
        <span><b>{hud.hands}</b> hands here</span>
        <span><b>{hud.vpip}%</b> VPIP</span>
        <span><b>{hud.pfr}%</b> PFR</span>
        <span><b>{hud.wins}</b> won</span>
      </div>
      <ul className="opp-hud-recent">
        {hud.recent.map((h) => (
          <li key={h.handNo}>
            <span className="muted">#{h.handNo}</span>
            <span className="opp-hud-cards">
              {h.cards ? h.cards.map((c) => <PlayingCard key={c} card={c} size="mini" />) : <span className="muted">mucked</span>}
            </span>
            <span className={h.won > 0 ? 'won' : 'muted'}>{h.won > 0 ? `+${formatChips(h.won)}` : `pot ${formatChips(h.pot)}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
