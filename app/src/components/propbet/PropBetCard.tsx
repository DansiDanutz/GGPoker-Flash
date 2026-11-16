import { money, type PropBet } from '../../lib/api';
import { PropBetBadge, propLabel } from './PropBetBadge';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function startsIn(at: number, now = Date.now()) {
  const left = at - now;
  if (left <= 0) return 'Running';
  if (left < 60 * MINUTE) return `Start in ${Math.max(1, Math.round(left / MINUTE))} minute(s)`;
  if (left < DAY) return `Start in ${Math.round(left / (60 * MINUTE))} hour(s)`;
  return `Start in ${Math.round(left / DAY)} day(s)`;
}

export const durationLabel = (bet: PropBet) => {
  if (!bet.endAt) return '';
  const days = Math.max(1, Math.round((bet.endAt - bet.startAt) / DAY));
  return `In ${days} Day${days === 1 ? '' : 's'}`;
};

function headline(bet: PropBet) {
  if (bet.type === 'elo') return <><b>+{bet.goal}</b><small> ELO</small></>;
  if (bet.type === 'bankroll') return <><b>+{money(bet.goal ?? 0, true)}</b></>;
  return <><span className="pb-cup" aria-hidden="true">🏆</span><b>{money(bet.pot, true)}</b></>;
}

function statusLine(bet: PropBet) {
  if (bet.status === 'settled') return bet.winnerNick ? `Won by ${bet.winnerNick}` : 'Settled';
  if (bet.status === 'refunded') return 'Refunded';
  if (bet.status === 'running' && bet.type !== 'last_longer' && bet.target != null) {
    return `Progress ${bet.type === 'bankroll' ? money(bet.progress ?? 0, true) : bet.progress} / ${bet.type === 'bankroll' ? money(bet.target, true) : bet.target}`;
  }
  return startsIn(bet.startAt);
}

export function PropBetCard({ bet, mine, onJoin, onOpen, busy }: {
  bet: PropBet; mine: boolean; busy: boolean; onJoin: () => void; onOpen: () => void;
}) {
  const full = bet.bettors >= bet.maxBettors;
  const joinable = bet.status === 'open' && !mine && !full && bet.startAt > Date.now();
  const action = bet.type === 'last_longer' ? 'Join' : `Bet ${money(bet.amount, true)}`;
  return (
    <article className={`pb-card t-${bet.type}`}>
      <button type="button" className="pb-card-open" onClick={onOpen} aria-label={`Details: ${propLabel(bet.type)} by ${bet.creatorNick}`}>
        <PropBetBadge type={bet.type} size={58} />
        <span className="pb-type">{propLabel(bet.type)}</span>
        <span className="pb-head">{headline(bet)}</span>
        <span className="pb-sub">{bet.type === 'last_longer' ? bet.tournamentName : durationLabel(bet)}</span>
        <span className="pb-who">{bet.creatorNick}</span>
      </button>
      <dl className="pb-stats">
        <div><dt>{bet.type === 'last_longer' ? 'Buy-in' : 'Prize'}</dt><dd>{money(bet.amount, true)}</dd></div>
        <div><dt>{bet.type === 'last_longer' ? 'Players' : 'Bettors'}</dt><dd>{bet.type === 'last_longer' ? bet.players : `${bet.bettors}/${bet.maxBettors}`}</dd></div>
      </dl>
      <p className={'pb-when' + (bet.status === 'open' ? '' : ' done')}>{statusLine(bet)}</p>
      <button type="button" className="pb-join" disabled={!joinable || busy} onClick={onJoin}>
        {busy ? 'Joining…' : mine ? 'Your bet' : full && bet.status === 'open' ? 'Full' : joinable ? action : 'Closed'}
      </button>
    </article>
  );
}
