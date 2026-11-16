import React from 'react';
import { money } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Avatar } from '../Avatar';
import { ACCOUNT_ROWS, PROMO_ROWS, QUICK_TILES, vipProgress, type HubTarget } from '../../lib/accountHub';
import { HubIcon } from './HubIcons';

/**
 * Phone My Page (mobile reference M01–M03): who you are, your wallet with a Cashier button,
 * a row of quick tiles, your promotions, then the account list. Each entry opens a My Page pane
 * or another page; the hub itself holds no state.
 */
export function MobileAccountHub({ onOpen }: { onOpen: (tab: string) => void }) {
  const { user, navigate, dmUnread, logout } = useApp();
  const go = (target: HubTarget) => ('tab' in target ? onOpen(target.tab) : navigate(target.route));

  if (!user) {
    return (
      <div className="ma">
        <section className="ma-guest">
          <Avatar name="Guest" size={72} />
          <b>Play as yourself</b>
          <p>Log in to keep your chips, missions and hand history on every device.</p>
          <button type="button" className="ma-cta" onClick={() => navigate('/login')}>Log in or join</button>
        </section>
      </div>
    );
  }

  const vip = vipProgress(user.xp ?? 0, user.vip_level ?? 1);
  return (
    <div className="ma">
      <section className="ma-profile">
        <button type="button" className="ma-avatar" aria-label="Edit game profile" onClick={() => onOpen('overview')}>
          <Avatar name={user.nick} src={user.avatar} size={68} />
          <i aria-hidden="true">✎</i>
        </button>
        <div className="ma-who">
          <b>{user.nick}</b>
          <span className="ma-chip">DanGG Account</span>
          <div className="ma-vip" aria-label={`VIP level ${vip.level}, ${vip.pct}% to the next level`}>
            <small>VIP {vip.level}</small>
            <span className="ma-bar"><i style={{ width: `${vip.pct}%` }} /></span>
            <small>{vip.pct}%</small>
          </div>
        </div>
      </section>

      <section className="ma-wallet" aria-label="My Wallet">
        <div className="ma-wallet-top">
          <span>My Wallet</span>
          <button type="button" onClick={() => onOpen('wallet')}>Details ›</button>
        </div>
        <div className="ma-balance">
          <b>{money(user.balance)}</b>
          <small>Play-money balance</small>
        </div>
        <div className="ma-wallet-row">
          <span><small>Poker $</small>{(user.play_chips ?? 0).toLocaleString()}</span>
          <span><small>Tickets</small>{(user.tickets ?? 0).toLocaleString()}</span>
          <span><small>Gems</small>{(user.gems ?? 0).toLocaleString()}</span>
        </div>
        <button type="button" className="ma-cashier" onClick={() => navigate('/cashier')}>Cashier</button>
      </section>

      <nav className="ma-tiles" aria-label="Quick links">
        {QUICK_TILES.map((t) => (
          <button key={t.key} type="button" onClick={() => go(t.target)}>
            <span className="ma-tile-ico"><HubIcon name={t.icon} />{t.key === 'messages' && dmUnread > 0 && <i className="ma-badge">{dmUnread > 9 ? '9+' : dmUnread}</i>}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <section className="ma-section" aria-labelledby="ma-promos">
        <h2 id="ma-promos">My Promotions</h2>
        <div className="ma-list">
          {PROMO_ROWS.map((r) => (
            <button key={r.key} type="button" className="ma-row ma-promo" onClick={() => go(r.target)}>
              <span className="ma-thumb" style={{ backgroundImage: `url(${r.art})` }} aria-hidden="true" />
              <span className="ma-row-copy"><b>{r.label}</b><small>{r.sub}</small></span>
              <i aria-hidden="true">›</i>
            </button>
          ))}
        </div>
      </section>

      <section className="ma-section" aria-labelledby="ma-account">
        <h2 id="ma-account">Account</h2>
        <div className="ma-list">
          {ACCOUNT_ROWS.map((r) => (
            <button key={r.key} type="button" className="ma-row" onClick={() => go(r.target)}>
              <span className="ma-row-ico"><HubIcon name={r.icon} /></span>
              <span className="ma-row-copy"><b>{r.label}</b></span>
              <i aria-hidden="true">›</i>
            </button>
          ))}
          <button type="button" className="ma-row ma-signout" onClick={async () => { await logout(); navigate('/login'); }}>
            <span className="ma-row-copy"><b>Sign out</b></span>
          </button>
        </div>
      </section>
      <p className="p-legal">18+ · Demo and organizer balances stay separate</p>
    </div>
  );
}
