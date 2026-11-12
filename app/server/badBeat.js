import { compareScores } from './poker.js';

// Native GGPoker Bad Beat Jackpot (string_table: "Lose with {0} or better";
// recipients EBadBeatJackpotType Winner / Opponent / TableShare, shown as
// "Bad Beat Winner", "Bad Beat Opponent", "Rest of Players"). The trigger hand,
// the split and the accrual are server data the client never holds, so the
// values below are DanGG rules.

/** Pool before any accrual (the counter DanGG has always shown). */
export const JACKPOT_SEED = 199026635;
/** Lowest losing hand that triggers: Hold'em quad 8s, Omaha a straight flush. */
export const BBJ_TRIGGER = { holdem: [7, 8], omaha: [8, 5] };
/** Share of the pool paid out on a hit. */
export const BBJ_PAYOUT_FRACTION = 0.1;
/** Split of the payout: the beaten player, the player who beat them, everyone else dealt in. */
export const BBJ_SPLIT = { winner: 0.5, opponent: 0.25, table: 0.25 };
/** Share of each raked pot that feeds the pool. */
export const BBJ_RAKE_SHARE = 0.25;

export function jackpotAccrual(rake) {
  return Math.max(0, Math.floor(Number(rake || 0) * BBJ_RAKE_SHARE));
}

const usesBothHoleCards = (c) => c.hole.length === 2 && c.hole.every((card) => c.best.includes(card));

function qualifies(c, omaha) {
  if (compareScores(c.score, omaha ? BBJ_TRIGGER.omaha : BBJ_TRIGGER.holdem) < 0) return false;
  return omaha || usesBothHoleCards(c);
}

const better = (a, b) => (!b || compareScores(a.score, b.score) > 0 ? a : b);

/**
 * Bad Beat Jackpot payout for a single-board showdown, or null when it does not hit.
 * A hand is beaten when it loses a pot it was eligible for, even if it wins a side pot.
 * @param {{ pool: number, omaha: boolean, dealtIn: string[],
 *   pots: { eligibleIds: string[], winnerIds: string[] }[],
 *   scored: { id: string, score: number[], hole: string[], best: string[] }[] }} hand
 * @returns {{ total: number, shares: { id: string, role: 'winner'|'opponent'|'table', amount: number }[] } | null}
 */
export function badBeatPayout({ pool, omaha, scored, pots, dealtIn }) {
  const total = Math.floor(Math.max(0, Number(pool) || 0) * BBJ_PAYOUT_FRACTION);
  if (total <= 0) return null;
  const byId = new Map(scored.map((c) => [c.id, c]));
  let beaten = null;
  let opponent = null;
  for (const pot of pots) {
    const won = new Set(pot.winnerIds);
    const top = pot.winnerIds.map((id) => byId.get(id)).filter(Boolean).reduce((b, c) => better(c, b), null);
    if (!top) continue;
    for (const id of pot.eligibleIds) {
      const c = byId.get(id);
      if (!c || won.has(id) || !qualifies(c, omaha) || compareScores(top.score, c.score) <= 0) continue;
      if (better(c, beaten) === c) { beaten = c; opponent = top; }
    }
  }
  if (!beaten) return null;

  const rest = dealtIn.filter((id) => id !== beaten.id && id !== opponent.id);
  const opponentAmount = Math.floor(total * BBJ_SPLIT.opponent);
  const tableEach = rest.length ? Math.floor((total * BBJ_SPLIT.table) / rest.length) : 0;
  const winnerAmount = total - opponentAmount - tableEach * rest.length;
  return {
    total,
    shares: [
      { id: beaten.id, role: 'winner', amount: winnerAmount },
      { id: opponent.id, role: 'opponent', amount: opponentAmount },
      ...rest.map((id) => ({ id, role: 'table', amount: tableEach })),
    ],
  };
}
