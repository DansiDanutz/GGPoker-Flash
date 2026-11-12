import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, WaitlistOffer, WaitlistQueue, WaitlistUpdateEvent } from './api';
import { useApp } from './store';
import { applyQueueUpdate, offerSecondsLeft } from './waitlist';

/**
 * Global wait-list state (P0 slice W4b): the caller's queues and the live seat offer.
 * Fed by `/api/waitlists/me` and the notification stream (`gg:notify` events from
 * store.tsx), so the header chip, the seat-offer dialog and the table banner agree on
 * every route.
 */
type WaitlistState = {
  queues: WaitlistQueue[];
  offer: WaitlistOffer | null;
  refresh: () => Promise<void>;
  /** Hide the current offer (Pass, or after taking the seat). The hold then lapses server-side. */
  dismissOffer: () => void;
  /** Leave a queue and drop it locally; throws the API error to the caller. */
  leaveQueue: (q: WaitlistQueue) => Promise<void>;
  /** Caller's position at a table (0 = not queued). */
  tablePosition: (tableId: string) => number;
  /** Caller's position in a lobby group (0 = not queued). */
  groupPosition: (groupKey: string) => number;
};

type OfferEvent = { type: 'waitlist_offer' } & WaitlistOffer;
type ExpiredEvent = { type: 'waitlist_expired'; tableId: string; seat: number };
type NotifyDetail = WaitlistUpdateEvent | OfferEvent | ExpiredEvent | { type?: string };

const EXPIRY_TICK_MS = 1000;

const Ctx = createContext<WaitlistState | null>(null);

const isLive = (o: WaitlistOffer | null): boolean => !!o && offerSecondsLeft(o.deadline, Date.now()) > 0;

export function WaitlistProvider({ children }: { children: React.ReactNode }) {
  const { user, toast } = useApp();
  const [queues, setQueues] = useState<WaitlistQueue[]>([]);
  const [offer, setOffer] = useState<WaitlistOffer | null>(null);
  const queuesRef = useRef<WaitlistQueue[]>(queues);
  queuesRef.current = queues;
  const offerRef = useRef<WaitlistOffer | null>(offer);
  offerRef.current = offer;

  const refresh = useCallback(async () => {
    if (!user) { setQueues([]); setOffer(null); return; }
    try {
      const r = await api.myWaitlists();
      setQueues(r.queues || []);
      const live = (r.offers || []).find((o) => isLive(o)) || null;
      setOffer((prev) => (live && prev && prev.tableId === live.tableId && prev.seat === live.seat ? prev : live));
    } catch {
      // Keep the last known state; the stream and the next refresh will correct it.
    }
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onNotify = (e: Event) => {
      const detail = (e as CustomEvent<NotifyDetail>).detail;
      if (!detail || typeof detail !== 'object') return;
      if (detail.type === 'waitlist_update') {
        const ev = detail as WaitlistUpdateEvent;
        // A brand-new table queue arrives without its name; fetch the list once to get it.
        const isUnnamed = ev.position > 0 && ev.kind === 'table'
          && !queuesRef.current.find((q) => q.queueKey === ev.queueKey)?.tableName;
        setQueues((prev) => applyQueueUpdate(prev, ev));
        if (isUnnamed) refresh();
      } else if (detail.type === 'waitlist_offer') {
        const { type: _t, ...next } = detail as OfferEvent;
        setOffer(next);
      } else if (detail.type === 'waitlist_expired') {
        const ev = detail as ExpiredEvent;
        const current = offerRef.current;
        if (current && current.tableId === ev.tableId) {
          setOffer(null);
          toast({ kind: 'info', title: 'Seat offer expired', body: current.tableName });
        }
      }
    };
    window.addEventListener('gg:notify', onNotify);
    return () => window.removeEventListener('gg:notify', onNotify);
  }, [refresh, toast]);

  // Close an offer at its deadline even if the expiry event is missed.
  useEffect(() => {
    if (!offer) return;
    const timer = window.setInterval(() => {
      if (isLive(offer)) return;
      setOffer((prev) => (prev === offer ? null : prev));
      toast({ kind: 'info', title: 'Seat offer expired', body: offer.tableName });
    }, EXPIRY_TICK_MS);
    return () => window.clearInterval(timer);
  }, [offer, toast]);

  const dismissOffer = useCallback(() => setOffer(null), []);

  const leaveQueue = useCallback(async (q: WaitlistQueue) => {
    if (q.kind === 'table') await api.leaveTableWaitlist(q.tableId);
    else await api.leaveGroupWaitlist(q.groupKey);
    setQueues((prev) => prev.filter((x) => x.queueKey !== q.queueKey));
  }, []);

  const tablePosition = useCallback(
    (tableId: string) => queues.find((q) => q.kind === 'table' && q.tableId === tableId)?.position ?? 0,
    [queues],
  );
  const groupPosition = useCallback(
    (groupKey: string) => queues.find((q) => q.kind === 'group' && q.groupKey === groupKey)?.position ?? 0,
    [queues],
  );

  const value = useMemo<WaitlistState>(
    () => ({ queues, offer, refresh, dismissOffer, leaveQueue, tablePosition, groupPosition }),
    [queues, offer, refresh, dismissOffer, leaveQueue, tablePosition, groupPosition],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWaitlist(): WaitlistState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWaitlist outside WaitlistProvider');
  return v;
}
