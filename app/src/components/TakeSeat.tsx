import { useState } from 'react';

// Native PlayerTakeSeat3D (REA take-seat-flow): an empty seat shows the Take Seat control; a
// reserved seat shows a disabled "R"; reserving opens the buy-in popup (CheckTakeSeatCommand).

export function TakeSeatControl({ reserved, onTake }: { reserved: boolean; onTake?: () => void }) {
  if (reserved) {
    return (
      <div className="take-seat reserved" aria-label="Reserved seat">
        <span className="take-seat-r">R</span>
      </div>
    );
  }
  return (
    <button className="take-seat" onClick={onTake} aria-label="Take seat">
      <i className="take-seat-arrow" aria-hidden="true" />
      <span className="take-seat-label">Take Seat</span>
    </button>
  );
}

export type Reservation = { seat: number; until: number };

export function BuyInDialog({ reservation, min, max, step, now, format, onBuyIn, onCancel }: {
  reservation: Reservation; min: number; max: number; step: number; now: number;
  format: (v: number) => string; onBuyIn: (amount: number) => void; onCancel: () => void;
}) {
  const [amount, setAmount] = useState(min);
  const value = Math.max(min, Math.min(max, amount));
  const secondsLeft = Math.max(0, Math.ceil((reservation.until - now) / 1000));
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal buyin-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Buy-in · Seat {reservation.seat + 1}</h3></div>
        <div className="modal-body">
          <p className="muted small">Your seat is reserved for {secondsLeft}s.</p>
          <input type="range" aria-label="Buy-in amount" min={min} max={max} step={step} value={value}
            onChange={(e) => setAmount(Number(e.target.value))} style={{ width: '100%' }} />
          <div className="between" style={{ marginTop: 8 }}>
            <span className="muted small">{format(min)}</span>
            <b style={{ color: '#ffd98a' }}>{format(value)}</b>
            <span className="muted small">{format(max)}</span>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-dark" onClick={onCancel}>Cancel</button>
          <button className="btn btn-red" disabled={secondsLeft <= 0} onClick={() => onBuyIn(value)}>Buy-in</button>
        </div>
      </div>
    </div>
  );
}
