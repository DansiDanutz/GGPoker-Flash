import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, chips, GAME_LABEL, LobbyTable, money, User } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { AppHeader, GameTabs } from '../components/AppHeader';
import { TitleBar } from '../components/TitleBar';
import { Avatar } from '../components/Avatar';
import { WaitlistSideActions } from '../components/WaitlistSideActions';
import { waitCount } from '../lib/waitlist';
import { DEFAULT_TAB_FILTERS, filterTables, filtersForTab, pillsFor, FilterPrefs, readFilterPrefs, resetExtraFilters, sortTables, SortKey, TabFilters, UNAVAILABLE_TABS, withTabFilters, writeFilterPrefs } from '../lib/lobbyFilters';
import { LobbyPills } from '../components/LobbyPills';
import { LobbyFiltersPopover } from '../components/LobbyFiltersPopover';
import { LobbyGroupRows } from '../components/LobbyGroupRows';
import { RushPoolRows } from '../components/RushPoolRow';
import { RushInfoDialog, RushSidePanel } from '../components/RushSidePanel';
import { SpinInfoPanel } from '../components/SpinInfoPanel';
import { visiblePools } from '../lib/rushPools';
import { previewSeats } from '../lib/lobbyPreview';
import { CASHDROP_RULE_LABEL, cashDropRateLabel } from '../lib/cashDrop';
import { HERO_INTERVAL_MS, HERO_SLIDES, HomeTarget, PROMO_CARDS, stepSlide, suggestedTable } from '../lib/homeContent';
import { useIsPhone } from '../lib/useIsPhone';
import { MOBILE_GAMES } from '../lib/mobileLobby';
import { MobileHome } from '../components/mobile/MobileHome';
import { MobileBackBar, MobileGameList } from '../components/mobile/MobileGameList';
import { MobileTableRows } from '../components/mobile/MobileTableRows';
import { buyinStep, stepBuyin } from '../lib/phoneTables';
import { MobileShell } from '../components/mobile/MobileShell';
import { HomeFeed } from '../components/home/HomeFeed';
import { CashHero } from '../components/CashHero';
import { SpinLobby } from '../components/SpinLobby';
import { BattleLobby } from '../components/BattleLobby';
import { AccountRail } from '../components/AccountRail';
import { GameInfoDrawer } from '../components/GameInfoDrawer';
import { SeatedPlayersList } from '../components/SeatedPlayersList';
import { gameRules } from '../lib/gameRules';
import { PROMO_ART } from '../lib/promoArt';
import { marketplaceApi, type ManagementAccount } from '../lib/marketplace-api';
import { ManagementAccessNotice } from '../components/ManagementPlugins';
import { organizerBillingApi, type OrganizerBillingConfig } from '../lib/organizer-billing-api';
import { cashChips } from '../lib/organizer-chips-api';

const PREVIEW_SEATS = [
  { x: 50, y: 8 }, { x: 10, y: 30 }, { x: 90, y: 30 },
  { x: 12, y: 74 }, { x: 88, y: 74 }, { x: 50, y: 92 },
];

function MiniTable({ table, players }: { table: LobbyTable | null; players: { name: string; stack: number; empty?: boolean; seat: number }[] }) {
  if (!table) {
    return <div className="mini-table"><div className="buyin-range">Select a table<br /><b>to preview</b></div></div>;
  }
  return (
    <div className="mini-table">
      <div className="mini-arrows" style={{ left: '50%', top: 6, transform: 'translateX(-50%)' }}>▼</div>
      <div className="mini-arrows" style={{ left: '50%', bottom: 4, transform: 'translateX(-50%)' }}>▲</div>
      <div className="buyin-range">
        Buy-in Range<br /><b>{table.chip_economy ? `${table.min_buyin.toLocaleString()} - ${cashChips(table.max_buyin)}` : `${money(table.min_buyin, true)} - ${money(table.max_buyin, true)}`}</b>
      </div>
      {PREVIEW_SEATS.map((pos, i) => {
        const p = players[i];
        return (
          <div
            key={i}
            className={'mini-seat' + (p && !p.empty ? '' : ' empty')}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%,-50%)' }}
          >
            {p && !p.empty ? <Avatar name={p.name} size={30} /> : null}
            {p && !p.empty && <><div className="nm">{p.name}</div><div className="st">{chips(p.stack)}</div></>}
          </div>
        );
      })}
      <div style={{ position: 'absolute', right: 10, top: 42, width: 18, height: 18, borderRadius: '50%', background: 'radial-gradient(#f6f2e8,#cfc6b2)', color: '#222', fontSize: 9, fontWeight: 900, display: 'grid', placeItems: 'center' }}>D</div>
      <div style={{ position: 'absolute', left: 14, top: 44, background: '#1d4b8f', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 2 }}>SB</div>
      <div style={{ position: 'absolute', right: 26, top: 52, background: '#1d4b8f', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 2 }}>BB</div>
    </div>
  );
}

function fmtStakes(t: LobbyTable) {
  return t.chip_economy ? `${t.sb.toLocaleString()} / ${cashChips(t.bb)}` : `${money(t.sb, true)} / ${money(t.bb, true)}`;
}

function tableAmount(t: LobbyTable, amount: number) {
  return t.chip_economy ? cashChips(amount) : money(amount);
}

/** `?game=<tab>` picks a lobby tab; plain `?play=1` means Hold'em (the phone shows its game list first). */
function playRouteTab(route: string): string | null {
  const q = new URLSearchParams(route.split('?')[1] || '');
  const game = q.get('game');
  if (game && MOBILE_GAMES.some((g) => g.key === game)) return game;
  return q.get('play') === '1' ? null : 'home';
}

