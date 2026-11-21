import { PageShell } from './components/PageShell';
import React, { useEffect, useMemo, useState } from 'react';
import { needsPortrait } from './lib/phoneOrientation';
import { useApp } from './lib/store';
import { TitleBar } from './components/TitleBar';
import { AppHeader } from './components/AppHeader';
import { SeatOfferModal } from './components/SeatOfferModal';
import { Login } from './pages/Login';
import { Lobby } from './pages/Lobby';
import { TablePage } from './pages/TablePage';
import { Tournaments } from './pages/Tournaments';
import { Cashier } from './pages/Cashier';
import { Rewards, Leaderboard } from './pages/Rewards';
import { Elo } from './pages/Elo';
import { PlayLimits, Promotions, Settings } from './pages/Promotions';
import { Slots } from './pages/Slots';
import { Casino } from './pages/Casino';
import { Profile, Support } from './pages/Extras';
import { PropBetPage } from './pages/PropBet';
import { PokerCraft } from './pages/PokerCraft';
import { Admin } from './pages/Admin';
import { MyPage } from './pages/MyPage';
import { Ocean, GGCare } from './pages/Ocean';
import { Honeymoon } from './pages/Honeymoon';
import { MobileNav } from './components/MobileNav';
import { InstallApp } from './pages/InstallApp';
import { LoadingScreen } from './components/splash/LoadingScreen';
import { Reconnect } from './pages/Reconnect';
import { FirstLaunch } from './components/FirstLaunch';
import { QuickMenu } from './components/QuickMenu';
import { Marketplace } from './pages/Marketplace';
import { PlatformWorkspace } from './pages/PlatformWorkspace';
import { RakeLab } from './pages/RakeLab';
import { Organizers } from './pages/Organizers';

function ScaleStage({ children }: { children: React.ReactNode }) {
  const phoneIsLandscape = () => needsPortrait(screen, window.matchMedia('(pointer: coarse)').matches);
  const [rotatePhone, setRotatePhone] = useState(phoneIsLandscape);
  useEffect(() => {
    const update = () => setRotatePhone(phoneIsLandscape());
    window.addEventListener('resize', update);
    screen.orientation?.addEventListener('change', update);
    return () => {
      window.removeEventListener('resize', update);
      screen.orientation?.removeEventListener('change', update);
    };
  }, []);
  const desktop = typeof window !== 'undefined' && !!(window as any).ggDesktop;
  useEffect(() => {
    if (desktop) document.body.classList.add('electron');
  }, [desktop]);
  return (
    <div className="desktop">
      <div className="app-window" inert={rotatePhone && !desktop} aria-hidden={rotatePhone && !desktop ? true : undefined}>{children}</div>
      {rotatePhone && !desktop && <div className="phone-rotate" role="status" aria-live="polite">
        <svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="22" y="10" width="22" height="42" rx="4"/><path d="M29 46h8M13 38a22 22 0 0 1 2-23m-7 2 7-2 2 7M51 26a22 22 0 0 1-2 23m7-2-7 2-2-7"/></svg>
        <h1>Rotate your phone to portrait</h1>
        <p>DanGG works in portrait on mobile.</p>
        <small>Your game stays connected. Action timers continue.</small>
      </div>}
    </div>
  );
}

function ComingSoon({ title }: { title: string }) {
  const { navigate, meta } = useApp();
  return (
    <>
      <TitleBar online={meta.online} />
      <AppHeader online={meta.online} jackpot={199026635} user={null} />
      <div className="page">
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">This section is being wired up.</p>
        <button className="btn btn-red" onClick={() => navigate('/')}>Back to lobby</button>
      </div>
    </>
  );
}

export default function App() {
  const { loading, route } = useApp();
  return <LoadingScreen ready={!loading} bypass={route.split('?')[0] === '/marketplace'}><AppContent /></LoadingScreen>;
}

function AppContent() {
  const { route, navigate, toasts, dismissToast, loading, user, guest, splashDone, meta, installGate, authOffline, firstLaunch } = useApp();

  const page = useMemo(() => {
    const [path] = route.split('?');
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return <Lobby />;
    if (parts[0] === 'login') return <Login />;
    if (parts[0] === 'table') return <TablePage key={parts[1]} tableId={parts[1]} />;
    switch (parts[0]) {
      case 'rake-lab': return <RakeLab />;
      case 'contributor': return <PlatformWorkspace kind="contributor" />;
      case 'organiser': return <PlatformWorkspace kind="organiser" />;
      case 'organizers': return <Organizers />;
      case 'tournaments': return <Tournaments />;
      case 'cashier': return <Cashier />;
      case 'rewards': return <Rewards />;
      case 'missions': return <Rewards initialTab="missions" />;
      case 'leaderboard': return <Leaderboard />;
      case 'elo': return <Elo />;
      case 'promotions': return <Promotions />;
      case 'responsible-gaming': return <PageShell activeTop="poker"><div className="page"><h1 className="page-title">Responsible gaming</h1><PlayLimits /></div></PageShell>;
      case 'settings': return <Settings />;
      case 'slots': return <Slots />;
      case 'casino': return <Casino />;
      case 'profile': return <Profile />;
      case 'my-page': return <MyPage />;
      case 'ocean': return <Ocean />;
      case 'ggcare': return <GGCare />;
      case 'honeymoon': return <Honeymoon />;
      case 'support': return <Support />;
      case 'hand-history': return <PokerCraft />;
      case 'propbet': return <PropBetPage />;
      case 'admin': return <Admin />;
      default: return <ComingSoon title="Not found" />;
    }
  }, [route, loading]);

  // The catalog is public and has its own layout, loading state and account controls.
  // Viewing it never creates a guest player or requires installation of the poker app.
  if (route.split('?')[0] === '/marketplace') return <Marketplace />;

  if (!splashDone || loading) {
    return null;
  }

  if (!user && !guest) {
    // A saved session that could not reach the server is not a logout.
    if (authOffline) {
      return (
        <ScaleStage>
          <Reconnect />
        </ScaleStage>
      );
    }
    return (
      <ScaleStage>
        <TitleBar online={meta.online} />
        <Login />
      </ScaleStage>
    );
  }

  // Right after a phone sign-up: install the app (or explicitly continue in
  // the browser). Android gets the native install prompt, iOS the Home Screen
  // steps.
  if (installGate) {
    return (
      <ScaleStage>
        <InstallApp />
      </ScaleStage>
    );
  }

  return (
    <ScaleStage>
      {page}
      {firstLaunch && <FirstLaunch />}
      <MobileNav />
      <QuickMenu />
      {user && <SeatOfferModal />}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + t.kind} onClick={() => dismissToast(t.id)}>
            <b>{t.title}</b>
            {t.body && <span>{t.body}</span>}
            {t.link && (
              <button
                type="button"
                className="toast-action"
                onClick={(e) => { e.stopPropagation(); dismissToast(t.id); navigate(t.link!); }}
              >
                {t.linkLabel || 'Open'}
              </button>
            )}
          </div>
        ))}
      </div>
    </ScaleStage>
  );
}
