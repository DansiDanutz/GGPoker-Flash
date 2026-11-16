import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { money, User } from '../lib/api';
import { sound } from '../lib/sound';
import { Avatar } from './Avatar';
import { WaitlistChip } from './WaitlistChip';
import { GAME_TAB_EMBLEM } from '../lib/menuArt';


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

type GameTab = { key: string; label: string };

// Each game mode is a 3D emblem beside a live text label; the selected one glows red (game-tabs.css).
const TABS: readonly GameTab[] = [
  { key: 'home', label: 'Home' },
  { key: 'aof', label: 'All-in or Fold' },
  { key: 'rush', label: 'Fast Fold' },
  { key: 'holdem', label: "Hold'em" },
  { key: 'plo', label: 'PLO' },
  { key: 'short', label: 'Short Deck' },
  { key: 'spin', label: 'Jackpot SNG' },
  { key: 'battle', label: 'Battle Royale' },
];

export function GameTabs({ active, onChange }: { active: string; onChange: (key: string) => void }) {
  return (
    <div className="game-tabs">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={'mode-tab' + (active === t.key ? ' active' : '')}
          aria-pressed={active === t.key}
          onClick={() => { sound.play('click', { volume: .5 }); onChange(t.key); }}
        >
          <img className="mode-tab-emblem" src={GAME_TAB_EMBLEM[t.key]} alt="" />
          <span className="mode-tab-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}
