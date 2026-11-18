export type BoardWinner = { seat?: number; nick?: string };
export type BoardAwardCount = { seat: number; nick: string; boards: number; won: number; shared: number };
export type BoardAward = { board: number; seats: number[]; winners: { seat: number; nick: string }[]; counts: BoardAwardCount[] };

/** Presentation-only board wins. Payout totals remain sourced from result.winners. */
export function boardAwards(byBoard: BoardWinner[][] | null | undefined): BoardAward[] {
  if (!Array.isArray(byBoard)) return [];
  const counts = new Map<number, BoardAwardCount>();
  return byBoard.map((winners, board) => {
    const seats = new Set<number>();
    const boardWinners = (Array.isArray(winners) ? winners : []).filter((winner) => Number.isInteger(winner?.seat));
    const shared = new Set(boardWinners.map((winner) => winner.seat)).size > 1;
    for (const winner of boardWinners) {
      if (!Number.isInteger(winner?.seat) || seats.has(winner.seat!)) continue;
      seats.add(winner.seat!);
      const prior = counts.get(winner.seat!);
      counts.set(winner.seat!, {
        seat: winner.seat!, nick: winner.nick || prior?.nick || 'Winner', boards: (prior?.boards || 0) + 1,
        won: (prior?.won || 0) + (shared ? 0 : 1), shared: (prior?.shared || 0) + (shared ? 1 : 0),
      });
    }
    return { board, seats: [...seats], winners: [...seats].map((seat) => ({ seat, nick: counts.get(seat)!.nick })), counts: [...counts.values()] };
  });
}
