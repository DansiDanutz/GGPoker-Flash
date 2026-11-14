import React, { useEffect, useMemo, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';

const NOTES = [
  ['9 of 18 survive', 'Rush stage: play fast, finish in the top half.'],
  ['All-in shootout', 'After 10 minutes the short stacks go all-in.'],
  ['Final Table Stage', 'Mystery bounties are revealed at the final table.'],
];

/** Mystery Battle Royale lobby (reference 11): rush stages, buy-in tiles, prize pools. */
export function BattleLobby() {
  const { navigate } = useApp();
  const [events, setEvents] = useState<any[] | null>(null);
  const [feed, setFeed] = useState<{ total: number; items: any[] }>({ total: 0, items: [] });

  useEffect(() => {
    api.tournaments()
      .then((r) => setEvents((r.tournaments || []).filter((t: any) => String(t.mode).toUpperCase() === 'MYSTERY' || /mystery/i.test(t.name))))
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    api.mysteryFeed().then(setFeed).catch(() => {});
  }, []);

  const groups = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const t of events || []) {
      const k = t.buyin + (t.fee || 0);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [events]);

  const top = useMemo(() => [...(events || [])].sort((a, b) => (b.gtd || 0) - (a.gtd || 0)).slice(0, 8), [events]);
  const biggest = top[0];

  return (
    <div className="battle">
      <div className="battle-hero">
        <div className="battle-hero-bg" style={{ backgroundImage: "url('/assets/ui/discover/Bg_Discover_MysteryBattleRoyal.png')" }} />
        <div className="battle-hero-copy">
          <div className="battle-kicker">MYSTERY BATTLE ROYALE</div>
          <h2>Survive the rush. Reveal the bounty.</h2>
          <div className="battle-notes">
            {NOTES.map(([title, body]) => (
              <div key={title}><b>{title}</b><span>{body}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="battle-tiles">
        {groups.map(([buyin, list]) => {
          const upTo = Math.max(...list.map((t) => t.gtd || 0));
          const entrants = list.reduce((n, t) => n + (t.entrants || 0), 0);
          return (
            <button key={buyin} type="button" className="battle-tile" onClick={() => navigate(`/tournaments?id=${encodeURIComponent(list[0].id)}`)}>
              <span className="battle-buy">Buy-in {money(buyin)}</span>
              <span className="battle-up">up to</span>
              <b>{money(upTo, true)}</b>
              <span className="battle-players">♟ {entrants.toLocaleString()}</span>
            </button>
          );
        })}
        {events && !groups.length && <div className="list-empty">No Mystery Battle Royale events scheduled right now.</div>}
      </div>

      <div className="battle-join">
        <button type="button" className="battle-join-btn" disabled={!biggest} onClick={() => biggest && navigate(`/tournaments?id=${encodeURIComponent(biggest.id)}`)}>Join Now</button>
        <button type="button" className="battle-more" onClick={() => navigate('/tournaments')}>Mystery Battle Royale details ↗</button>
      </div>

      <aside className="battle-side">
        <div className="battle-side-head">Epic Mystery Jackpot Bounties</div>
        <div className="battle-total">{money(feed.total || 0, true)}</div>
        {!!feed.items.length && (
          <div className="battle-feed">
            {feed.items.map((it, i) => (
              <div key={i} className="battle-feed-row">
                <b>{money(it.amount, true)}</b>
                <span>{it.nick}</span>
                <small>{it.buyin != null ? `Buy-in ${money((it.buyin || 0) + (it.fee || 0))} · ` : ''}{String(it.created_at).slice(5, 16).replace('T', ' ')}</small>
              </div>
            ))}
          </div>
        )}
        <div className="battle-side-sub">Mystery prize pools</div>
        {top.map((t) => (
          <button key={t.id} type="button" className="battle-pool" onClick={() => navigate(`/tournaments?id=${encodeURIComponent(t.id)}`)}>
            <b>{money(t.gtd || 0, true)}</b>
            <span>{t.name}</span>
            <small>Buy-in {money((t.buyin || 0) + (t.fee || 0))} · {new Date(t.start_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
          </button>
        ))}
        {!top.length && <div className="battle-pool muted">No mystery events yet.</div>}
      </aside>
    </div>
  );
}
