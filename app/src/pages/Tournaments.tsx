import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { Countdown, PageShell } from '../components/PageShell';
import { MobileEvents } from '../components/mobile/MobileEvents';
import { MobileShell } from '../components/mobile/MobileShell';
import { useIsPhone } from '../lib/useIsPhone';
import { TournamentReferenceList } from '../components/tournaments/TournamentReferenceList';
import { TournamentLobby } from '../components/tournaments/TournamentLobby';
import {
  emptyTournamentMessage, filterTournaments, phaseOf, PHASE_LABEL, readTournamentFilters, resetTournamentFilters,
  TournamentFilters, tournamentFilterCount, withTournamentFilters, writeTournamentFilters,
} from '../lib/tournamentFilters';
import { PROMO_ART } from '../lib/promoArt';
import { cashChips, organizerChipsApi, type ChipAccount } from '../lib/organizer-chips-api';

const SERIES_ART: Record<string, string> = {
  wsop: '/assets/ui/discover/Bg_Discover_WSOPExpress_Promo1_EN.png',
  mystery: PROMO_ART.battle,
  spin: '/assets/ui/discover/Bg_Discover_SpinNGold.png',
};

export function Tournaments() {
  const { user, refreshUser, toast, navigate, brand } = useApp();
  const isPhone = useIsPhone();
  const [data, setData] = useState<any>(null);
  const [filters, setFilters] = useState<TournamentFilters>(() => readTournamentFilters());
  const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chipAccount, setChipAccount] = useState<ChipAccount | null>(null);
  const ticketKeys = useRef(new Map<string, string>());

  const load = async () => {
    try {
      const [events, scoped] = await Promise.all([api.tournaments(), user ? organizerChipsApi.mine().catch(() => null) : Promise.resolve(null)]);
      setData(events); setChipAccount(scoped);
    } catch (e: any) { toast({ kind: 'error', title: 'Tournaments', body: e.message }); }
  };
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const id = new URLSearchParams(location.hash.split('?')[1] || '').get('id');
    if (!id) return;
    api.tournament(id).then((r) => setDetail(r.tournament)).catch((e) => toast({ kind: 'error', title: 'Tournament', body: e.message }));
  }, []);

  const registered: string[] = data?.registered || [];
  const list = useMemo(
    () => (data ? filterTournaments(data.tournaments.map((t: any) => chipAccount?.tournaments.some((row) => row.id === t.id) ? { ...t, chip_economy: true } : t), { ...filters, registered: data.registered || [], nowMs: Date.now() }) : []),
    [data, filters, chipAccount],
  );

  const updateFilters = (patch: Partial<TournamentFilters>) => {
    setFilters((prev) => {
      const next = withTournamentFilters(prev, patch);
      writeTournamentFilters(next);
      return next;
    });
  };
  const resetFilters = () => {
    const next = resetTournamentFilters();
    writeTournamentFilters(next);
    setFilters(next);
  };

  const register = async (t: any) => {
    if (!user) { navigate('/login'); return; }
    setBusy(t.id);
    try {
      const chipEvent = chipAccount?.tournaments.find((row) => row.id === t.id);
      if (chipEvent) {
        if (chipAccount?.mode !== 'enforce') throw new Error('Cash Chip tournament registration is currently inactive.');
        let ticket = chipAccount.tickets.find((row) => row.tournament_id === t.id && row.state === 'issued');
        if (!ticket) {
          if (!window.confirm(`Buy a ticket for “${t.name}” using ${cashChips(chipEvent.buyin + chipEvent.fee)} from organizer #${chipEvent.owner_id}?`)) return;
          const key = ticketKeys.current.get(t.id) || crypto.randomUUID(); ticketKeys.current.set(t.id, key);
          const issued = await organizerChipsApi.buyTicket(t.id, key);
          ticketKeys.current.delete(t.id);
          ticket = { id: issued.id, organizer_id: chipEvent.owner_id, tournament_id: t.id, holder_id: user.id, price: chipEvent.buyin + chipEvent.fee, buyin: chipEvent.buyin, fee: chipEvent.fee, starting_stack: chipEvent.starting_stack, state: 'issued' };
        }
        await organizerChipsApi.redeemTicket(ticket.id);
      } else await api.registerTourney(t.id);
      sound.play('coin');
      toast({ kind: 'success', title: 'Registered', body: `${t.name} · ${chipEvent ? cashChips(chipEvent.buyin + chipEvent.fee) : money(t.buyin + t.fee)}` });
      await load();
      await refreshUser();
    } catch (e: any) {
      toast({ kind: 'error', title: 'Registration failed', body: e.message });
    } finally { setBusy(null); }
  };

  const play = async (t: any) => {
    if (!user) { navigate('/login'); return; }
    setBusy(t.id);
    try {
      const token = localStorage.getItem('ggpoker.token');
      const r = await fetch(`/api/tournaments/${t.id}/play`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      sound.play('coin');
      navigate(`/table/${r.tableId}?buyin=${t.starting_stack}`);
    } catch (e: any) {
      toast({ kind: 'error', title: 'Cannot start', body: e.message });
    } finally { setBusy(null); }
  };

  // Watch the busiest live flight; an event only has tables once it is running.
  const watchLive = async (t: any, tableId?: string) => {
    if (tableId) { navigate(`/table/${tableId}?observe=1`); return; }
    setBusy(t.id);
    try {
      const token = localStorage.getItem('ggpoker.token');
      const r = await fetch(`/api/tournaments/${t.id}/watch`, { headers: { authorization: `Bearer ${token}` } }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      navigate(`/table/${r.tableId}?observe=1`);
    } catch (e: any) {
      toast({ kind: 'error', title: 'Nothing to watch yet', body: e.message });
    } finally { setBusy(null); }
  };

  const unregister = async (t: any) => {
    setBusy(t.id);
    try {
      await api.unregisterTourney(t.id);
      toast({ kind: 'info', title: 'Unregistered', body: t.name });
      await load(); await refreshUser();
    } catch (e: any) {
      toast({ kind: 'error', title: 'Failed', body: e.message });
    } finally { setBusy(null); }
  };

  const featured = list.length ? list.reduce((a: any, b: any) => (b.gtd > a.gtd ? b : a), list[0]) : data?.tournaments?.[0];

  // Keep the open lobby in step with the list's latest row (entrants, status).
  const liveDetail = detail ? (data?.tournaments || []).find((t: any) => t.id === detail.id) || detail : null;
  const openDetail = (t: any) => setDetail(t);
  const closeDetail = useCallback(() => setDetail(null), []);
  const lobbyError = useCallback((message: string) => toast({ kind: 'error', title: 'Tournament', body: message }), [toast]);
  const detailChipEvent = chipAccount?.tournaments.find((row) => row.id === liveDetail?.id);
  const detailOrganizerId = detailChipEvent?.owner_id ?? liveDetail?.owner_id;
  const detailIsChipEvent = Boolean(liveDetail?.chip_economy || detailChipEvent);
  const detailBalance = detailIsChipEvent ? (chipAccount?.balances.find((row) => row.organizer_id === detailOrganizerId)?.balance || 0) : (user?.balance ?? 0);

  return (
    <>
    {isPhone ? (
      <MobileShell showBrand><MobileEvents
        list={list}
        featured={featured || null}
        heroArt={SERIES_ART[filters.category]}
        filters={filters}
        onFilters={updateFilters}
        onReset={resetFilters}
        onOpen={openDetail}
        emptyText={data ? emptyTournamentMessage(filters) : 'Loading events…'}
      /></MobileShell>
    ) : (
    <PageShell activeTop="tournaments">
      <TournamentReferenceList
        list={list}
        registered={registered}
        busy={busy}
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        onLobby={openDetail}
        onRegister={register}
        onPlay={play}
        balance={user?.balance ?? 0}
      />
    </PageShell>
    )}

      {detail && (
        <TournamentLobby
          tournament={liveDetail}
          all={data?.tournaments || []}
          registered={registered.includes(detail.id)}
          busy={busy === detail.id}
          balance={detailBalance}
          meId={user?.id}
          onClose={closeDetail}
          onRegister={() => register(detail)}
          onUnregister={() => unregister(detail)}
          onPlay={() => play(detail)}
          onWatch={(tableId) => watchLive(detail, tableId)}
          onOpen={openDetail}
          onPropBet={() => navigate(`/propbet?create=last_longer&tournament=${encodeURIComponent(detail.id)}`)}
          onError={lobbyError}
        />
      )}
    </>
  );
}
