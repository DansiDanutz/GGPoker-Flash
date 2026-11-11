import React from 'react';
import { useApp } from '../lib/store';
import { money, User } from '../lib/api';
import { sound } from '../lib/sound';

export function AppHeader({ online, jackpot, user, activeTop = 'poker' }: { online: number; jackpot: number; user: User | null; activeTop?: string }) {
  const { navigate } = useApp();
  const go = (to: string) => { sound.play('click', { volume: .5 }); navigate(to); };
  const tab = (key: string, label: string, to: string) => (
    <button className={activeTop === key ? 'active' : ''} onClick={() => go(to)}>{label}</button>
  );
  return (
    <div className="app-header">
      <img className="brand-logo" src="/assets/chrome/logo.png" alt="GGPoker" onClick={() => go('/')} />
      <nav className="topnav">
        {tab('poker', 'Poker', '/')}
        <span className="sep" />
        {tab('tournaments', 'Tournaments', '/tournaments')}
        <span className="sep" />
        {tab('slots', 'Slots', '/slots')}
        <span className="sep" />
        {tab('casino', 'Casino', '/casino')}
      </nav>
      <div className="jackpot-banner" onClick={() => go('/tournaments')} title="Bad Beat Jackpot">
        <div className="jackpot-label"><b>BAD BEAT</b><span>JACKPOT</span></div>
        <div className="jackpot-amount">{money(jackpot).replace('$', '$')}</div>
      </div>
      <div className="account-block" onClick={() => go('/my-page')}>
        <div className="avatar-ring">
          <div className="inner">
            {user?.avatar ? <img src={user.avatar} alt="" /> : <div className="avatar-fallback">{(user?.nick || 'G')[0].toUpperCase()}</div>}
          </div>
          <span className="vip-badge">{user?.vip_level ?? 1}</span>
        </div>
        <div className="account-name">{user?.nick || 'Guest'}</div>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'home', label: 'Home', img: 'tab_home', w: 130 },
  { key: 'aof', label: 'All-in or Fold', img: 'tab_aof', w: 146 },
  { key: 'rush', label: 'Rush & Cash', img: 'tab_rush', w: 145 },
  { key: 'holdem', label: "Hold'em", img: 'tab_holdem', w: 154 },
  { key: 'plo', label: 'PLO', img: 'tab_plo', w: 156 },
  { key: 'short', label: 'Short Deck', img: 'tab_short', w: 165 },
  { key: 'spin', label: 'Spin & Gold', img: 'tab_spin', w: 135 },
  { key: 'battle', label: 'Mystery Battle Royale', img: 'tab_battle', w: 59 },
];

export function GameTabs({ active, onChange }: { active: string; onChange: (key: string) => void }) {
  return (
    <div className="game-tabs">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={'game-tab' + (active === t.key ? ' active' : '')}
          style={{ width: t.w }}
          onClick={() => { sound.play('click', { volume: .5 }); onChange(t.key); }}
          title={t.label}
        >
          <img src={`/assets/chrome/${t.img}.png`} alt={t.label} style={{ opacity: active === t.key && t.key !== 'holdem' ? .0001 : 1 }} />
          {active === t.key && t.key !== 'holdem' && <span className="active-plate">{t.label}</span>}
        </button>
      ))}
      <div className="spacer" />
    </div>
  );
}
