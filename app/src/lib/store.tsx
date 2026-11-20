import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api, getToken, setToken, User } from './api';
import { sound } from './sound';
import { subscribePrefs } from './prefsSync';
import { applyMotionPref } from './motion';
import { restoreAccountSettings } from './settingsStore';
import { landingRoute } from './phoneNav';
import { marketplaceAuthDestination, resolveEntryRoute } from './entryRoute';
import { isPhoneLayout } from './useIsPhone';
import { completeInstall, installPending, isPhone, isStandalone, markInstallPending, skipInstall, subscribeInstall } from './install';

type Toast = {
  id: number;
  kind: 'info' | 'success' | 'error' | 'reward';
  title: string;
  body?: string;
  /** Route opened by the toast's action button (a deep link). */
  link?: string;
  linkLabel?: string;
};

type TournamentStarted = { type: 'tournament_started'; id: string; name?: string; tableId: string; index?: number };

const TOAST_MS = 4200;
/** Dan's animated DanGG wordmark (a light sheen across it, 4 s loop); an admin brand upload still overrides it. */
const BRAND_LOGO = '/assets/brand/logo-animated.gif';
const LINK_TOAST_MS = 15000;

function isTournamentStarted(detail: unknown): detail is TournamentStarted {
  const d = detail as Partial<TournamentStarted> | null;
  return !!d && d.type === 'tournament_started' && typeof d.id === 'string' && typeof d.tableId === 'string';
}

/** The toast for a registrant whose tournament started; it opens their real flight. */
export function tournamentStartedToast(evt: TournamentStarted): Omit<Toast, 'id'> {
  const flight = evt.index && evt.index > 1 ? ` · Table ${evt.index}` : '';
  return {
    kind: 'reward',
    title: 'Your tournament started',
    body: `${evt.name || 'Tournament'}${flight}`,
    link: `/table/${encodeURIComponent(evt.tableId)}`,
    linkLabel: 'Go to table',
  };
}

