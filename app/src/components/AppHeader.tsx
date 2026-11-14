import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { money, User } from '../lib/api';
import { sound } from '../lib/sound';
import { Avatar } from './Avatar';
import { WaitlistChip } from './WaitlistChip';


/** Counts a jackpot up on first paint and eases to new values; static under reduced motion. */
function useCountUp(target: number, ms = 1300) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = target; setValue(target); return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      // A frame timestamp can predate start; clamp so the count never dips below its origin.
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(a + (target - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function AppHeader({ online, jackpot, user, activeTop = 'poker' }: { online: number; jackpot: number; user: User | null; activeTop?: string }) {
  const { navigate, brand } = useApp();
  const jackpotShown = useCountUp(jackpot);
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
        <div className="jackpot-amount">{money(Math.round(jackpotShown))}</div>
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

type GameTab = { key: string; label: string; img: string };

/** Tab plate width in px; Dan's plates are 330x100 (2x), fitted inside the tab. */
const TAB_WIDTH = 156;

// Every game tab is Dan's own plate: dark when idle, `${img}_active` (red) when selected.
// The red plate crossfades in on click and back out when another tab is chosen (vivid.css).
const TABS: readonly GameTab[] = [
  { key: 'home', label: 'Home', img: 'tab_home' },
  { key: 'aof', label: 'All-in or Fold', img: 'tab_aof' },
  { key: 'rush', label: 'Fast Fold', img: 'tab_rush' },
  { key: 'holdem', label: "Hold'em", img: 'tab_holdem' },
  { key: 'plo', label: 'PLO', img: 'tab_plo' },
  { key: 'short', label: 'Short Deck', img: 'tab_short' },
  { key: 'spin', label: 'Jackpot SNG', img: 'tab_spin' },
  { key: 'battle', label: 'Battle Royale', img: 'tab_battle' },
];

export function GameTabs({ active, onChange }: { active: string; onChange: (key: string) => void }) {
  return (
    <div className="game-tabs">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={'game-tab plate-tab' + (active === t.key ? ' active' : '')}
          onClick={() => { sound.play('click', { volume: .5 }); onChange(t.key); }}
          title={t.label}
        >
          <img src={`/assets/chrome/${t.img}.png?v=9`} alt={t.label} />
          <img className="plate-on" src={`/assets/chrome/${t.img}_active.png?v=9`} alt="" aria-hidden="true" />
        </button>
      ))}
      <div className="spacer" />
    </div>
  );
}
