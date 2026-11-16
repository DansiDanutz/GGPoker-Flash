import React, { useEffect, useState } from 'react';
import { money } from '../../lib/api';
import { spinRenderedMultipliers, spinTargetIndex, spinWheelRotation } from '../../game/spinPresentation';

export function SpinWheel({ multiplier, prize, payouts, multipliers }: { multiplier: number; prize: number; payouts: number[]; multipliers?: number[] }) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const rotation = settled ? spinWheelRotation(multiplier, multipliers) : 0;
  const labels = spinRenderedMultipliers(multipliers);
  const segmentAngle = 360 / labels.length;
  const sectorBackground = labels.map((_, index) => `${index % 2 ? '#263e68' : '#6f327d'} ${index * segmentAngle}deg ${(index + 1) * segmentAngle}deg`).join(',');
  const ordinal = (place: number) => `${place}${place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}`;
  return (
    <>
      <div className="spin-wheel" data-testid="spin-wheel" data-multiplier={multiplier} data-target-index={spinTargetIndex(multiplier, multipliers)} style={{ background: `conic-gradient(${sectorBackground})` }}>
        <div className="spin-wheel-pointer" aria-hidden="true" />
        <div className="spin-wheel-rotor" data-rotation={rotation} style={{ '--spin-target': `${rotation}deg` } as React.CSSProperties}>
          {labels.map((value, index) => (
            <span className="spin-wheel-segment" key={value} style={{ '--segment-angle': `${index * segmentAngle}deg` } as React.CSSProperties}>
              {value}x
            </span>
          ))}
        </div>
        <div className="spin-wheel-result">{multiplier}x</div>
      </div>
      <div className="spin-prize-breakdown" aria-label={`Prize pool ${money(prize)}`}>
        <span>Prize pool <b>{money(prize)}</b></span>
        {payouts.map((payout, index) => payout > 0 && <span key={index}>{ordinal(index + 1)} {money(payout)}</span>)}
      </div>
    </>
  );
}
