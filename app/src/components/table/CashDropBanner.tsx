import { money } from '../../lib/api';
import { CASHDROP_RULE_LABEL, type CashDropEvent } from '../../lib/cashDrop';

interface CashDropBannerProps {
  drop: CashDropEvent;
}

/** Full-width gold felt banner shown when a Rush Cash Drop fires (P0 slice R4). */
export function CashDropBanner({ drop }: CashDropBannerProps) {
  return (
    <div className="cashdrop-overlay" role="status" aria-live="polite">
      <div className="cashdrop-title">RUSH CASH DROP</div>
      <div className="cashdrop-amount">{money(drop.amount)}</div>
      <div className="cashdrop-nick">{drop.nick}</div>
      <div className="cashdrop-rule">{drop.rule || CASHDROP_RULE_LABEL}</div>
    </div>
  );
}
