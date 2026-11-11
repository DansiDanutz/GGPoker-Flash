import React from 'react';
import { useApp } from '../lib/store';
import { TitleBar } from './TitleBar';
import { AppHeader } from './AppHeader';

export function PageShell({ activeTop, children, subnav }: {
  activeTop: string;
  children: React.ReactNode;
  subnav?: React.ReactNode;
}) {
  const { user, meta, dmUnread } = useApp();
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
  return (
    <div className="subnav">
      {items.map((i) => (
        <button key={i.key} className={active === i.key ? 'on' : ''} onClick={() => onChange(i.key)}>{i.label}</button>
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
