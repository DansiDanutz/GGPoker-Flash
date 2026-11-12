export type BadBeatRole = 'winner' | 'opponent' | 'table';
export type BadBeatShare = { id: string; nick: string; seat: number; role: BadBeatRole; amount: number };
export type BadBeatHit = { total: number; shares: BadBeatShare[] };

/** How long the native BAD BEAT JACKPOT! banner stays up. */
export const BAD_BEAT_BANNER_MS = 7000;

const ROLE_LABEL: Record<BadBeatRole, string> = { winner: 'Bad Beat Winner', opponent: 'Bad Beat Opponent', table: 'Rest of Players' };

export type BadBeatRow = { label: string; names: string; amount: number };

/** Banner rows in native order: winner, opponent, then one "Rest of Players (N Players Share)" row. */
export function badBeatRows(hit: BadBeatHit): BadBeatRow[] {
  const rows: BadBeatRow[] = [];
  for (const role of ['winner', 'opponent'] as const) {
    for (const s of hit.shares.filter((x) => x.role === role)) rows.push({ label: ROLE_LABEL[role], names: s.nick, amount: s.amount });
  }
  const rest = hit.shares.filter((x) => x.role === 'table');
  if (rest.length) {
    const share = rest.length === 1 ? '(1 Player)' : `(${rest.length} Players Share)`;
    rows.push({ label: `${ROLE_LABEL.table} ${share}`, names: rest.map((s) => s.nick).join(', '), amount: rest.reduce((n, s) => n + s.amount, 0) });
  }
  return rows;
}