type AppState = {
  user: User | null;
  guest: boolean;
  enterGuest: () => Promise<void>;
  loading: boolean;
  route: string;
  navigate: (to: string) => void;
  login: (login: string, pw: string) => Promise<void>;
  register: (data: { login: string; nick: string; password: string; email?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: (attempts?: number) => Promise<void>;
  setUser: (u: User | null) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  soundOn: boolean;
  toggleSound: () => void;
  animations: boolean;
  setAnimations: (v: boolean) => void;
  openingTable: string | null;
  setOpeningTable: (v: string | null) => void;
  splashDone: boolean;
  meta: { online: number; jackpot: number };
  demoAccount: boolean;
  installGate: boolean;
  finishInstall: () => void;
  dismissInstall: () => void;
  authOffline: boolean;
  firstLaunch: boolean;
  dismissFirstLaunch: () => void;
  brand: { logo: string; promo: string };
  dmUnread: number;
  refreshBrand: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

/** Where a player goes after login or on opening the app with no route. */
const landing = () => landingRoute(isPhoneLayout());

function currentRoute() {
  return resolveEntryRoute(window.location.hash, window.location.pathname, window.location.search, landing());
}

/** True only after this browser session has passed the login/guest screen. */
function enteredThisSession() {
  try { return sessionStorage.getItem('ggpoker.entered') === '1'; } catch { return false; }
}

function markEntered() {
  try { sessionStorage.setItem('ggpoker.entered', '1'); } catch { /* private mode */ }
}

function clearEntered() {
  try { sessionStorage.removeItem('ggpoker.entered'); } catch { /* private mode */ }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [guest, setGuest] = useState(() => typeof window !== 'undefined' && enteredThisSession() && localStorage.getItem('ggpoker.guest') === '1');
  const [demoAccount, setDemoAccount] = useState(false);
  // Pending install from an earlier visit (account created but app not added).
  const [installGate, setInstallGate] = useState(() => installPending());
  // True when the app started with a saved session but the server could not be
  // reached; keeps the token instead of dumping the player on the login screen.
  const [authOffline, setAuthOffline] = useState(false);
  const [firstLaunch, setFirstLaunch] = useState(() => typeof window !== 'undefined'
    && isStandalone()
    && localStorage.getItem('ggpoker.welcomeSeen') !== '1');
  const [loading, setLoading] = useState(true);
  const splashDone = !loading;
  const [route, setRoute] = useState(currentRoute());
  const routeRef = useRef(route);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [animations, setAnimations] = useState(() => localStorage.getItem('ggpoker.animations') !== '0');
  const [openingTable, setOpeningTable] = useState<string | null>(null);
  const [meta, setMeta] = useState({ online: 192203, jackpot: 199026635 });
  const [brand, setBrand] = useState({ logo: BRAND_LOGO, promo: '/assets/chrome/promo.png' });
  const [dmUnread, setDmUnread] = useState(0);
  const toastId = useRef(1);

  const navigate = useCallback((to: string) => {
    if (!window.dispatchEvent(new CustomEvent('dangg:before-navigate', { cancelable: true, detail: { to } }))) return;
    const commit = () => {
      if (window.location.hash !== '#' + to) window.history.pushState(null, '', '#' + to);
      routeRef.current = to;
      flushSync(() => setRoute(to));
      window.scrollTo(0, 0);
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // The live table owns its own motion; never wrap it in a page transition.
    if (!reduce && !to.startsWith('/table') && typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(commit);
    } else {
      commit();
    }
  }, []);

  useEffect(() => {
    const onHash = () => {
      const next = currentRoute();
      if (next === routeRef.current) return;
      if (!window.dispatchEvent(new CustomEvent('dangg:before-navigate', { cancelable: true, detail: { to: next } }))) {
        // A same-document Back/hash transition cannot use beforeunload. Restore the
        // current route when its form guard declines to discard unsaved work.
        window.history.pushState(null, '', '#' + routeRef.current);
        return;
      }
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);

  const refreshUser = useCallback(async (attempts = 1) => {
    if (!getToken()) { setUser(null); setAuthOffline(false); return; }
    let lastError: any = null;
    for (let attempt = 0; attempt < Math.max(1, attempts); attempt++) {
      try {
        const res = await api.me();
        restoreAccountSettings(res.settings);
        setUser(res.user);
        setAuthOffline(false);
        return;
      } catch (error: any) {
        lastError = error;
        // A rejected session is a logout; a network hiccup is not.
        if (error?.status === 401 || error?.status === 403) {
          setToken(null);
          setUser(null);
          setAuthOffline(false);
          return;
        }
        if (attempt < Math.max(1, attempts) - 1) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 600 : 1600));
        }
      }
    }
    // Keep the token: an installed app opening without a connection should show
    // a retry screen, not the login form.
    if (lastError) setAuthOffline(true);
  }, []);

  useEffect(() => {
    (async () => {
      // Every fresh app open goes to the login screen. The saved credentials
      // stay on the device; this tab must explicitly enter before restoring them.
      if (!enteredThisSession()) {
        // A fresh tab shows login without deleting another tab's active session.
        setGuest(false);
        setUser(null);
        setLoading(false);
        return;
      }
      await refreshUser(3);
      setLoading(false);
    })();
  }, [refreshUser]);

  useEffect(() => {
    const onInteraction = () => { sound.unlock(); };
    sound.startMusic();
    window.addEventListener('pointerdown', onInteraction);
    window.addEventListener('keydown', onInteraction);
    return () => {
      window.removeEventListener('pointerdown', onInteraction);
      window.removeEventListener('keydown', onInteraction);
    };
  }, []);

  useEffect(() => {
    sound.preload();
  }, []);

  const refreshBrand = useCallback(async () => {
    try {
      const b = await api.brand();
      setBrand({
        logo: b.logo || BRAND_LOGO,
        promo: b.promo || '/assets/chrome/promo.png',
      });
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { refreshBrand(); }, [refreshBrand]);
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = toastId.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.link ? LINK_TOAST_MS : TOAST_MS);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // One "tournament started" toast per event: the stream re-announces untouched
  // seats on every reconnect.
  const announcedTournaments = useRef(new Set<string>());

  useEffect(() => {
    if (!user) { setDmUnread(0); return; }
    let stop = false;
    const poll = async () => {
      try { const r = await api.notifications(); if (!stop) setDmUnread(Number(r.unread) || 0); } catch { /* ignore */ }
    };
    poll();
    const timer = window.setInterval(poll, 15000);
    let source: EventSource | null = null;
    let retry: number | undefined;
    const connect = () => {
      const token = getToken();
      if (!token) return;
      source = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
      source.onmessage = (event) => {
        try {
          const detail = JSON.parse(event.data);
          if (isTournamentStarted(detail)) {
            const onTable = currentRoute() === `/table/${encodeURIComponent(detail.tableId)}`;
            if (!onTable && !announcedTournaments.current.has(detail.id)) {
              announcedTournaments.current.add(detail.id);
              toast(tournamentStartedToast(detail));
            }
          }
          api.notifications().then((r) => { if (!stop) setDmUnread(Number(r.unread) || 0); }).catch(() => {});
          window.dispatchEvent(new CustomEvent('gg:notify', { detail }));
        } catch { /* ignore */ }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (!stop) retry = window.setTimeout(connect, 5000);
      };
    };
    connect();
    return () => { stop = true; window.clearInterval(timer); if (retry) window.clearTimeout(retry); source?.close(); };
  }, [user?.id, toast]);

  useEffect(() => {
    let alive = true;
    const loadMeta = async () => {
      try {
        const r = await fetch('/api/lobby', { headers: getToken() ? { authorization: `Bearer ${getToken()}` } : {} });
        if (!r.ok) return;
        const d = await r.json();
        if (alive) {
          setMeta({ online: d.online, jackpot: d.jackpot });
          setDemoAccount(!!d.demoAccount);
        }
      } catch { /* ignore */ }
    };
    loadMeta();
    const t = window.setInterval(loadMeta, 20000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const enterGuest = useCallback(async () => {
    markEntered();
    try {
      // A throwaway play-money account, so a guest can sit down like everyone else.
      const res = await api.guest();
      setToken(res.token);
      localStorage.removeItem('ggpoker.guest');
      setGuest(false);
      setUser(res.user);
    } catch (error) {
      // Server refused (rate limit or offline): browse the lobby read-only instead.
      console.warn('Guest account unavailable, browsing only', error);
      localStorage.setItem('ggpoker.guest', '1');
      setGuest(true);
    }
  }, []);

  const finishInstall = useCallback(() => {
    completeInstall();
    setInstallGate(false);
    navigate(landing());
  }, [navigate]);

  const dismissInstall = useCallback(() => {
    skipInstall();
    setInstallGate(false);
    navigate(landing());
  }, [navigate]);

  const dismissFirstLaunch = useCallback(() => {
    localStorage.setItem('ggpoker.welcomeSeen', '1');
    setFirstLaunch(false);
  }, []);

  // `appinstalled` (Android) or launching from the home-screen icon closes the
  // gate even if it was triggered outside this screen.
  useEffect(() => {
    if (!installGate) return;
    return subscribeInstall(() => {
      if (isStandalone() || !installPending()) setInstallGate(false);
    });
  }, [installGate]);

  const login = useCallback(async (loginId: string, pw: string) => {
    const returnTo = marketplaceAuthDestination(currentRoute());
    const res = await api.login(loginId, pw);
    markEntered();
    setToken(res.token);
    localStorage.removeItem('ggpoker.guest');
    setGuest(false);
    setUser(res.user);
    // The account's saved settings follow the player to this device (newer copy wins).
    api.me().then((me) => restoreAccountSettings(me.settings))
      .catch((error) => console.warn('Could not load account settings', error));
    if (returnTo) navigate(returnTo);
    else navigate(landing());
  }, [navigate]);

  const register = useCallback(async (data: { login: string; nick: string; password: string; email?: string }) => {
    const returnTo = marketplaceAuthDestination(currentRoute());
    const res = await api.register(data);
    markEntered();
    setToken(res.token);
    localStorage.removeItem('ggpoker.guest');
    setGuest(false);
    setUser(res.user);
    // A brand-new phone account goes straight to the install step; desktop
    // sign-ups continue into the lobby as before.
    if (isPhone() && !isStandalone()) {
      markInstallPending();
      setInstallGate(true);
    }
    if (returnTo) navigate(returnTo);
    else navigate(landing());
  }, [navigate]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    clearEntered();
    setToken(null);
    localStorage.removeItem('ggpoker.guest');
    setGuest(false);
    setUser(null);
    setAuthOffline(false);
    navigate('/');
  }, [navigate]);

  // The animations setting covers the whole app, not just the table.
  useLayoutEffect(() => { applyMotionPref(animations); }, [animations]);

  // Settings applied in another window, or restored from the account, update this one live.
  useEffect(() => subscribePrefs(['ggpoker.sound', 'ggpoker.animations'], () => {
    setSoundOn(sound.enabled);
    setAnimations(localStorage.getItem('ggpoker.animations') !== '0');
  }), []);

  const toggleSound = useCallback(() => {
    const next = !sound.enabled;
    sound.setEnabled(next);
    setSoundOn(next);
    localStorage.setItem('ggpoker.sound', next ? '1' : '0');
  }, []);

  const value = useMemo<AppState>(() => ({
    user, guest, enterGuest, loading, route, navigate, login, register, logout, refreshUser, setUser,
    toasts, toast, dismissToast, soundOn, toggleSound, animations,
    setAnimations: (v: boolean) => { setAnimations(v); localStorage.setItem('ggpoker.animations', v ? '1' : '0'); },
    openingTable, setOpeningTable, meta, demoAccount, brand, refreshBrand, splashDone, dmUnread,
    installGate, finishInstall, dismissInstall, authOffline, firstLaunch, dismissFirstLaunch,
  }), [user, guest, enterGuest, loading, route, navigate, login, register, logout, refreshUser, toasts, toast, dismissToast, soundOn, toggleSound, animations, openingTable, meta, demoAccount, brand, refreshBrand, splashDone, dmUnread, installGate, finishInstall, dismissInstall, authOffline, firstLaunch, dismissFirstLaunch]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
