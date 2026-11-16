import React from 'react';
import { money } from '../../lib/api';

export function SpinInsurancePanel({ multiplier, payout, insuredMultiplier = 2 }: { multiplier: number; payout: number; insuredMultiplier?: number }) {
  const won = multiplier === insuredMultiplier && payout > 0;
  return (
    <div className="spin-insurance-panel" role="status">
      <span>Spin insurance result</span>
      <strong>{won ? `${money(payout)} paid` : `No payout on ${multiplier}x`}</strong>
      <p>{won ? `Your insured x${insuredMultiplier} result has already been credited once.` : `The premium covers only a committed x${insuredMultiplier} outcome. Your prize match is unaffected.`}</p>
    </div>
  );
}
