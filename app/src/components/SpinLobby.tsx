import React, { useEffect, useMemo, useState } from 'react';
import { money, type LobbyTable } from '../lib/api';
import { cashChips } from '../lib/organizer-chips-api';

type Info = { buyIn: number; seats: number; payouts: { multiplier: number; prizePool: number; oneIn?: number }[] };

/** Jackpot SNG buy-in grid (reference 10): stone tiles per stake + top prize. */
export function SpinLobby({ tables, onJoin }: { tables: readonly LobbyTable[]; onJoin: (t: LobbyTable) => void }) {
  const [infos, setInfos] = useState<Record<number, Info>>({});
  const [picked, setPicked] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, LobbyTable[]>();
    for (const t of tables.filter((x) => x.game === 'spingold')) {
      const k = t.chip_economy ? `paid:${t.id}` : `play:${t.min_buyin}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()].sort((a, b) => a[1][0].min_buyin - b[1][0].min_buyin);
  }, [tables]);

  useEffect(() => {
    let cancelled = false;
    for (const [, list] of groups) {
      const buyin = list[0].min_buyin;
      if (list[0].chip_economy) continue;
      fetch(`/api/spin/info?buyin=${buyin}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => { if (!cancelled && d?.info) setInfos((prev) => ({ ...prev, [buyin]: d.info })); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [groups]);

  useEffect(() => { if (picked == null && groups[0]) setPicked(groups[0][0]); }, [groups, picked]);

  const selected = groups.find(([b]) => b === picked)?.[1] || [];
  const top = (buyin: number) => {
    const info = infos[buyin];
    const mult = info?.payouts?.[0]?.multiplier ?? 100;
    return buyin * mult;
  };
  const players = (list: LobbyTable[]) => list.reduce((n, t) => n + (t.players || 0), 0);
  const prize = (cents: number) => { const n = cents / 100; return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`; };

  return (
    <div className="spin-lobby">
      <div className="spin-head">
        <div>
          <div className="spin-kicker">SPIN &amp; GOLD</div>
          <h2>Three-handed Spin &amp; Go.</h2>
          <p>Play Money tables use the prize wheel; Cash Chip tables pay the fixed pooled prize shown.</p>
        </div>
        <div className="spin-head-total"><small>Tables open</small><b>{groups.reduce((n, [, l]) => n + l.length, 0)}</b></div>
      </div>

      <div className="spin-grid" role="list">
        {groups.map(([key, list]) => {
          const buyin = list[0].min_buyin, paid = Boolean(list[0].chip_economy);
          const mult = infos[buyin]?.payouts?.[0]?.multiplier ?? 100;
          const rakePercent = list[0].rakePercent ?? 5;
          const seats = list[0]?.seats || 3;
          return (
            <button
              key={key}
              type="button"
              role="listitem"
              className={'spin-tile' + (picked === key ? ' on' : '')}
              aria-pressed={picked === key}
              onClick={() => setPicked(key)}
              onDoubleClick={() => list[0] && onJoin(list[0])}
            >
              <span className="spin-stone">
                {paid && <span className="spin-seats">{list[0].name}</span>}
                <span className="spin-seats">{seats}-Max</span>
                <span className="spin-buy">Buy-in {paid ? cashChips(buyin) : money(buyin)}</span>
                <span className="spin-win">{paid ? 'Winner takes' : 'Win up to'}</span>
                <span className="spin-prize">{paid ? cashChips(buyin * 3 * (100 - rakePercent) / 100) : prize(top(buyin))}</span>
                <span className="spin-players">♟ {players(list)}</span>
              </span>
              <span className="spin-mult">{paid ? `${rakePercent}% rake` : `×${mult.toLocaleString()}`}</span>
            </button>
          );
        })}
        {!groups.length && <div className="list-empty">No Spin &amp; Go stakes are open right now.</div>}
      </div>

      {picked != null && selected[0] && !selected[0].chip_economy && infos[selected[0].min_buyin] && (
        <div className="spin-ladder" aria-label="Prize wheel">
          <div className="spin-ladder-head"><b>Prize wheel</b><span>×2 up to ×{infos[selected[0].min_buyin].payouts[0]?.multiplier.toLocaleString()}</span></div>
          <div className="spin-ladder-row">
            {infos[selected[0].min_buyin].payouts.slice(0, 8).map((p) => (
              <div key={p.multiplier} className={'spin-rung' + (p.multiplier >= 10 ? ' big' : '')}>
                <b>×{p.multiplier.toLocaleString()}</b>
                <span>{prize(p.prizePool)}</span>
                <small>{p.oneIn ? `1 in ${p.oneIn.toLocaleString()}` : ''}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="spin-controls">
        <div className="spin-controls-info">
          <small>Number of games</small>
          <b>1</b>
          <small>Selected {selected.length ? selected[0].chip_economy ? cashChips(selected[0].min_buyin) : money(selected[0].min_buyin) : '—'} · {players(selected)} players</small>
        </div>
        <button type="button" className="spin-play" disabled={!selected.length} onClick={() => selected[0] && onJoin(selected[0])}>Play Now</button>
      </div>
    </div>
  );
}
