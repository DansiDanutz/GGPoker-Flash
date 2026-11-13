import React from 'react';
import { useApp } from '../lib/store';
import { Avatar } from './Avatar';
import { NavGlyph } from './mobile/PhoneIcons';

type NavItem = { key: string; label: string; to: string; glyph?: 'poker' | 'events' | 'casino'; center?: boolean; avatar?: boolean };

// Phone bar: icon-only, the round brand button in the middle opens Home.
const ITEMS: readonly NavItem[] = [
  { key: 'poker', label: 'Poker', glyph: 'poker', to: '/?play=1' },
  { key: 'tournaments', label: 'Events', glyph: 'events', to: '/tournaments' },
  { key: 'home', label: 'Home', to: '/', center: true },
  { key: 'casino', label: 'Casino', glyph: 'casino', to: '/casino' },
  { key: 'me', label: 'My Page', to: '/my-page', avatar: true },
];

function activeKey(route: string): string {
  const [path] = route.split('?');
  if (route.includes('play=1')) return 'poker';
  if (path === '/' || path === '') return 'home';
  if (path.startsWith('/my-page')) return 'me';
  if (path.startsWith('/slots')) return 'casino';
  return path.split('/')[1] || 'home';
}

export function MobileNav() {
  const { route, navigate, user, brand, dmUnread } = useApp();
  const [path] = route.split('?');
  if (path.startsWith('/table') || path.startsWith('/login')) return null;
  const active = activeKey(route);
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-label={item.label}
          aria-current={active === item.key ? 'page' : undefined}
          className={'mobile-nav-item' + (item.center ? ' center' : '') + (active === item.key ? ' on' : '')}
          onClick={() => navigate(item.to)}
        >
          {item.glyph && <NavGlyph name={item.glyph} />}
          {item.center && <img className="mobile-nav-brand" src={brand.logo} alt="" />}
          {item.avatar && (
            <span className="mobile-nav-avatar">
              <Avatar name={user?.nick || 'Guest'} src={user?.avatar} size={34} />
              {dmUnread > 0 && <i className="mobile-nav-badge">{dmUnread > 9 ? '9+' : dmUnread}</i>}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
