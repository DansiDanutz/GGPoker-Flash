import React from 'react';
import { useApp } from '../lib/store';
import { Icon } from './TitleBar';

const ITEMS = [
  { key: 'home', label: 'Home', icon: 'home', to: '/' },
  { key: 'tournaments', label: 'Events', icon: 'trophy', to: '/tournaments' },
  { key: 'play', label: 'PLAY', icon: 'chip', to: '/?play=1', center: true },
  { key: 'casino', label: 'Casino', icon: 'dice', to: '/casino' },
  { key: 'me', label: 'My Page', icon: 'user', to: '/my-page' },
];

export function MobileNav() {
  const { route, navigate } = useApp();
  const [path] = route.split('?');
  if (path.startsWith('/table') || path.startsWith('/login')) return null;
  const active = route.includes('play=1') ? 'play' : path === '/' ? 'home' : path.split('/')[1] || 'home';
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {ITEMS.map((item) => (
        <button key={item.key} className={'mobile-nav-item' + (item.center ? ' center' : '') + (active === item.key ? ' on' : '')} onClick={() => navigate(item.to)}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
