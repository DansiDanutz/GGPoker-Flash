import React from 'react';
import { useApp } from '../../lib/store';
import { CASINO_GAMES } from './casinoGames';
import { GameBadge, type BadgeName } from './PhoneIcons';

/** Phone Casino tab: a hero, then one row per game with its badge, a Play pill, the blurb and tags. */
export function MobileCasino() {
  const { navigate } = useApp();
  return (
    <div className="mc">
      <div className="mc-hero">
        <img src="/assets/ui/discover/Bg_Discover_CasinoBonus_EN.png" alt="" />
        <span><small>Play-money casino</small><b>Pick a game.<br />Take a seat.</b><em>18+ · chips have no cash value</em></span>
      </div>
      <h1 className="sr-only">Casino</h1>
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
