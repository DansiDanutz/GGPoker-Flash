import { useEffect, useState } from 'react';
import { getToken, money } from '../../lib/api';

export interface DailyLeaderboardRow { rank: number; nick: string; points: number; prize: number }
export interface DailyLeaderboardView {
  day: string;
  totalPrize: number;
  myPoints: number;
  myRank: number | null;
  top: DailyLeaderboardRow[];
}

interface Props {
  tableId: string;
  /** Stake label for the native "{0} Daily Leaderboard" title, e.g. "$1/$2". */
  stake: string;
  /** Changes once per finished hand so the points refresh. */
  refreshKey: number;
}

/**
 * Native table ribbon: "{0} Daily Leaderboard" with Total Prize and My Points
 * (string_table DailyLeaderBoard / MobileTotalPrize / MyPoints / MobileLeaderboardRank).
 * Click to expand today's top ten.
 */
export function DailyLeaderboardRibbon({ tableId, stake, refreshKey }: Props) {
  const [board, setBoard] = useState<DailyLeaderboardView | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tables/${encodeURIComponent(tableId)}/leaderboard`, {
      headers: { authorization: `Bearer ${getToken()}` },
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setBoard(d.leaderboard ?? null); })
      .catch(() => { /* the ribbon keeps its last value; the table works without it */ });
    return () => controller.abort();
  }, [tableId, refreshKey]);

  if (!board) return null;
  return (
    <div className={`daily-lb${open ? ' open' : ''}`}>
      <button type="button" className="daily-lb-ribbon" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="daily-lb-title">{stake} Daily Leaderboard</span>
        <span className="daily-lb-stat"><small>Total Prize</small>{money(board.totalPrize)}</span>
        <span className="daily-lb-stat"><small>My Points</small>{board.myPoints}</span>
        <span className="daily-lb-stat"><small>Rank</small>{board.myRank ?? '-'}</span>
      </button>
      {open && (
        <ol className="daily-lb-list">
          {board.top.length === 0 && <li className="daily-lb-empty">No points yet today. Play raked hands to climb.</li>}
          {board.top.map((r) => (
            <li key={r.rank}>
              <span className="rank">{r.rank}</span>
              <span className="nick">{r.nick}</span>
              <span className="pts">{r.points}</span>
              <span className="prize">{money(r.prize)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
