import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useModalIsolation } from '../../lib/useModalIsolation';

export function PushSeatPanel({ tableId, seatCount, currentSeat, players, pushSeat, onClose }: any) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operations = useRef(new Map<string, string>());
  const dialog = useModalIsolation<HTMLDivElement>();
  const close = onClose;
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [busy, onClose]);

  const reserve = async (destinationSeat: number) => {
    if (busy) return;
    setBusy(true);
    setError('');
    const operationKey = `reserve:${destinationSeat}:${pushSeat.revision}`;
    if (!operations.current.has(operationKey)) operations.current.set(operationKey, crypto.randomUUID());
    try {
      await api.pushSeat(tableId, { destinationSeat, expectedRevision: pushSeat.revision, operationId: operations.current.get(operationKey)! });
      operations.current.delete(operationKey);
      onClose();
    } catch (reason: any) {
      setError(reason.message || 'The seat could not be reserved. Refresh and try again.');
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    const operationKey = `cancel:${pushSeat.revision}`;
    if (!operations.current.has(operationKey)) operations.current.set(operationKey, crypto.randomUUID());
    try {
      await api.cancelPushSeat(tableId, { expectedRevision: pushSeat.revision, operationId: operations.current.get(operationKey)! });
      operations.current.delete(operationKey);
      onClose();
    } catch (reason: any) {
      setError(reason.message || 'The reservation could not be cancelled.');
      setBusy(false);
    }
  };
  return (
    <div ref={dialog} className="push-seat-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) close(); }}>
      <section className="push-seat-panel" role="dialog" aria-modal="true" aria-labelledby="push-seat-title">
        <div className="between">
          <div><h2 id="push-seat-title">Push Seat</h2><p>{pushSeat.remaining} {pushSeat.remaining === 1 ? 'use' : 'uses'} remaining. Movement happens between hands.</p></div>
          <button type="button" aria-label="Close Push Seat" disabled={busy} onClick={() => close()}>×</button>
        </div>
        {pushSeat.reservation ? <div className="push-seat-status" role="status">
          <p>Seat {pushSeat.reservation.destinationSeat + 1} is reserved. No use is spent until the move completes.</p>
          <button type="button" disabled={busy} onClick={cancel}>{busy ? 'Cancelling…' : 'Cancel reservation'}</button>
        </div> : <>
          <p>Choose another physical seat. If it is occupied, you and its occupant swap seats without losing chips or session identity.</p>
          <div className="push-seat-grid">
            {Array.from({ length: seatCount }, (_, seat) => {
              const occupant = players.find((player: any) => player?.seat === seat && !player.empty);
              const reserved = players.some((player: any) => player?.seat === seat && player.empty && player.reserved);
              const status = reserved ? 'Reserved' : occupant?.nick || 'Empty';
              return <button type="button" key={seat} disabled={busy || reserved || seat === currentSeat || !pushSeat.remaining} onClick={() => reserve(seat)} aria-label={`Move to seat ${seat + 1}${reserved ? ', reserved' : occupant ? `, occupied by ${occupant.nick}` : ', empty'}`}>
                <strong>Seat {seat + 1}</strong><small>{seat === currentSeat ? 'Your seat' : status}</small>
              </button>;
            })}
          </div>
        </>}
        {error && <p className="push-seat-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
