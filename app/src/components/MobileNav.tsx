import React from 'react';
import { useApp } from '../lib/store';
import { Avatar } from './Avatar';
import { PHONE_MENU_EMBLEM } from '../lib/menuArt';
import { activeNavKey, PHONE_NAV } from '../lib/phoneNav';

/**
 * The phone's primary navigation, as on the mobile reference: Poker, Tournaments, a raised round
 * brand button for Home in the centre, Casino, and the player's avatar for My Page.
 */
export function MobileNav() {
  const { route, navigate, user, dmUnread, brand } = useApp();
  const [path] = route.split('?');
  if (path.startsWith('/table') || path.startsWith('/login')) return null;
  const active = activeNavKey(route);
  return (
    <nav className="mobile-nav" aria-label="Primary">
      {PHONE_NAV.map((item) => {
        const on = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-label={item.label}
            aria-current={on ? 'page' : undefined}
            className={'mobile-nav-item' + (on ? ' on' : '') + (item.kind === 'brand' ? ' center' : '')}
            onClick={() => navigate(item.to)}
          >
            {item.kind === 'glyph' && <img className="mobile-nav-emblem" src={PHONE_MENU_EMBLEM[item.glyph]} alt="" />}
            {item.kind === 'brand' && <img className="mobile-nav-brand" src={brand.logo} alt="" />}
            {item.kind === 'avatar' && (
              <span className="mobile-nav-avatar">
                <Avatar name={user?.nick || 'Guest'} src={user?.avatar} size={30} />
                {dmUnread > 0 && <i className="mobile-nav-badge">{dmUnread > 9 ? '9+' : dmUnread}</i>}
              </span>
            )}
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
