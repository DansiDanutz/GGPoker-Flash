import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken, User } from './api';
import { sound } from './sound';

type Toast = { id: number; kind: 'info' | 'success' | 'error' | 'reward'; title: string; body?: string };

type AppState = {
  user: User | null;
  loading: boolean;
  route: string;
  navigate: (to: string) => void;
  login: (login: string, pw: string) => Promise<void>;
  register: (data: { login: string; nick: string; password: string; email?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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
  brand: { logo: string; promo: string };
  refreshBrand: () => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

function currentRoute() {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/';
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [splashDone, setSplashDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState(currentRoute());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [animations, setAnimations] = useState(() => localStorage.getItem('ggpoker.animations') !== '0');
  const [openingTable, setOpeningTable] = useState<string | null>(null);
  const [meta, setMeta] = useState({ online: 192203, jackpot: 199026635 });
  const [brand, setBrand] = useState({ logo: '/assets/chrome/logo.png', promo: '/assets/chrome/promo.png' });
  const toastId = useRef(1);

  const navigate = useCallback((to: string) => {
    if (window.location.hash !== '#' + to) window.location.hash = to;
    else setRoute(to);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  useEffect(() => {
    const onFirst = () => { sound.unlock(); };
    window.addEventListener('pointerdown', onFirst, { once: true });
    return () => window.removeEventListener('pointerdown', onFirst);
  }, []);

  useEffect(() => {
    sound.preload();
    const t = window.setTimeout(() => setSplashDone(true), 2100);
    return () => window.clearTimeout(t);
  }, []);

  const refreshBrand = useCallback(async () => {
    try {
      const b = await api.brand();
      setBrand({
        logo: b.logo || '/assets/chrome/logo.png',
        promo: b.promo || '/assets/chrome/promo.png',
      });
    } catch { /* keep defaults */ }
  }, []);

  useEffect(() => { refreshBrand(); }, [refreshBrand]);

  useEffect(() => {
    let alive = true;
    const loadMeta = async () => {
      try {
        const r = await fetch('/api/lobby', { headers: getToken() ? { authorization: `Bearer ${getToken()}` } : {} });
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setMeta({ online: d.online, jackpot: d.jackpot });
      } catch { /* ignore */ }
    };
    loadMeta();
    const t = window.setInterval(loadMeta, 20000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = toastId.current++;
    setToasts((prev) => [...prev, { ...t, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const login = useCallback(async (loginId: string, pw: string) => {
    const res = await api.login(loginId, pw);
    setToken(res.token);
    setUser(res.user);
    navigate('/');
  }, [navigate]);

  const register = useCallback(async (data: { login: string; nick: string; password: string; email?: string }) => {
    const res = await api.register(data);
    setToken(res.token);
    setUser(res.user);
    navigate('/');
  }, [navigate]);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setToken(null);
    setUser(null);
    navigate('/');
  }, [navigate]);

  const toggleSound = useCallback(() => {
    const next = !sound.enabled;
    sound.setEnabled(next);
    setSoundOn(next);
    localStorage.setItem('ggpoker.sound', next ? '1' : '0');
  }, []);

  const value = useMemo<AppState>(() => ({
    user, loading, route, navigate, login, register, logout, refreshUser, setUser,
    toasts, toast, dismissToast, soundOn, toggleSound, animations,
    setAnimations: (v: boolean) => { setAnimations(v); localStorage.setItem('ggpoker.animations', v ? '1' : '0'); },
    openingTable, setOpeningTable, meta, brand, refreshBrand, splashDone,
  }), [user, loading, route, navigate, login, register, logout, refreshUser, toasts, toast, dismissToast, soundOn, toggleSound, animations, openingTable, meta, brand, refreshBrand, splashDone]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
