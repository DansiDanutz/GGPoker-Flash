import React from 'react';
import { useApp } from '../lib/store';
import { money, User } from '../lib/api';
import { sound } from '../lib/sound';
import { Avatar } from './Avatar';
import { WaitlistChip } from './WaitlistChip';

export function AppHeader({ online, jackpot, user, activeTop = 'poker' }: { online: number; jackpot: number; user: User | null; activeTop?: string }) {
  const { navigate, brand } = useApp();
  const go = (to: string) => { sound.play('click', { volume: .5 }); navigate(to); };
  const tab = (key: string, label: string, to: string) => (
    <button className={activeTop === key ? 'active' : ''} onClick={() => go(to)}>{label}</button>
  );
  return (
    <div className="app-header">
      <img className="brand-logo" src={brand.logo} alt="DanGG" onClick={() => go('/')} />
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
      {user && <WaitlistChip />}
      <div className="account-block" onClick={() => { sound.play('click', { volume: .4 }); window.dispatchEvent(new Event('gg:quickmenu')); }} title="Account">
        <div className="avatar-ring">
          <div className="inner">
            <Avatar name={user?.nick || 'Guest'} src={user?.avatar} size={54} />
          </div>
          <span className="vip-badge">{user?.vip_level ?? 1}</span>
        </div>
        <div className="account-name">{user?.nick || 'Guest'}</div>
      </div>
    </div>
  );
}

type GameTab = { key: string; label: string; img: string; w: number; activeImg?: string };

// Home uses Dan's own plates: dark when idle, red when selected (no generated label plate).
const TABS: readonly GameTab[] = [
  { key: 'home', label: 'Home', img: 'tab_home', w: 172, activeImg: 'tab_home_active' },
  { key: 'aof', label: 'All-in or Fold', img: 'tab_aof', w: 135 },
  { key: 'rush', label: 'Fast Fold', img: 'tab_rush', w: 134 },
  { key: 'holdem', label: "Hold'em", img: 'tab_holdem', w: 135 },
  { key: 'plo', label: 'PLO', img: 'tab_plo', w: 135 },
  { key: 'short', label: 'Short Deck', img: 'tab_short', w: 135 },
  { key: 'spin', label: 'Jackpot SNG', img: 'tab_spin', w: 134 },
  { key: 'battle', label: 'Battle Royale', img: 'tab_battle', w: 135 },
];

export function GameTabs({ active, onChange }: { active: string; onChange: (key: string) => void }) {
  return (
    <div className="game-tabs">
      {TABS.map((t) => {
        const isActive = active === t.key;
        const img = isActive && t.activeImg ? t.activeImg : t.img;
        const showPlate = isActive && !t.activeImg && t.key !== 'holdem';
        return (
          <button
            key={t.key}
            className={'game-tab' + (isActive ? ' active' : '') + (t.activeImg ? ' plate-tab' : '')}
            style={{ width: t.w }}
            onClick={() => { sound.play('click', { volume: .5 }); onChange(t.key); }}
            title={t.label}
          >
            <img src={`/assets/chrome/${img}.png?v=7`} alt={t.label} style={{ opacity: showPlate ? .0001 : 1 }} />
            {showPlate && <span className="active-plate">{t.label}</span>}
          </button>
        );
      })}
      <div className="spacer" />
    </div>
  );
}
