import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from './lib/store';
import { TitleBar } from './components/TitleBar';
import { AppHeader } from './components/AppHeader';
import { Login } from './pages/Login';
import { Lobby } from './pages/Lobby';
import { TablePage } from './pages/TablePage';
import { Tournaments } from './pages/Tournaments';
import { Cashier } from './pages/Cashier';
import { Rewards, Leaderboard } from './pages/Rewards';
import { Promotions, Settings } from './pages/Promotions';
import { Slots, Casino } from './pages/Casino';
import { Profile, HandHistory, PropBet, Support } from './pages/Extras';
import { Admin } from './pages/Admin';
import { MyPage } from './pages/MyPage';

function ScaleStage({ children }: { children: React.ReactNode }) {
  const desktop = typeof window !== 'undefined' && !!(window as any).ggDesktop;
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (desktop) { document.body.classList.add('electron'); return; }
    const compute = () => {
      const s = Math.min(1, (window.innerWidth - 24) / 1200, (window.innerHeight - 24) / 961);
      setScale(Math.max(0.5, s));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [desktop]);
  return (
    <div className="desktop">
      <div className="app-window" style={desktop ? undefined : { transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

function Splash() {
  const { brand } = useApp();
  return (
    <div className="splash">
      <div className="splash-inner">
        <img className="splash-logo" src={brand.logo} alt="DanGG.ro" />
        <div className="splash-tagline">THE WORLD'S BIGGEST POKER ROOM</div>
        <div className="splash-bar"><i /></div>
        <div className="splash-status">Connecting to DanGG.ro…</div>
        <div className="splash-legal">Play money · local clone · no real-money gambling</div>
      </div>
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  const { navigate } = useApp();
  return (
    <>
      <TitleBar online={192203} />
      <AppHeader online={192203} jackpot={199026635} user={null} />
      <div className="page">
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">This section is being wired up.</p>
        <button className="btn btn-red" onClick={() => navigate('/')}>Back to lobby</button>
      </div>
    </>
  );
}

export default function App() {
  const { route, toasts, dismissToast, loading, user, splashDone, meta } = useApp();
  const guest = typeof window !== 'undefined' && localStorage.getItem('ggpoker.guest') === '1';

  const page = useMemo(() => {
    const [path] = route.split('?');
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return <Lobby />;
    if (parts[0] === 'login') return <Login />;
    if (parts[0] === 'table') return <TablePage tableId={parts[1]} />;
    switch (parts[0]) {
      case 'tournaments': return <Tournaments />;
      case 'cashier': return <Cashier />;
      case 'rewards': return <Rewards />;
      case 'missions': return <Rewards initialTab="missions" />;
      case 'leaderboard': return <Leaderboard />;
      case 'promotions': return <Promotions />;
      case 'settings': return <Settings />;
      case 'slots': return <Slots />;
      case 'casino': return <Casino />;
      case 'profile': return <Profile />;
      case 'my-page': return <MyPage />;
      case 'support': return <Support />;
      case 'hand-history': return <HandHistory />;
      case 'propbet': return <PropBet />;
      case 'admin': return <Admin />;
      default: return <ComingSoon title="Not found" />;
    }
  }, [route, loading]);

  if (!splashDone || loading) {
    return (
      <ScaleStage>
        <TitleBar online={meta.online} />
        <Splash />
      </ScaleStage>
    );
  }

  if (!user && !guest) {
    return (
      <ScaleStage>
        <TitleBar online={meta.online} />
        <Login />
      </ScaleStage>
    );
  }

  return (
    <ScaleStage>
      {page}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.kind} onClick={() => dismissToast(t.id)}>
            <b>{t.title}</b>
            {t.body && <span>{t.body}</span>}
          </div>
        ))}
      </div>
    </ScaleStage>
  );
}
