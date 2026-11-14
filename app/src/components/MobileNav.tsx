import React from 'react';
import { useApp } from '../lib/store';
import { Avatar } from './Avatar';
import { NavGlyph } from './mobile/PhoneIcons';

type Glyph = 'home' | 'casino' | 'tables' | 'rewards';
type NavItem = { key: string; label: string; to: string; glyph?: Glyph; avatar?: boolean };

// The phone's primary navigation: five labelled destinations, thumb-height targets.
const ITEMS: readonly NavItem[] = [
  { key: 'home', label: 'Home', to: '/', glyph: 'home' },
  { key: 'casino', label: 'Casino', to: '/casino', glyph: 'casino' },
  { key: 'tables', label: 'Tables', to: '/?play=1', glyph: 'tables' },
  { key: 'rewards', label: 'Rewards', to: '/rewards', glyph: 'rewards' },
  { key: 'me', label: 'My Page', to: '/my-page', avatar: true },
];

function activeKey(route: string): string {
  const [path] = route.split('?');
  if (route.includes('play=1')) return 'tables';
  if (path === '/' || path === '') return 'home';
  if (path.startsWith('/casino') || path.startsWith('/slots')) return 'casino';
  if (path.startsWith('/rewards') || path.startsWith('/leaderboard') || path.startsWith('/missions')) return 'rewards';
  if (path.startsWith('/my-page') || path.startsWith('/profile')) return 'me';
  if (path.startsWith('/tournaments')) return 'home';
  return 'home';
}

export function MobileNav() {
  const { route, navigate, user, dmUnread } = useApp();
  const [path] = route.split('?');
  if (path.startsWith('/table') || path.startsWith('/login')) return null;
  const active = activeKey(route);
  return (
    <nav className="mobile-nav" aria-label="Primary">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-label={item.label}
          aria-current={active === item.key ? 'page' : undefined}
          className={'mobile-nav-item' + (active === item.key ? ' on' : '')}
          onClick={() => navigate(item.to)}
        >
          {item.glyph && <NavGlyph name={item.glyph} size={25} />}
          {item.avatar && (
            <span className="mobile-nav-avatar">
              <Avatar name={user?.nick || 'Guest'} src={user?.avatar} size={27} />
              {dmUnread > 0 && <i className="mobile-nav-badge">9+</i>}
            </span>
          )}
          <span className="mobile-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