export function Lobby() {
  const { user, route, navigate, toast, refreshUser, setOpeningTable } = useApp();
  const isPhone = useIsPhone();
  const [data, setData] = useState<any>(null);
  const [gameTab, setGameTab] = useState(playRouteTab(route) ?? 'holdem');
  const [selected, setSelected] = useState<string | null>(null);
  const [buyinTable, setBuyinTable] = useState<LobbyTable | null>(null);
  const [buyin, setBuyin] = useState(0);
  const [seat, setSeat] = useState<number | null>(null);
  const [rushInfoOpen, setRushInfoOpen] = useState(false);
  const [gameInfoOpen, setGameInfoOpen] = useState(false);
  const hostQuery = new URLSearchParams(route.split('?')[1] || '').get('host');
  const [hostOpen, setHostOpen] = useState(Boolean(user && hostQuery));
  const [hostEconomy, setHostEconomy] = useState<'play_money' | 'organizer'>(new URLSearchParams(route.split('?')[1] || '').get('economy') === 'organizer' ? 'organizer' : 'play_money');
  const hostPlayMoney = hostEconomy === 'play_money';
  const [hostBusy, setHostBusy] = useState(false);
  const [hostForm, setHostForm] = useState({ name: '', game: 'holdem', seats: 6, sb: 200, bb: 400, min_buyin: 8000, max_buyin: 40000, bombPot: false });
  const [hostRake, setHostRake] = useState({ rakePercent: 5, rakeCap: 300 });
  const [myHosts, setMyHosts] = useState<any[]>([]);
  const [myTourneys, setMyTourneys] = useState<any[]>([]);
  const [hostKind, setHostKind] = useState<'cash' | 'tournament' | 'spin'>(hostQuery === 'spin' || hostQuery === 'tournament' ? hostQuery : 'cash');
  const [hostSpinForm, setHostSpinForm] = useState({ name: '', stake: 5000, start_at: '' });
  const [hostBilling, setHostBilling] = useState<OrganizerBillingConfig | null>(null);
  const hostKeys = useRef(new Map<string, string>());
  const [hostManagement, setHostManagement] = useState<ManagementAccount | null>(null);
  const [hostAccessLoading, setHostAccessLoading] = useState(false);
  const [hostAccessError, setHostAccessError] = useState('');
  const [hostAccessRetry, setHostAccessRetry] = useState(0);
  const [hostListError, setHostListError] = useState('');
  const hostDialogRef = useRef<HTMLDivElement>(null);
  const [hostTourneyForm, setHostTourneyForm] = useState({ name: '', format: 'NLH', buyin: 1000, fee: 100, gtd: 0, starting_stack: 10000, blind_speed: 8, late_reg: 90, mode: 'STANDARD', bounty: 0, ticket: '', start_at: new Date(Date.now() + 3600000).toISOString().slice(0, 16) });
  const [viewMode, setViewMode] = useState<'table' | 'group'>('table');
  const [promoIdx, setPromoIdx] = useState(0);
  const [promoPaused, setPromoPaused] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('bb');
  const [sortDir, setSortDir] = useState<1|-1>(-1);
  const [filterPrefs, setFilterPrefs] = useState<FilterPrefs>(readFilterPrefs);
  const filters = filtersForTab(filterPrefs, gameTab);
  const setFilter = (patch: Partial<TabFilters>) => setFilterPrefs((prev) => {
    const next = withTabFilters(prev, gameTab, patch);
    writeFilterPrefs(next);
    return next;
  });
  const [favs, setFavs] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('ggpoker.favs') || '[]'); } catch { return []; } });
  const [loading, setLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<any[]>([]);
  const [chatText, setChatText] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<any[]>([]);
  const timer = useRef<number | null>(null);

  const load = async () => {
    try {
      const d = await api.lobby();
      setData(d);
      if (!selected && d.tables.length) {
        const first = d.tables.find((t: LobbyTable) => t.game === 'holdem') || d.tables[0];
        setSelected(first.id);
      }
    } catch (e: any) {
      toast({ kind: 'error', title: 'Connection problem', body: e.message });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!notifOpen) return;
    api.notifications().then((r) => { setNotifItems(r.items || []); if (r.items?.length) api.markNotificationsRead(r.items.map((i: any) => i.key)).catch(() => {}); }).catch(() => setNotifItems([]));
  }, [notifOpen]);

  useEffect(() => {
    load();
    timer.current = window.setInterval(load, 12000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, []);

  useEffect(() => {
    if (gameTab !== 'home' || promoPaused) return;
    const id = window.setInterval(() => setPromoIdx((i) => stepSlide(i, 1, HERO_SLIDES.length)), HERO_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [gameTab, promoPaused]);

  useEffect(() => {
    setGameTab(playRouteTab(route) ?? 'holdem');
  }, [route]);


  const tables: LobbyTable[] = useMemo(() => {
    if (!data) return [];
    const list = filterTables(data.tables, { ...filters, tab: gameTab, favs });
    return sortTables(list, gameTab, sortKey, sortDir);
  }, [data, gameTab, sortKey, sortDir, filterPrefs, favs]);
  // Watched tables behind the DanGG.TV row: busiest public tables, best first.
  const liveStreams = useMemo(() => [...tables].filter((t) => !t.private).sort((a, b) => b.players - a.players).slice(0, 4), [tables]);

  useEffect(() => {
    if (tables.length && !tables.find((t) => t.id === selected)) setSelected(tables[0].id);
  }, [tables]);

  const isRushTab = gameTab === 'rush';
  const rushPools = useMemo(() => (isRushTab ? visiblePools(data?.rushPools || [], tables) : []), [isRushTab, data, tables]);
  // A capture-gated tab (Battle Royale) shows an honest empty state: no rows, no Join.
  const unavailable = UNAVAILABLE_TABS[gameTab];
  const table = unavailable ? null : data?.tables.find((t: LobbyTable) => t.id === selected) || null;
  const hasRules = !['home', 'spin', 'battle'].includes(gameTab) && !unavailable;
  // Real seated players from the live table (empty chairs when nobody sits there).
  const previewPlayers = useMemo(() => (table ? previewSeats(table.seated, PREVIEW_SEATS.length) : []), [table]);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem('ggpoker.favs', JSON.stringify(next));
      return next;
    });
  };

  const jumpBackIn = useMemo(() => (data ? suggestedTable<LobbyTable>(data.tables) : null), [data]);

  const openHomeTarget = (target: HomeTarget) => {
    sound.play('click', { volume: .6 });
    if ('tab' in target) setGameTab(target.tab);
    else navigate(target.route);
  };

  const openHost = () => { setHostManagement(null); setHostAccessLoading(true); setHostAccessError(''); setHostOpen(true); };
  useEffect(() => {
    if (!hostOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => hostDialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setHostOpen(false); return; }
      if (event.key !== 'Tab' || !hostDialogRef.current) return;
      const fields = Array.from(hostDialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
      const first = fields[0]; const last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('keydown', onKeyDown); if (previous?.isConnected) previous.focus(); };
  }, [hostOpen]);
  useEffect(() => {
    if (!hostOpen) return;
    let cancelled = false;
    setHostAccessLoading(true); setHostManagement(null); setHostAccessError(''); setHostListError('');
    setMyHosts([]); setMyTourneys([]); setHostBilling(null);
    organizerBillingApi.config().then((result) => { if (!cancelled) setHostBilling(result); })
      .catch(() => { if (!cancelled) { setHostBilling(null); setHostAccessError('Cannot load service prices. Retry before creating a resource.'); } });
    marketplaceApi.managementMine().then((result) => { if (!cancelled) setHostManagement(result); })
      .catch((error: unknown) => { if (!cancelled) setHostAccessError(error instanceof Error ? error.message : 'Cannot check management access.'); })
      .finally(() => { if (!cancelled) setHostAccessLoading(false); });
    Promise.allSettled([api.hostTables(), api.hostTournaments()]).then(([tablesResult, eventsResult]) => {
      if (cancelled) return;
      if (tablesResult.status === 'fulfilled') setMyHosts(tablesResult.value.tables || []);
      if (eventsResult.status === 'fulfilled') setMyTourneys(eventsResult.value.tournaments || []);
      if (tablesResult.status === 'rejected' || eventsResult.status === 'rejected') setHostListError('Some of your existing games could not be loaded. Try again to refresh the list.');
    });
    return () => { cancelled = true; };
  }, [hostOpen, user?.id, hostAccessRetry]);
  const hostProductId = hostKind === 'spin' ? 'spin-and-go-manager' : hostKind === 'tournament' ? 'tournaments-manager' : 'cash-games-manager';
  const hostAccess = hostManagement?.access.find((entry) => entry.product_id === hostProductId);
  const hostCanManage = hostPlayMoney || !hostAccessLoading && !hostAccessError && hostBilling !== null && Boolean(hostAccess?.can_manage);
  const hostUsesChips = !hostPlayMoney && hostBilling?.chip_mode === 'enforce';

  const requestKey = (payload: object) => {
    const identity = JSON.stringify(payload);
    const existing = hostKeys.current.get(identity);
    if (existing) return { identity, key: existing };
    const key = crypto.randomUUID(); hostKeys.current.set(identity, key); return { identity, key };
  };

  const copyHostLink = async (id: string) => {
    const link = `${location.origin}/#/table/${id}?observe=1`;
    try { await navigator.clipboard.writeText(link); toast({ kind: 'success', title: 'Invite link copied', body: link }); }
    catch { toast({ kind: 'info', title: 'Copy this link', body: link }); }
  };

  const deleteHost = async (id: string) => {
    if (!window.confirm('Delete this private table?')) return;
    try { await api.deleteHostTable(id); setMyHosts((rows) => rows.filter((r) => r.id !== id)); toast({ kind: 'success', title: 'Private table deleted' }); await load(); }
    catch (e: any) { toast({ kind: 'error', title: 'Cannot delete table', body: e.message }); }
  };

  // Phones have no hover and no reliable double-click: one tap on a row opens
  // the buy-in sheet, the same way the desktop right-hand Join button does.
  const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches;

  const openJoin = (t: LobbyTable) => {
    sound.play('click', { volume: .6 });
    setBuyinTable(t);
    const pct = Math.max(0, Math.min(100, Number(localStorage.getItem('ggpoker.buyinPct') || 0)));
    const preferred = pct > 0 ? Math.round((t.max_buyin * pct) / 100 / 100) * 100 : t.min_buyin;
    const amount = Math.max(t.min_buyin, Math.min(t.max_buyin, preferred));
    setBuyin(amount);
    setSeat(null);
    if (localStorage.getItem('ggpoker.autoBuyin') === '1' && user && user.balance >= amount) {
      if (localStorage.getItem('ggpoker.newWindowTables') === '1') {
        window.open(`${location.origin}/#/table/${t.id}?buyin=${amount}`, '_blank', 'width=1200,height=961');
      } else {
        setOpeningTable(t.id);
        navigate(`/table/${t.id}?buyin=${amount}`);
      }
    }
  };

  const confirmJoin = async () => {
    if (!buyinTable) return;
    if (!user) { navigate('/login'); return; }
    if (user.balance < buyin) {
      toast({ kind: 'error', title: 'Not enough balance', body: 'Visit the cashier to top up your play balance.' });
      return;
    }
    const url = `${location.origin}/#/table/${buyinTable.id}?buyin=${buyin}${seat != null ? `&seat=${seat}` : ''}`;
    if (localStorage.getItem('ggpoker.newWindowTables') === '1') {
      window.open(url, '_blank', 'width=1200,height=961');
      setBuyinTable(null);
      setOpeningTable(null);
    } else {
      setOpeningTable(buyinTable.id);
      setBuyinTable(null);
      navigate(`/table/${buyinTable.id}?buyin=${buyin}${seat != null ? `&seat=${seat}` : ''}`);
    }
  };

  const createHost = async () => {
    if (hostBusy || !hostCanManage) return;
    const payload = { economy: hostEconomy, ...hostForm, ...((hostPlayMoney || hostUsesChips) ? hostRake : {}), name: hostForm.name.trim() || `${user?.nick || 'My'} table` };
    if (!hostPlayMoney && hostBilling?.mode === 'enforce' && !window.confirm(`Create “${payload.name}” paused and debit $${(hostBilling.tariffs.cash_setup / 100).toFixed(2)} setup credits? Active hours cost $5 down to $1, paid upfront, based on your lifetime paid table-hours. Check your next-hour price in Organiser.`)) return;
    const replay = requestKey(payload);
    setHostBusy(true);
    try {
      const r = await api.hostTable({ ...payload, idempotencyKey: replay.key });
      hostKeys.current.delete(replay.identity);
      toast({ kind: 'success', title: 'Private table created', body: !hostPlayMoney && hostBilling?.mode === 'enforce' ? 'The table is paused. Start and manage billing in Organiser.' : 'Share the table link or take a seat now.' });
      setHostOpen(false);
      await load();
      navigate(!hostPlayMoney && hostBilling?.mode === 'enforce' ? '/organiser' : `/table/${r.id}?buyin=${hostForm.min_buyin}`);
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not host table', body: e.message });
    } finally { setHostBusy(false); }
  };

  const createHostTournament = async () => {
    if (hostBusy || !hostCanManage) return;
    if (!hostPlayMoney && hostBilling?.mode === 'enforce' && hostTourneyForm.mode === 'SATELLITE') { toast({ kind: 'error', title: 'Cash Chip satellites are not available', body: 'A satellite must first be bound to a target tournament.' }); return; }
    if (!Number.isFinite(Date.parse(hostTourneyForm.start_at))) { toast({ kind: 'error', title: 'Choose a valid tournament start time' }); return; }
    const payload = { economy: hostEconomy, ...hostTourneyForm, start_at: new Date(hostTourneyForm.start_at).toISOString() };
    if (!hostPlayMoney && hostBilling?.mode === 'enforce' && !window.confirm(`Create tournament “${payload.name || `${user?.nick || 'My'} tournament`}” and debit $${(hostBilling.tariffs.tournament_setup / 100).toFixed(2)} setup credits?`)) return;
    const replay = requestKey(payload);
    setHostBusy(true);
    try {
      const r = await api.hostTournament({ ...payload, idempotencyKey: replay.key });
      hostKeys.current.delete(replay.identity);
      toast({ kind: 'success', title: 'Private tournament created', body: 'Copy the invite link or open the event.' });
      setHostOpen(false);
      navigate(`/tournaments?id=${r.id}`);
    } catch (e: any) {
      toast({ kind: 'error', title: 'Could not host tournament', body: e.message });
    } finally { setHostBusy(false); }
  };

  const createHostSpin = async () => {
    if (hostBusy || !hostCanManage) return;
    if (hostSpinForm.start_at && !Number.isFinite(Date.parse(hostSpinForm.start_at))) { toast({ kind: 'error', title: 'Choose a valid Spin start time' }); return; }
    const payload = { economy: hostEconomy, name: hostSpinForm.name.trim() || `${user?.nick || 'My'} Spin & Go`, game: 'spingold', seats: 3, sb: 10, bb: 20, min_buyin: hostSpinForm.stake, max_buyin: hostSpinForm.stake, ...(hostSpinForm.start_at ? { start_at: new Date(hostSpinForm.start_at).toISOString() } : {}) };
    if (!hostPlayMoney && hostBilling?.mode === 'enforce' && !window.confirm(`Create Spin & Go “${payload.name}” and debit $${(hostBilling.tariffs.spin_setup / 100).toFixed(2)} setup credits${hostSpinForm.start_at ? ` for ${new Date(hostSpinForm.start_at).toLocaleString()}` : ''}?`)) return;
    const replay = requestKey(payload);
    setHostBusy(true);
    try {
      const result = await api.hostTable({ ...payload, idempotencyKey: replay.key });
      hostKeys.current.delete(replay.identity);
      toast({ kind: 'success', title: 'Private Spin & Go created', body: 'Invite three players to start the play-money game.' });
      setHostOpen(false);
      await load();
      navigate(`/table/${result.id}?buyin=${hostSpinForm.stake}`);
    } catch (error: unknown) {
      toast({ kind: 'error', title: 'Could not host Spin & Go', body: error instanceof Error ? error.message : 'Please try again.' });
    } finally { setHostBusy(false); }
  };

  const copyTourneyLink = async (id: string) => {
    const link = `${location.origin}/#/tournaments?id=${id}`;
    try { await navigator.clipboard.writeText(link); toast({ kind: 'success', title: 'Tournament invite copied', body: link }); }
    catch { toast({ kind: 'info', title: 'Copy this link', body: link }); }
  };

  const deleteHostTournament = async (id: string) => {
    if (!window.confirm('Delete this private tournament?')) return;
    try { await api.deleteHostTournament(id); setMyTourneys((rows) => rows.filter((r) => r.id !== id)); toast({ kind: 'success', title: 'Private tournament deleted' }); }
    catch (e: any) { toast({ kind: 'error', title: 'Cannot delete tournament', body: e.message }); }
  };

  const loadChat = async () => {
    try {
      const r = await fetch('/api/chat');
      const d = await r.json();
      setChatMsgs(d.messages || []);
    } catch { /* ignore */ }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    if (!user) { navigate('/login'); return; }
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` },
        body: JSON.stringify({ message: chatText }),
      });
      if (!r.ok) throw new Error('send failed');
      setChatText(''); await loadChat();
    } catch (err: any) { toast({ kind: 'error', title: 'Chat', body: err.message }); }
  };

  if (loading) {
    // A phone must never flash the desktop chrome while the lobby loads.
    if (isPhone) {
      return (
        <MobileShell showBrand>
          <div className="p-loading" aria-live="polite">Loading your lobby…</div>
        </MobileShell>
      );
    }
    return (
      <>
        <TitleBar online={192203} />
        <AppHeader online={192203} jackpot={199026635} user={user} activeTop="poker" />
        <div className="empty-state">Loading lobby…</div>
      </>
    );
  }

  const online = data?.online || 192203;
  // Phone shell: Home and the Poker game list replace the desktop lobby; a picked game keeps the table list.
  const phoneView = !isPhone ? null : gameTab === 'home' ? 'home' : playRouteTab(route) === null ? 'games' : 'tables';
  const pickGame = (tab: string) => { sound.play('click', { volume: .6 }); navigate(`/?play=1&game=${tab}`); };
  const phoneGameTitle = MOBILE_GAMES.find((g) => g.key === gameTab)?.label || 'Tables';

  return (
    <>
      {!phoneView && <>
        <TitleBar online={online} unread={user ? 3 : 0} onOpenChat={() => { setChatOpen(true); loadChat(); }} onOpenNotifications={() => setNotifOpen(true)} />
        <AppHeader online={online} jackpot={data?.jackpot || 199026635} user={user} activeTop="poker" />
        <GameTabs active={gameTab} onChange={(k) => { setGameTab(k); }} />
      </>}
      {phoneView === 'home' && (
        <MobileHome
          tables={data?.tables || []}
          online={online}
          jackpot={data?.jackpot || 199026635}
          jumpBackIn={jumpBackIn}
          gameLabel={(t) => GAME_LABEL[t.game]}
          onJoin={openJoin}
          onTarget={(target) => ('tab' in target ? pickGame(target.tab) : openHomeTarget(target))}
        />
      )}
      {phoneView === 'games' && <MobileShell showBrand><MobileGameList tables={data?.tables || []} onPick={pickGame} /></MobileShell>}
      {phoneView === 'tables' && <MobileBackBar title={phoneGameTitle} onBack={() => navigate('/?play=1')} />}
      {(!phoneView || phoneView === 'tables') && <div className={'lobby-content' + (gameTab === 'home' ? ' is-home' : '')}>
        <aside className="lobby-left" aria-label="Poker navigation">
          <div className="ll-label">POKER</div>
          <button className="ll-item on" aria-current="page" onClick={() => navigate('/')}><span className="ll-mark" />Game Lobby</button>
          <button className="ll-item" onClick={() => navigate('/rewards')}><span className="ll-mark" />Daily Challenge</button>
          <button className="ll-item" onClick={() => navigate('/leaderboard')}><span className="ll-mark" />Daily Leaderboard</button>
          <button className="ll-item" onClick={() => navigate('/tournaments')}><span className="ll-mark" />Millionaires Club</button>
          <button className="ll-item" onClick={() => navigate('/elo')}><span className="ll-mark" />ELO Rating</button>
          <button className="ll-item" onClick={() => navigate('/elo?challenge=1')}><span className="ll-mark" />ELO Challenge</button>
          <button className="ll-item ll-live" onClick={() => navigate('/casino')}><span className="ll-live-dot" />LIVE</button>
          <button className="ll-item ll-play" onClick={() => setGameTab('holdem')}><span className="ll-mark" />Play Money</button>
        </aside>
        <div className="lobby-main">
          {gameInfoOpen && hasRules && <GameInfoDrawer game={gameTab} table={table} onClose={() => setGameInfoOpen(false)} />}
          {gameTab === 'rush' && (
            <div className="rush-hero">
              <div className="rush-hero-bg" style={{ backgroundImage: `url('${PROMO_ART.fastfold}')` }} />
              <div className="rush-hero-copy">
                <small>FAST FOLD</small>
                <b>Fold. Move. Play again.</b>
                <span>Quick-fold to a fresh table with the same stack. Look out for Cash Drops.</span>
              </div>
              <div className="rush-hero-stats">
                <div><b>{rushPools.reduce((n, p) => n + p.players, 0)}</b><span>players</span></div>
                <div><b>{rushPools.length}</b><span>pools</span></div>
                <div title={CASHDROP_RULE_LABEL}><b>{cashDropRateLabel(data?.rushCashDrop?.rate)}</b><span>drop chance · {CASHDROP_RULE_LABEL}</span></div>
              </div>
            </div>
          )}
          {gameTab === 'home' && (
            <HomeFeed tables={tables} online={online} onTarget={openHomeTarget} onJoin={openJoin} />
          )}
          {gameTab !== 'home' && gameTab !== 'rush' && gameTab !== 'spin' && gameTab !== 'battle' && <CashHero jackpot={data?.jackpot || 199026635} onGame={setGameTab} />}
          {gameTab === 'battle' ? (
            <BattleLobby />
          ) : gameTab === 'spin' ? (
            <SpinLobby tables={tables} onJoin={openJoin} />
          ) : (
            <>
            <div className="filter-bar" hidden={gameTab === 'home'}>
              {!pillsFor(gameTab).length && <span className="filter-label">Tables</span>}
              <LobbyPills tab={gameTab} value={filters.pill} onChange={(pill) => setFilter({ pill })} />
              <span className="filter-spacer" />
              <button className="host-table-btn" onClick={openHost}>+ Host</button>
              <LobbyFiltersPopover filters={filters} tableCount={tables.length} onChange={setFilter} onReset={() => setFilter(resetExtraFilters(filters))} />
            </div>
            <div className="table-list" key={gameTab}>
              {viewMode === 'table' && !isRushTab && !unavailable && phoneView !== 'tables' && <div className="list-head">
                <div onClick={() => { setSortKey('name'); setSortDir(sortKey === 'name' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}>Table Name</div>
                <div onClick={() => { setSortKey('bb'); setSortDir(sortKey === 'bb' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}>Stakes</div>
                <div>Buy-in</div>
                <div onClick={() => { setSortKey('players'); setSortDir(sortKey === 'players' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}><span title="Seated players now, bots included">Players</span></div>
                <div>Wait</div>
                <div onClick={() => { setSortKey('avgPot'); setSortDir(sortKey === 'avgPot' ? (sortDir === 1 ? -1 : 1) : 1); }} style={{ cursor: 'pointer' }}><span title="Average pot over the last 20 hands">AvgPot</span></div>
                <div title="Voluntarily put chips in preflop, last 20 hands">VPIP%</div><div title="Hands dealt in the last hour">H/hr</div>
              </div>}
              <div className="list-scroll">
                {unavailable ? (
                  <div className="list-empty" role="status">
                    <strong>{unavailable.title}</strong>
                    <div>{unavailable.detail}</div>
                  </div>
                ) : isRushTab ? (
                  <RushPoolRows pools={rushPools} allTables={data?.tables || []} selectedId={selected} onSelect={setSelected} onJoin={openJoin} onChanged={load} />
                ) : phoneView === 'tables' ? (
                  <MobileTableRows tables={tables} onJoin={openJoin} />
                ) : viewMode === 'group' ? (
                  <LobbyGroupRows tab={gameTab} tables={tables} allTables={data?.tables || []} selectedId={selected} onSelect={setSelected} onJoin={openJoin} onChanged={load} />
                ) : tables.map((t) => (
                  <div
                    key={t.id}
                    className={'table-row game-' + t.game + (selected === t.id ? ' selected' : '')}
                    onClick={() => { setSelected(t.id); if (coarsePointer()) openJoin(t); }}
                    onDoubleClick={() => openJoin(t)}
                  >
                    <div className="name">
                      <button className={'fav-star' + (favs.includes(t.id) ? ' on' : '')} onClick={(e) => { e.stopPropagation(); toggleFav(t.id); }} title="Favourite">★</button>
                      <span className={'chip-dot ' + t.category.toLowerCase()} />
                      <span>{t.name}</span>
                      {t.pro && <span className="tag pro">PRO</span>}
                    </div>
                    <div className="c-stakes">{fmtStakes(t)}</div>
                    <div className="c-buyin">{t.chip_economy ? t.min_buyin.toLocaleString() : money(t.min_buyin, true)}</div>
                    <div className="player-bars">
                      {Array.from({ length: t.seats }).map((_, i) => (
                        <i key={i} className={i < t.players ? 'on' : ''} />
                      ))}
                    </div>
                    <div className={'wait-cell' + (waitCount(t) ? ' has-wait' : '')}>{t.myWait ? <i className="queued-dot" title={`You are #${t.myWait}`} aria-label={`You are #${t.myWait} on the waiting list`} /> : null}{waitCount(t)}</div>
                    <div className={t.avgPot ? 'c-pot' : 'zero'}>{t.avgPot ? (t.chip_economy ? t.avgPot.toLocaleString() : money(t.avgPot, true)) : '-'}</div>
                    <div className={t.vpip ? '' : 'zero'}>{t.vpip ? t.vpip + '%' : '-'}</div>
                    <div className={t.handsPerHour ? '' : 'zero'}>{t.handsPerHour || '-'}</div>
                  </div>
                ))}
                {!tables.length && !unavailable && (
                  <div className="list-empty">No tables match these filters.{' '}
                    <button type="button" className="lob-link" onClick={() => setFilter(DEFAULT_TAB_FILTERS)}>Reset filters</button>
                  </div>
                )}
              </div>
            </div>
            </>
          )}
        </div>

        {gameTab !== 'battle' && <div className="lobby-side">
          {!unavailable && (
            <>
              <div className="view-toggle">
                <button className={viewMode === 'group' ? 'on' : ''} onClick={() => setViewMode('group')}>Group View</button>
                <button className={viewMode === 'table' ? 'on' : ''} onClick={() => setViewMode('table')}>Table View</button>
              </div>
              <div className="mini-table-wrap">
                <MiniTable table={table} players={previewPlayers} />
              </div>
              <WaitlistSideActions table={table} onJoin={openJoin} onWatch={(t) => navigate(`/table/${t.id}?observe=1`)} onChanged={load} />
              {!isRushTab && gameTab !== 'spin' && <SeatedPlayersList table={table} />}
              {hasRules && (
                <button type="button" className="gi-link" aria-expanded={gameInfoOpen} onClick={() => setGameInfoOpen((v) => !v)}>
                  {gameRules(gameTab, table).title} <span aria-hidden="true">ⓘ</span>
                </button>
              )}
            </>
          )}
          {isRushTab && <RushSidePanel leaderboard={data?.rushLeaderboard} myId={user?.id} onShowInfo={() => setRushInfoOpen(true)} />}
          {gameTab === 'spin' && <SpinInfoPanel buyIn={table && table.game === 'spingold' ? table.min_buyin : null} formatChips={(n) => money(n)} />}
          {!isRushTab && gameTab !== 'spin' && <div className="mini-stats">
            <div className="between"><span className="muted small">Last jackpot</span><b className="gold">{money(data?.jackpot || 0)}</b></div>
            {(data?.recentWinners || []).slice(0, 3).map((w: any, i: number) => (
              <div key={i} className="between"><span className="muted small">{w.nick}</span><span className="small">{money(w.amount)}</span></div>
            ))}
          </div>}
          <div style={{ flex: 1 }} />
          <div style={{ padding: '6px 8px', fontSize: 11, color: '#777', borderTop: '1px solid #222' }}>
            {table ? GAME_LABEL[table.game] : ''} · {table ? table.speed : ''}
          </div>
        </div>}

        <AccountRail />
      </div>}

      {rushInfoOpen && <RushInfoDialog cashDrop={data?.rushCashDrop} onClose={() => setRushInfoOpen(false)} />}

      {notifOpen && (
        <div className="modal-backdrop" onClick={() => setNotifOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Notifications</h3><button className="title-icon" onClick={() => setNotifOpen(false)}>✕</button></div>
            <div className="modal-body" style={{ padding: 0 }}>
              {notifItems.map((n: any, idx: number) => (
                <div key={n.kind + idx} className="list-row" style={{ borderRadius: 0 }} onClick={() => { setNotifOpen(false); navigate(n.link || '/'); }}>
                  <span style={{ fontSize: 20 }}>{n.icon}</span>
                  <div style={{ flex: 1 }}>
                    <b style={{ color: '#eee', fontSize: 13 }}>{n.title}</b>
                    <div className="muted small">{n.body}</div>
                  </div>
                  <span className="muted">›</span>
                </div>
              ))}
              {!notifItems.length && <div className="empty-state">You're all caught up.</div>}
            </div>
          </div>
        </div>
      )}

      {chatOpen && (
        <div className="modal-backdrop" onClick={() => setChatOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h3>Lobby chat</h3><button className="title-icon" onClick={() => setChatOpen(false)}>✕</button></div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div className="chat-log" style={{ maxHeight: 320, padding: 12 }}>
                {chatMsgs.map((m: any) => (
                  <div key={m.id}><b style={{ color: '#ffd98a' }}>{m.nick}:</b> <span style={{ color: '#ddd' }}>{m.message}</span>{' '}
                    <span className="muted" style={{ fontSize: 10 }}>{m.created_at?.slice(11, 16)}</span></div>
                ))}
                {!chatMsgs.length && <div className="muted">No messages yet. Say hello!</div>}
              </div>
              <form onSubmit={sendChat} className="chat-form" style={{ padding: 12 }}>
                <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder={user ? 'Message the lobby…' : 'Log in to chat'} style={{ flex: 1, height: 34, background: '#101010', border: '1px solid #333', borderRadius: 4, color: '#eee', padding: '0 10px' }} />
                <button className="btn btn-red btn-sm" type="submit">Send</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {buyinTable && (
        <div className="modal-backdrop buyin-backdrop" onClick={() => setBuyinTable(null)}>
          <div className="modal buyin-sheet" role="dialog" aria-modal="true" aria-label={`Buy-in, ${buyinTable.name}`} onClick={(e) => e.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            <div className="modal-head">
              <h3>Buy-in · {buyinTable.name}</h3>
              <button className="title-icon" onClick={() => setBuyinTable(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="between" style={{ marginBottom: 12 }}>
                <span className="muted">Stakes</span>
                <b>{fmtStakes(buyinTable)}</b>
              </div>
              <div className="between" style={{ marginBottom: 12 }}>
                <span className="muted">Table type</span>
                <b>{GAME_LABEL[buyinTable.game]} · {buyinTable.seats}-max</b>
              </div>
              <div className="field">
                <label>Preferred seat</label>
                <div className="seat-picker">
                  <button className={'seat-pick' + (seat == null ? ' on' : '')} onClick={() => setSeat(null)}>Any</button>
                  {Array.from({ length: buyinTable.seats }).map((_, i) => (
                    <button key={i} className={'seat-pick' + (seat === i ? ' on' : '')} onClick={() => setSeat(i)}>{i + 1}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Buy-in amount</label>
                <input
                  type="range"
                  min={buyinTable.min_buyin}
                  max={Math.min(buyinTable.max_buyin, Math.max(buyinTable.chip_economy ? (buyinTable.organizer_balance ?? buyinTable.max_buyin) : (user?.balance ?? buyinTable.min_buyin), buyinTable.min_buyin))}
                  step={buyinTable.chip_economy ? 1 : buyinStep(buyinTable)}
                  value={buyin}
                  onChange={(e) => setBuyin(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div className="between buyin-amount" style={{ margin: '10px 0 4px' }}>
                <span className="muted">Min {tableAmount(buyinTable, buyinTable.min_buyin)}</span>
                <span className="buyin-stepper">
                  <button type="button" aria-label="Lower buy-in" onClick={() => setBuyin(buyinTable.chip_economy ? Math.max(buyinTable.min_buyin, buyin - 1) : stepBuyin(buyinTable, buyin, -1, user?.balance))}>−</button>
                  <b style={{ color: '#ffd98a', fontSize: 18 }}>{tableAmount(buyinTable, buyin)}</b>
                  <button type="button" aria-label="Raise buy-in" onClick={() => setBuyin(buyinTable.chip_economy ? Math.min(buyinTable.max_buyin, buyin + 1) : stepBuyin(buyinTable, buyin, 1, user?.balance))}>+</button>
                </span>
                <span className="muted">Max {tableAmount(buyinTable, buyinTable.max_buyin)}</span>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <button key={f} className="btn btn-ghost btn-sm" onClick={() => { const amount = buyinTable.min_buyin + (buyinTable.max_buyin - buyinTable.min_buyin) * f; setBuyin(buyinTable.chip_economy ? Math.round(amount) : Math.round(amount / 100) * 100); }}>
                    {Math.round(f * 100)}%
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-dark" onClick={() => setBuyinTable(null)}>Cancel</button>
              <button className="btn btn-dark buyin-newwin" onClick={() => {
                if (!buyinTable) return;
                const url = `${location.origin}/#/table/${buyinTable.id}?buyin=${buyin}${seat != null ? `&seat=${seat}` : ''}`;
                window.open(url, '_blank', 'width=1200,height=961');
                setBuyinTable(null);
              }}>New window</button>
              <button className="btn btn-red" onClick={confirmJoin}>Take a seat · {tableAmount(buyinTable, buyin)}</button>
            </div>
          </div>
        </div>
      )}

      {hostOpen && (
        <div className="modal-backdrop" onClick={() => setHostOpen(false)}>
          <div ref={hostDialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="host-dialog-title" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: 'calc(100vw - 24px)' }}>
            <div className="modal-head"><h3 id="host-dialog-title">{hostKind === 'cash' ? 'Host a private table' : hostKind === 'spin' ? 'Host a private Spin & Go' : 'Host a private tournament'}</h3><button className="title-icon" aria-label="Close host dialog" onClick={() => setHostOpen(false)}>✕</button></div>
            <div className="modal-body">
              <div className="tabs-line" style={{ marginBottom: 12 }}>
                <button className={hostKind === 'cash' ? 'on' : ''} onClick={() => setHostKind('cash')}>Cash table</button>
                <button className={hostKind === 'tournament' ? 'on' : ''} onClick={() => setHostKind('tournament')}>Tournament</button>
                <button className={hostKind === 'spin' ? 'on' : ''} onClick={() => setHostKind('spin')}>Spin & Go</button>
              </div>
              <label className="admin-label" htmlFor="host-economy">Game economy</label><select id="host-economy" className="admin-select" value={hostEconomy} onChange={(e) => setHostEconomy(e.target.value as 'play_money' | 'organizer')}><option value="play_money">Play Money · free testing</option><option value="organizer">Organiser · paid services</option></select>
              {hostPlayMoney ? <p role="status">Free Play Money testing. No membership, service credits or organizer Cash Chips are used.</p> : <ManagementAccessNotice name={hostKind === 'cash' ? 'Cash Games Manager' : hostKind === 'spin' ? 'Spin & Go Manager' : 'Tournaments Manager'} access={hostAccess} mode={hostManagement?.mode} loading={hostAccessLoading} error={hostAccessError} onRetry={() => setHostAccessRetry((value) => value + 1)} onMarketplace={() => { setHostOpen(false); navigate('/marketplace'); }} />}
              {!hostPlayMoney && (hostBilling?.mode === 'enforce' ? <p className="muted small">Service-credit setup fee: {hostKind === 'cash' ? `$${(hostBilling.tariffs.cash_setup / 100).toFixed(2)}; the table is created paused, then costs $5 down to $1 per active hour, paid upfront, based on your lifetime paid table-hours.` : hostKind === 'tournament' ? `$${(hostBilling.tariffs.tournament_setup / 100).toFixed(2)}; later rescheduling costs $${(hostBilling.tariffs.reschedule / 100).toFixed(2)}.` : `$${(hostBilling.tariffs.spin_setup / 100).toFixed(2)}; later rescheduling costs $${(hostBilling.tariffs.reschedule / 100).toFixed(2)}.`} Manage the resource and balance in Marketplace.</p> : <p className="muted small">Service-credit billing is inactive on this installation; legacy hosting remains available.</p>)}
              {hostListError && <p className="mg-error" role="alert">{hostListError} <button type="button" className="mg-link" onClick={() => setHostAccessRetry((value) => value + 1)}>Try again</button></p>}
              {hostKind === 'cash' && (<>
                <p className="muted small" style={{ marginTop: 0 }}>{hostUsesChips ? 'Organizer Cash Chips only. Rake is deducted from eligible pots and burned; the cap is per hand.' : 'Local play-money table.'} Only you and players with the table link can see it.</p>
                {myHosts.some((entry) => entry.game !== 'spingold') && (
                  <div className="host-list">
                    <div className="panel-title" style={{ marginBottom: 4 }}>Your private tables</div>
                    {myHosts.filter((entry) => entry.game !== 'spingold').map((t) => (
                      <div key={t.id} className="host-row">
                        <div><b>{t.name}</b><span>{t.game} · {t.seats}-max · {t.chip_economy ? `${cashChips(t.sb)}/${cashChips(t.bb)}` : `${money(t.sb)}/${money(t.bb)}`}</span></div>
                        <button className="btn btn-ghost btn-sm" onClick={() => copyHostLink(t.id)}>Copy invite</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteHost(t.id)}>Delete</button>
                      </div>
                    ))}
                    <div style={{ height: 10 }} />
                  </div>
                )}
                <label className="admin-label">Table name</label>
                <input className="admin-input" style={{ width: '100%' }} placeholder={`${user?.nick || 'My'} table`} value={hostForm.name} onChange={(e) => setHostForm({ ...hostForm, name: e.target.value })} maxLength={40} />
                <div className="grid g2" style={{ marginTop: 10 }}>
                  <div><label className="admin-label">Game</label><select className="admin-select" style={{ width: '100%' }} value={hostForm.game} onChange={(e) => setHostForm({ ...hostForm, game: e.target.value })}><option value="holdem">No-limit Hold'em</option><option value="omaha">PLO 4</option><option value="omaha5">PLO 5</option><option value="omaha6">PLO 6</option><option value="shortdeck">Short Deck</option></select></div>
                  <div><label className="admin-label">Seats</label><input className="admin-input" type="number" min={2} max={9} value={hostForm.seats} onChange={(e) => setHostForm({ ...hostForm, seats: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Small blind ({hostUsesChips ? 'Cash Chips' : 'cents'})</label><input className="admin-input" type="number" min={1} value={hostForm.sb} onChange={(e) => setHostForm({ ...hostForm, sb: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Big blind ({hostUsesChips ? 'Cash Chips' : 'cents'})</label><input className="admin-input" type="number" min={2} value={hostForm.bb} onChange={(e) => setHostForm({ ...hostForm, bb: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Min buy-in ({hostUsesChips ? 'Cash Chips' : 'cents'})</label><input className="admin-input" type="number" min={1} value={hostForm.min_buyin} onChange={(e) => setHostForm({ ...hostForm, min_buyin: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Max buy-in ({hostUsesChips ? 'Cash Chips' : 'cents'})</label><input className="admin-input" type="number" min={1} value={hostForm.max_buyin} onChange={(e) => setHostForm({ ...hostForm, max_buyin: Number(e.target.value) })} /></div>
                  {(hostPlayMoney || hostUsesChips) && <>
                    <div><label className="admin-label" htmlFor="host-rake-percent">Rake (%)</label><select id="host-rake-percent" className="admin-select" value={hostRake.rakePercent} onChange={(e) => setHostRake({ ...hostRake, rakePercent: Number(e.target.value) })}>{[2, 3, 4, 5].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></div>
                    <div><label className="admin-label" htmlFor="host-rake-cap">Rake cap per hand ({hostPlayMoney ? 'Play Money cents' : 'Cash Chips'})</label><input id="host-rake-cap" className="admin-input" type="number" min={1} max={9000000000} step={1} required value={hostRake.rakeCap} onChange={(e) => setHostRake({ ...hostRake, rakeCap: Number(e.target.value) })} /></div>
                  </>}
                  <label className="switch-row" style={{ gridColumn: '1 / -1' }}><span>Bomb pot — everyone antes, action starts on the flop</span><input type="checkbox" checked={hostForm.bombPot} onChange={(e) => setHostForm({ ...hostForm, bombPot: e.target.checked })} /></label>
                </div>
                <p className="muted small">{hostUsesChips ? 'Stakes, buy-ins and the rake cap use whole Cash Chips belonging to this organizer.' : 'Stakes are stored in cents. Example: 200/400 = $2/$4.'} Max buy-in must be at least the minimum.</p>
              </>)}

              {hostKind === 'tournament' && (<>
                <p className="muted small" style={{ marginTop: 0 }}>Private freezeout. Registrants need the invite link.</p>
                {myTourneys.length > 0 && (
                  <div className="host-list">
                    <div className="panel-title" style={{ marginBottom: 4 }}>Your private tournaments</div>
                    {myTourneys.map((t) => (
                      <div key={t.id} className="host-row">
                        <div><b>{t.name}</b><span>{t.format} · {t.mode} · {new Date(t.start_at).toLocaleString('en-GB')}</span></div>
                        <button className="btn btn-ghost btn-sm" onClick={() => copyTourneyLink(t.id)}>Copy invite</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteHostTournament(t.id)}>Delete</button>
                      </div>
                    ))}
                    <div style={{ height: 10 }} />
                  </div>
                )}
                <label className="admin-label">Tournament name</label>
                <input className="admin-input" style={{ width: '100%' }} placeholder={`${user?.nick || 'My'} tournament`} value={hostTourneyForm.name} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, name: e.target.value })} maxLength={60} />
                <div className="grid g2" style={{ marginTop: 10 }}>
                  <div><label className="admin-label">Format</label><select className="admin-select" style={{ width: '100%' }} value={hostTourneyForm.format} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, format: e.target.value })}><option value="NLH">No-limit Hold'em</option><option value="PLO">Pot-limit Omaha</option><option value="Short Deck">Short Deck</option></select></div>
                  <div><label className="admin-label">Mode</label><select className="admin-select" style={{ width: '100%' }} value={hostTourneyForm.mode} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, mode: e.target.value })}><option>STANDARD</option><option>BOUNTY</option><option>MYSTERY</option>{hostBilling?.mode !== 'enforce' && <option>SATELLITE</option>}<option>FLIP</option></select></div>
                  <div><label className="admin-label">Buy-in ({hostBilling?.mode === 'enforce' ? 'Cash Chips' : 'cents'})</label><input className="admin-input" type="number" min={0} step={1} value={hostTourneyForm.buyin} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, buyin: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Fee ({hostBilling?.mode === 'enforce' ? 'Cash Chips' : 'cents'})</label><input className="admin-input" type="number" min={0} step={1} value={hostTourneyForm.fee} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, fee: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Starting stack</label><input className="admin-input" type="number" min={100} value={hostTourneyForm.starting_stack} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, starting_stack: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Blind speed (min)</label><input className="admin-input" type="number" min={1} max={120} value={hostTourneyForm.blind_speed} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, blind_speed: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Late registration (min)</label><input className="admin-input" type="number" min={0} max={600} value={hostTourneyForm.late_reg} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, late_reg: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Bounty ({hostBilling?.mode === 'enforce' ? 'Cash Chips' : 'cents'})</label><input className="admin-input" type="number" min={0} step={1} value={hostTourneyForm.bounty} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, bounty: Number(e.target.value) })} /></div>
                  <div><label className="admin-label">Start</label><input className="admin-input" type="datetime-local" value={hostTourneyForm.start_at} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, start_at: e.target.value })} /></div>
                  {hostBilling?.mode !== 'enforce' ? <div><label className="admin-label">Satellite ticket</label><input className="admin-input" value={hostTourneyForm.ticket} onChange={(e) => setHostTourneyForm({ ...hostTourneyForm, ticket: e.target.value })} placeholder="Target event" /></div> : <div className="muted small">Cash Chip satellites need a bound target event and are not available yet.</div>}
                </div>
                <p className="muted small">Freezeout starts when at least two players register at the start time.</p>
              </>)}

              {hostKind === 'spin' && <>
                <p className="muted small" style={{ marginTop: 0 }}>A private Jackpot Sit & Go using virtual play chips. The existing engine starts the game when three seats are filled.</p>
                {myHosts.some((entry) => entry.game === 'spingold') && <div className="host-list">
                  <div className="panel-title" style={{ marginBottom: 4 }}>Your private Spin & Go tables</div>
                  {myHosts.filter((entry) => entry.game === 'spingold').map((table) => <div key={table.id} className="host-row">
                    <div><b>{table.name}</b><span>3 players · {Number(table.min_buyin).toLocaleString('en-GB')} play chips</span></div>
                    <button className="btn btn-ghost btn-sm" onClick={() => copyHostLink(table.id)}>Copy invite</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteHost(table.id)}>Delete</button>
                  </div>)}
                </div>}
                <div className="mg-host-spin-details"><div><strong>3</strong><span>players per game</span></div><div><strong>Fixed</strong><span>play-chip buy-in</span></div><div><strong>Auto</strong><span>start when full</span></div></div>
                <label className="admin-label" htmlFor="host-spin-name">Table name</label>
                <input id="host-spin-name" className="admin-input" style={{ width: '100%' }} placeholder={`${user?.nick || 'My'} Spin & Go`} value={hostSpinForm.name} onChange={(event) => setHostSpinForm((current) => ({ ...current, name: event.target.value }))} maxLength={40} />
                <label className="admin-label" htmlFor="host-spin-stake" style={{ marginTop: 12 }}>Buy-in in play chips</label>
                <select id="host-spin-stake" className="admin-select" style={{ width: '100%' }} value={hostSpinForm.stake} onChange={(event) => setHostSpinForm((current) => ({ ...current, stake: Number(event.target.value) }))}><option value={5000}>5,000 {hostBilling?.mode === 'enforce' ? 'Cash Chips' : 'play chips'}</option><option value={10000}>10,000 {hostBilling?.mode === 'enforce' ? 'Cash Chips' : 'play chips'}</option></select>
                {hostBilling?.mode === 'enforce' && <div className="muted small" style={{ marginTop: 8 }}>Starting the round temporarily reserves up to {(hostSpinForm.stake * 20000).toLocaleString()} Cash Chips for the maximum prize. Unused chips return after completion or cancellation while waiting.</div>}
                {hostBilling?.mode === 'enforce' && <><label className="admin-label" htmlFor="host-spin-start" style={{ marginTop: 12 }}>Scheduled start (optional)</label><input id="host-spin-start" className="admin-input" style={{ width: '100%' }} type="datetime-local" value={hostSpinForm.start_at} onChange={(event) => setHostSpinForm((current) => ({ ...current, start_at: event.target.value }))} /></>}
                <p className="muted small">Seat count, blind structure and prize rules come from the game engine. Buying the management plugin does not buy game chips or change these rules.</p>
              </>}
            </div>
            <div className="modal-foot"><button className="btn btn-dark" onClick={() => setHostOpen(false)}>Cancel</button>{hostKind === 'cash' ? <button className="btn btn-gold" disabled={hostBusy || !hostCanManage || hostForm.max_buyin < hostForm.min_buyin} onClick={createHost}>{hostBusy ? 'Creating…' : 'Create table'}</button> : hostKind === 'spin' ? <button className="btn btn-gold" disabled={hostBusy || !hostCanManage} onClick={createHostSpin}>{hostBusy ? 'Creating…' : 'Create Spin & Go'}</button> : <button className="btn btn-gold" disabled={hostBusy || !hostCanManage} onClick={createHostTournament}>{hostBusy ? 'Creating…' : 'Create tournament'}</button>}</div>
          </div>
        </div>
      )}
    </>
  );
}
