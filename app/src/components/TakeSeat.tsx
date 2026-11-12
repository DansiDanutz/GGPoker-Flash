import { useState } from 'react';
import { buyInError, buyInLimits, parseBuyInText } from '../lib/buyIn';

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

interface BuyInDialogProps {
  reservation: Reservation; min: number; max: number; step: number; now: number;
  /** Wallet balance in chips; the maximum never exceeds it. */
  balance?: number | null;
  /** Chips per typed display unit: 100 when amounts are shown in dollars, 1 for plain chips. */
  scale: number;
  format: (v: number) => string; onBuyIn: (amount: number) => void; onCancel: () => void;
}

export function BuyInDialog({ reservation, min, max, step, now, balance, scale, format, onBuyIn, onCancel }: BuyInDialogProps) {
  const limits = buyInLimits(min, max, balance);
  const [amount, setAmount] = useState(limits.min);
  const [text, setText] = useState(() => String(limits.min / scale));
  const error = buyInError(amount, limits, format);
  const sliderValue = Number.isFinite(amount) ? Math.max(limits.min, Math.min(limits.max, amount)) : limits.min;
  const secondsLeft = Math.max(0, Math.ceil((reservation.until - now) / 1000));
  const fromSlider = (value: number) => { setAmount(value); setText(String(value / scale)); };
  const fromText = (value: string) => { setText(value); setAmount(parseBuyInText(value, scale)); };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal buyin-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>Buy-in · Seat {reservation.seat + 1}</h3></div>
        <div className="modal-body">
          <p className="muted small">Your seat is reserved for {secondsLeft}s.</p>
          <input type="range" aria-label="Buy-in amount" min={limits.min} max={limits.max} step={step} value={sliderValue}
            disabled={!limits.canAfford} onChange={(e) => fromSlider(Number(e.target.value))} style={{ width: '100%' }} />
          <div className="between" style={{ marginTop: 8 }}>
            <span className="muted small">{format(limits.min)}</span>
            <input className="admin-input" aria-label="Type a buy-in amount" inputMode="decimal" value={text}
              aria-invalid={!!error} aria-describedby="buyin-error" disabled={!limits.canAfford}
              onChange={(e) => fromText(e.target.value)} style={{ width: 110, textAlign: 'center' }} />
            <span className="muted small">{format(limits.max)}</span>
          </div>
          <p id="buyin-error" role="alert" className="small" style={{ color: '#e08a8a', minHeight: 16, marginTop: 6 }}>{error ?? ''}</p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-dark" onClick={onCancel}>Cancel</button>
          <button className="btn btn-red" disabled={secondsLeft <= 0 || !!error} onClick={() => onBuyIn(amount)}>{error ? 'Buy-in' : `Buy-in ${format(amount)}`}</button>
        </div>
      </div>
    </div>
  );
}
