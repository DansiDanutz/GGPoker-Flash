import React from 'react';
import { money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';

/**
 * The 112px account rail from the reference client. It is global on desktop:
 * Lobby renders it beside the table list, PageShell renders it for every other
 * screen, so wallet, Cashier and the product shortcuts never disappear.
 */
export function AccountRail() {
  const { user, navigate } = useApp();
  return (
    <div className="lobby-rail" aria-label="Account">
      <div className="rail-wallet">
        <div className="currency-row"><span>USD</span><b>{money(user?.balance ?? 0)}</b></div>
        <div className="currency-row"><span>P$</span><b>P${(user?.play_chips ?? 0).toLocaleString()}</b></div>
        <div className="currency-row"><span>T$</span><b>T${(user?.tickets ?? 0).toLocaleString()}</b></div>
        <div className="currency-row coin"><span>XP</span><b>{((user?.xp ?? 0) / 1000).toFixed(1)}K</b></div>
      </div>
      <button className="cashier-btn" onClick={() => { sound.play('coin'); navigate('/cashier'); }}><span>Cashier</span></button>
      {!user && (
        <button className="cashier-btn" style={{ marginTop: 6 }} onClick={() => navigate('/login')}><span>Log in / Sign up</span></button>
      )}
      <div className="rail-sep" />
      <button className="rail-btn tone-red" onClick={() => navigate('/propbet')}><span className="ico">🎯</span>Prop Bet</button>
      <button className="rail-btn tone-blue" onClick={() => navigate('/rewards')}><span className="ico">🐟</span>Rewards</button>
      <button className="rail-btn tone-pink" onClick={() => navigate('/promotions')}><span className="ico">🎁</span>My Promo</button>
      <div className="rail-sep" />
      <button className="rail-btn tone-teal" onClick={() => navigate('/my-page')}><span className="ico">👤</span>My Page</button>
      <button className="rail-btn tone-green" onClick={() => navigate('/missions')}><span className="ico">📋</span>Missions</button>
      <button className="rail-btn tone-gold" onClick={() => navigate('/leaderboard')}><span className="ico">🏆</span>Leaders</button>
      <div style={{ flex: 1 }} />
      <button className="rail-btn gold tone-gold" onClick={() => navigate('/rewards')}><span className="ico">⭐</span>DanGG Pass</button>
    </div>
  );
}
