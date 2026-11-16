import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getToken } from '../../lib/api';
import { currentSeatHandRank, sessionDuration } from '../../game/handRank';
import { PlayingCard } from '../Card';

const TABS = ['Hand Rank', 'HUD', 'Stats'] as const;

export function OwnHandPanel({ tableId, me, board, game, rabbitCards, rabbitOpened, onClose, onProfile }: { tableId: string; me: any; board: string[]; game: string; rabbitCards: string[]; rabbitOpened: boolean; onClose: () => void; onProfile: () => void }) {
  const [tab, setTab] = useState<typeof TABS[number]>('Hand Rank');
  const [hud, setHud] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const panelRef = useRef<HTMLElement>(null);
  const hand = useMemo(() => currentSeatHandRank({ hole: me.cards || [], board, shortDeck: game === 'shortdeck', rabbitCards, rabbitOpened }), [me.cards, board, game, rabbitCards, rabbitOpened]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tables/${encodeURIComponent(tableId)}/hud?id=${encodeURIComponent(String(me.id))}&nick=${encodeURIComponent(me.nick)}`, { headers: { authorization: `Bearer ${getToken()}` }, signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((result) => setHud(result.hud))
      .catch((error) => { if (error.name !== 'AbortError') setFailed(true); });
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [tableId, me.id, me.nick]);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, []);
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next]);
    window.setTimeout(() => panelRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus(), 0);
  };
  const percent = (numerator: number, denominator: number) => denominator ? `${Math.round(numerator / denominator * 100)}%` : '—';
  const continuation = hud?.continuation;
  const session = hud?.session;
  return (
    <section ref={panelRef} className="own-hand-panel" role="dialog" aria-label="Current hand, HUD and session statistics" onKeyDown={keyDown}>
      <div className="own-hand-tabs" role="tablist" aria-label="Hand information">
        {TABS.map((name) => <button key={name} id={`own-hand-tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={`own-hand-${name}`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)}>{name === 'HUD' ? 'Smart HUD' : name}</button>)}
        <button className="own-hand-close" aria-label="Close hand panel" onClick={onClose}>Close</button>
      </div>
      <div className="own-hand-body" role="tabpanel" id={`own-hand-${tab}`} aria-labelledby={`own-hand-tab-${tab}`}>
        {tab === 'Hand Rank' && hand && <div className="own-hand-rank">
          <h2>{hand.label}</h2>
          {hand.drawLabel && <p className="own-hand-draw">{hand.drawLabel}</p>}
          <div className="own-hand-cards">{hand.cards.map((entry, index) => <PlayingCard key={`${entry.card}-${index}`} card={entry.card} />)}</div>
          <p className="muted small">Informational hints only; they do not change the hand outcome.</p>
        </div>}
        {tab === 'HUD' && <>
          {failed && <p role="alert">Table statistics are unavailable right now.</p>}
          {!failed && !hud && <p role="status">Loading local table statistics…</p>}
          {hud && <div className="own-hand-metrics">
            {([['Hands', hud.hands, ''], ['VPIP', hud.vpip, '%'], ['PFR', hud.pfr, '%']] as const).map(([label, value, suffix]) => <div key={label}><span>{label}</span><strong>{value}{suffix}</strong></div>)}
            {(['flop', 'turn'] as const).map((street) => <section key={street}><h3>{street === 'flop' ? 'Flop' : 'Turn'} continuation</h3><div className="own-hand-continuation">
              <div><span>CB</span><strong>{percent(continuation[`${street}CbBets`], continuation[`${street}CbOpportunities`])}</strong><small>{continuation[`${street}CbBets`]}/{continuation[`${street}CbOpportunities`]}</small></div>
              <div><span>FCB</span><strong>{percent(continuation[`${street}CbFolds`], continuation[`${street}CbResponses`])}</strong><small>{continuation[`${street}CbFolds`]}/{continuation[`${street}CbResponses`]}</small></div>
              <div><span>CCB</span><strong>{percent(continuation[`${street}CbCalls`], continuation[`${street}CbResponses`])}</strong><small>{continuation[`${street}CbCalls`]}/{continuation[`${street}CbResponses`]}</small></div>
              <div><span>RCB</span><strong>{percent(continuation[`${street}CbRaises`], continuation[`${street}CbResponses`])}</strong><small>{continuation[`${street}CbRaises`]}/{continuation[`${street}CbResponses`]}</small></div>
            </div></section>)}
          </div>}
          <p className="muted small">Recorded local table sample. Zero-sample and incomplete traces show —.</p>
        </>}
        {tab === 'Stats' && <dl className="own-hand-stats">
          <div><dt>Session time</dt><dd>{session?.known ? sessionDuration(session.sessionStartedAt, now) : '—'}</dd></div>
          <div><dt>Hands</dt><dd>{session?.known ? session.hands : '—'}</dd></div>
          <div><dt>Pots won at showdown</dt><dd>{session?.known && session.showdowns > 0 ? `${session.showdownWins} of ${session.showdowns} (${Math.round(session.showdownWins / session.showdowns * 100)}%)` : '—'}</dd></div>
          <div><dt>Pots won without showdown</dt><dd>{session?.known ? session.nonShowdownWins : '—'}</dd></div>
          <div><dt>Time bank</dt><dd>{me.timeBank != null ? `${Math.floor(me.timeBank / 60)}:${String(Math.floor(me.timeBank % 60)).padStart(2, '0')}` : '—'}</dd></div>
          <div><dt>Time bank cards</dt><dd>{me.timeBankCards ?? '—'}</dd></div>
        </dl>}
      </div>
      <button className="btn btn-ghost own-hand-profile" onClick={onProfile}>My Profile</button>
    </section>
  );
}
