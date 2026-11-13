import React, { useEffect, useState } from 'react';
import { useApp } from '../../lib/store';
import { loadWinners, type WinnerRow } from '../../lib/slotGames';
import { WinnersTicker } from '../WinnersTicker';
import { CASINO_GAMES } from './casinoGames';
import { GameBadge, type BadgeName } from './PhoneIcons';

const KIND_LABEL: Record<string, string> = { slots: 'Slots', roulette: 'Roulette', crash_win: 'Crash', blackjack: 'Blackjack' };

/** Phone Casino tab: hero, today's wins, the slots catalogue entry, then one row per game. */
export function MobileCasino() {
  const { navigate } = useApp();
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    loadWinners(10).then((feed) => { if (!cancelled) setWinners(feed.winners); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="mc">
      <div className="mc-hero">
        <img src="/assets/ui/discover/Bg_Discover_CasinoBonus_EN.png" alt="" />
        <span><small>Play-money casino</small><b>Pick a game.<br />Take a seat.</b><em>18+ · chips have no cash value</em></span>
      </div>
      <h1 className="sr-only">Casino</h1>
      <WinnersTicker winners={winners} labelFor={(w) => KIND_LABEL[w.kind] || w.memo} empty="No casino wins yet today." />
      <button type="button" className="mc-feature" onClick={() => navigate('/slots')}>
        <img src="/assets/slots/wild-jungle.svg" alt="" />
        <span>
          <small>Only on DanGG</small>
          <b>Six slots. One floor.</b>
          <em>Wilds, wheels and clover cash — all playable now.</em>
          <i>Browse slots →</i>
        </span>
      </button>
      {CASINO_GAMES.map((g) => (
        <button key={g.key} type="button" className="mc-row" onClick={() => navigate(g.route)}>
          <span className="mc-art">
            <GameBadge name={g.badge as BadgeName} size={72} />
            <i className="mc-pill">Play now</i>
          </span>
          <span className="mc-copy">
            <b>{g.name}</b>
            <small>{g.desc}</small>
            <span className="mc-tags">{g.tags.map((tag) => <i key={tag}>{tag}</i>)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
