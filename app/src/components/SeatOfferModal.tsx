import React, { useEffect, useId, useRef, useState } from 'react';
import { WaitlistOffer } from '../lib/api';
import { useApp } from '../lib/store';
import {
  formatCountdown, isOfferUrgent, OFFER_ANNOUNCE_SECONDS, OFFER_HOLD_SECONDS, offerProgress, offerSecondsLeft,
} from '../lib/waitlist';
import { useWaitlist } from '../lib/waitlistState';

const TICK_MS = 250;
const RING_SIZE = 44;
const RING_STROKE = 4;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/** Seconds left on an offer, re-rendering a few times a second. */
export function useOfferSeconds(offer: WaitlistOffer | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!offer) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [offer]);
  return offer ? offerSecondsLeft(offer.deadline, now) : 0;
}

const holdSecondsOf = (offer: WaitlistOffer) => (offer.holdMs > 0 ? Math.round(offer.holdMs / 1000) : OFFER_HOLD_SECONDS);

/** The table id of a `/table/:id` route, else null. */
function tableRouteId(route: string): string | null {
  const [path] = route.split('?');
  const parts = path.split('/').filter(Boolean);
  return parts[0] === 'table' && parts[1] ? decodeURIComponent(parts[1]) : null;
}

function CountdownRing({ seconds, hold }: { seconds: number; hold: number }) {
  const dash = RING_C * offerProgress(seconds, hold);
  return (
    <div className={'offer-ring' + (isOfferUrgent(seconds) ? ' urgent' : '')} aria-hidden="true">
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
        <circle className="track" cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} strokeWidth={RING_STROKE} />
        <circle
          className="sweep"
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} strokeWidth={RING_STROKE}
          strokeDasharray={`${dash} ${RING_C}`}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </svg>
      <span className="offer-secs">{seconds}</span>
    </div>
  );
}

/** Screen-reader text only at 30, 10 and 5 seconds. */
function useCountdownAnnouncement(seconds: number, tableName: string): string {
  const [text, setText] = useState('');
  useEffect(() => {
    if (OFFER_ANNOUNCE_SECONDS.includes(seconds)) setText(`${seconds} seconds left to take your seat at ${tableName}.`);
  }, [seconds, tableName]);
  return text;
}

/**
 * Global seat offer (P0 slice W4b). On non-table routes it is a modal alert dialog; on
 * another table's route it is a non-modal toast that never takes focus. On the offered
 * table's own route the table banner shows the offer instead, so this renders nothing.
 */
export function SeatOfferModal() {
  const { route, navigate } = useApp();
  const { offer, dismissOffer } = useWaitlist();
  const seconds = useOfferSeconds(offer);
  const announcement = useCountdownAnnouncement(seconds, offer?.tableName || '');
  const takeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const routeTable = tableRouteId(route);
  const isModal = !!offer && seconds > 0 && routeTable === null;

  useEffect(() => {
    if (!isModal) return;
    const previous = document.activeElement as HTMLElement | null;
    takeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { dismissOffer(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const buttons = [...dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [isModal, dismissOffer]);

  if (!offer || seconds <= 0 || routeTable === offer.tableId) return null;

  const hold = holdSecondsOf(offer);
  const take = () => {
    dismissOffer();
    navigate(`/table/${encodeURIComponent(offer.tableId)}`);
  };
  const body = (
    <>
      <div className="offer-main">
        <div>
          <div className="offer-table">{offer.tableName}</div>
          <div className="offer-meta">Seat {offer.seat + 1} is held for you · {formatCountdown(seconds)}</div>
        </div>
        {!isModal ? null : <CountdownRing seconds={seconds} hold={hold} />}
      </div>
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </>
  );
  const buttons = (
    <>
      <button type="button" className="btn btn-dark" onClick={dismissOffer}>Pass</button>
      <button ref={takeRef} type="button" className="btn btn-red" onClick={take}>Take seat</button>
    </>
  );

  if (!isModal) {
    const urgent = isOfferUrgent(seconds);
    return (
      <div className="seat-offer-toast" role="status" aria-live="assertive">
        <b>Seat available</b>
        {body}
        <div className="offer-actions">{buttons}</div>
        <i className={'offer-bar' + (urgent ? ' urgent' : '')} style={{ transform: `scaleX(${offerProgress(seconds, hold)})` }} />
      </div>
    );
  }

  return (
    <div className="modal-backdrop seat-offer-backdrop">
      <div ref={dialogRef} className="modal seat-offer" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head"><h3 id={titleId}>Seat available at {offer.tableName}</h3></div>
        <div className="modal-body">{body}</div>
        <div className="modal-foot">{buttons}</div>
      </div>
    </div>
  );
}
