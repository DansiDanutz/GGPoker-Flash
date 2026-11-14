import React from 'react';
import { money } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Avatar } from '../Avatar';
import { NavGlyph } from './PhoneIcons';

/**
 * Phone chrome: one 54px bar replacing the desktop title bar, tabs and account rail.
 * Left is the avatar (or back), centre the brand (or page title), right the wallet.
 */
export function MobileTopBar({ title, showBrand = false }: { title?: string; showBrand?: boolean }) {
  const { user, navigate, brand, route, dmUnread } = useApp();
  const isRoot = ['/', '/casino', '/rewards', '/my-page'].includes(route.split('?')[0]) || route.includes('play=1');
  const back = () => {
    if (!isRoot && window.history.length > 1) window.history.back();
    else navigate('/');
  };
  return (
    <header className="p-topbar">
      {title ? (
        <button type="button" className="p-icon-btn" aria-label="Back" onClick={back}>
          <NavGlyph name="back" size={22} />
        </button>
      ) : (
        <button type="button" className="p-avatar-btn" aria-label={user ? 'My Page' : 'Log in'} onClick={() => navigate(user ? '/my-page' : '/login')}>
          <Avatar name={user?.nick || 'Guest'} src={user?.avatar} size={34} />
          {dmUnread > 0 && <i className="p-dot" />}
        </button>
      )}
      <div className="p-topbar-mid">
        {title ? <b className="p-topbar-title">{title}</b> : showBrand ? <img src={brand.logo} alt="DanGG" className="p-topbar-logo" /> : <span />}
      </div>
      <button type="button" className="p-wallet" aria-label="Open cashier" onClick={() => navigate(user ? '/cashier' : '/login')}>
        {user ? <><b>{money(user.balance)}</b><NavGlyph name="wallet" size={19} /></> : <b>Log in</b>}
      </button>
    </header>
  );
}
