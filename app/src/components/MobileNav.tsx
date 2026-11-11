import React from 'react';
import { useApp } from '../lib/store';
import { Icon } from './TitleBar';

const ITEMS = [
  { key: 'home', label: 'Lobby', icon: 'home', to: '/' },
  { key: 'tournaments', label: 'Events', icon: 'trophy', to: '/tournaments' },
  { key: 'cashier', label: 'Cashier', icon: 'chip', to: '/cashier' },
  { key: 'rewards', label: 'Rewards', icon: 'ticket', to: '/rewards' },
  { key: 'me', label: 'My Page', icon: 'user', to: '/my-page' },
];

export function MobileNav() {
  const { route, navigate } = useApp();
  const [path] = route.split('?');
  if (path.startsWith('/table') || path.startsWith('/login')) return null;
  const active = path === '/' ? 'home' : path.split('/')[1] || 'home';
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {ITEMS.map((item) => (
        <button key={item.key} className={active === item.key ? 'on' : ''} onClick={() => navigate(item.to)}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
