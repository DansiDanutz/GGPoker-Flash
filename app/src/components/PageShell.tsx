import React, { useEffect, useRef } from 'react';
import { useApp } from '../lib/store';
import { TitleBar } from './TitleBar';
import { AppHeader } from './AppHeader';
import { MobileShell } from './mobile/MobileShell';
import { useIsPhone } from '../lib/useIsPhone';

export function PageShell({ activeTop, children, subnav }: {
  activeTop: string;
  children: React.ReactNode;
  subnav?: React.ReactNode;
}) {
  const { user, meta, dmUnread, route } = useApp();
  const isPhone = useIsPhone();
  if (isPhone) {
    const [path] = route.split('?');
    const titles: Record<string, string> = {
      '/cashier': 'Cashier', '/missions': 'Missions', '/leaderboard': 'Leaderboard',
      '/tournaments': 'Tournaments', '/slots': 'Slots', '/settings': 'Settings', '/promotions': 'Promotions',
      '/elo': 'ELO', '/support': 'Support', '/profile': 'Profile', '/hand-history': 'Hand history',
      '/propbet': 'Prop bet', '/ocean': 'Ocean Rewards', '/ggcare': 'GG Care', '/honeymoon': 'Honeymoon', '/admin': 'Admin',
    };
    const title = path.startsWith('/slots/') ? 'Slots' : titles[path];
    return <MobileShell title={title} showBrand={!title}>{subnav}{children}</MobileShell>;
  }
  return (
    <>
      <TitleBar online={meta.online} unread={user ? dmUnread : 0} />
      <AppHeader online={meta.online} jackpot={meta.jackpot} user={user} activeTop={activeTop} />
      {subnav}
      <div className="app-content">{children}</div>
    </>
  );
}

export function SubNav({ items, active, onChange }: { items: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    refs.current[active]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active]);
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[next].key);
    refs.current[items[next].key]?.focus();
  };
  return (
    <div className="subnav" role="tablist" aria-label="Page sections">
      {items.map((item, index) => (
        <button
          key={item.key}
          ref={(node) => { refs.current[item.key] = node; }}
          role="tab"
          aria-selected={active === item.key}
          tabIndex={active === item.key ? 0 : -1}
          className={active === item.key ? 'on' : ''}
          onClick={() => onChange(item.key)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >{item.label}</button>
      ))}
    </div>
  );
}

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(to).getTime() - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (diff <= 0) return <span className="tag live">Running</span>;
  return <span className="mono">{h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`}</span>;
}
