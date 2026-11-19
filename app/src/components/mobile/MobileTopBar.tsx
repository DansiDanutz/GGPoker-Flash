import React from 'react';
import { useApp } from '../../lib/store';
import { Avatar } from '../Avatar';
import { NavGlyph } from './PhoneIcons';

/**
 * Phone chrome: one 54px bar replacing the desktop title bar, tabs and account rail.
 * Left is back when needed, centre the brand (or page title), right is wallet and Profile.
 */
export function MobileTopBar({ title, showBrand = false }: { title?: string; showBrand?: boolean }) {
  const { user, navigate, brand, route, dmUnread } = useApp();
  const path = route.split('?')[0];
  const isRoot = ['/', '/casino', '/rewards', '/my-page'].includes(path) || route.includes('play=1');
  const showBack = Boolean(title) || ['/contributor', '/organiser'].includes(path);
  const back = () => {
    if (!isRoot && window.history.length > 1) window.history.back();
    else navigate('/');
  };
  return (
    <header className="p-topbar">
      {showBack ? (
        <button type="button" className="p-icon-btn" aria-label="Back" onClick={back}>
          <NavGlyph name="back" size={22} />
        </button>
      ) : <span className="p-topbar-spacer" aria-hidden="true" />}
      <div className="p-topbar-mid">
        {title ? <b className="p-topbar-title">{title}</b> : showBrand ? <img src={brand.logo} alt="DanGG" className="p-topbar-logo" /> : <span />}
      </div>
      <div className="p-topbar-actions">
        <button type="button" className="p-wallet" aria-label="Open cashier" onClick={() => navigate(user ? '/cashier' : '/login')}>
          {user ? <><b>{(user.balance / 100).toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2})} Play</b><NavGlyph name="wallet" size={19} /></> : <b>Log in</b>}
        </button>
        <button type="button" className="p-avatar-btn" aria-label={user ? 'My Page' : 'Log in'} onClick={() => navigate(user ? '/my-page' : '/login')}>
          <Avatar name={user?.nick || 'Guest'} src={user?.avatar} size={34} />
          {dmUnread > 0 && <i className="p-dot" />}
        </button>
      </div>
    </header>
  );
}
