export type SlotGame = {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  accent: string;
  volatility: string;
  bets: number[];
  tags: string[];
  glyphs: Record<string, string>;
};

export type WinnerRow = {
  nick: string;
  amount: number;
  kind: string;
  memo: string;
  created_at: string;
};

const slugOf = (memo: string) => /^Slots (.+?) (?:win|spin)/.exec(memo || '')?.[1] || 'Slots';

/** Game name from a transaction memo (`Slots Disco Cat win 400`). */
export function gameNameFromMemo(memo: string, games: readonly SlotGame[]): string {
  const name = slugOf(memo);
  return games.find((g) => g.name === name)?.name || 'Slots';
}

export async function loadSlotGames(): Promise<SlotGame[]> {
  const res = await fetch('/api/games/slots');
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(body.games)) throw new Error(body.error || 'The slot catalogue is unavailable');
  return body.games as SlotGame[];
}

export async function loadWinners(limit = 16): Promise<{ winners: WinnerRow[]; mine: WinnerRow | null }> {
  const token = (() => { try { return localStorage.getItem('ggpoker.token'); } catch { return null; } })();
  const res = await fetch(`/api/games/winners?limit=${limit}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Winners are unavailable');
  return { winners: Array.isArray(body.winners) ? body.winners : [], mine: body.mine || null };
}

export const SLOT_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'hot', label: 'Hot & Cold' },
  { key: 'jackpot', label: 'Jackpot' },
  { key: 'classic', label: 'Classic' },
] as const;
