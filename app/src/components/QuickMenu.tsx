import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { money } from '../lib/api';
import { Avatar } from './Avatar';
import { sound } from '../lib/sound';

const LINKS = [
  { icon: '🎲', label: 'Casino', to: '/casino' },
  { icon: '🎰', label: 'Slots', to: '/slots' },
  { icon: '🎯', label: 'Prop Bet', to: '/propbet' },
  { icon: '🐟', label: 'Rewards', to: '/rewards' },
  { icon: '🎁', label: 'My Promo', to: '/promotions' },
  { icon: '👤', label: 'My Page', to: '/my-page' },
  { icon: '📋', label: 'Missions', to: '/missions' },
  { icon: '🏆', label: 'Leaders', to: '/leaderboard' },
];

export function QuickMenu() {
  const { user, navigate } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('gg:quickmenu', onOpen);
    return () => window.removeEventListener('gg:quickmenu', onOpen);
  }, []);
  if (!open) return null;
  const go = (to: string) => { sound.play('click', { volume: .4 }); setOpen(false); navigate(to); };
  return (
    <div className="quick-backdrop" onClick={() => setOpen(false)}>
      <aside className="quick-menu" onClick={(e) => e.stopPropagation()} aria-label="Account menu">
        <button className="quick-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
        <div className="quick-profile">
          <div className="avatar-ring" style={{ width: 64, height: 64 }}>
            <div className="inner"><Avatar name={user?.nick || 'Guest'} src={user?.avatar} size={58} /></div>
            <span className="vip-badge">{user?.vip_level ?? 1}</span>
          </div>
          <div>
            <b>{user?.nick || 'Guest'}</b>
            <span>VIP {user?.vip_level ?? 1} · {user?.country || 'Romania'}</span>
          </div>
        </div>
        <div className="quick-balances">
          <div><small>USD</small><b>{money(user?.balance ?? 0)}</b></div>
          <div><small>P$</small><b>{(user?.play_chips ?? 0).toLocaleString()}</b></div>
          <div><small>T$</small><b>T${(user?.tickets ?? 0).toLocaleString()}</b></div>
          <div><small>XP</small><b>{((user?.xp ?? 0) / 1000).toFixed(1)}K</b></div>
        </div>
        <button className="quick-cashier" onClick={() => go('/cashier')}>Cashier</button>
        <div className="quick-grid">
          {LINKS.map((l) => (
            <button key={l.to} onClick={() => go(l.to)}><span>{l.icon}</span>{l.label}</button>
          ))}
        </div>
        <button className="quick-ggpass" onClick={() => go('/rewards')}>★ DanGG Pass</button>
      </aside>
    </div>
  );
}
