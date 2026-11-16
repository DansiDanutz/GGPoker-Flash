/**
 * Real lobby occupancy, read from the live table held in memory.
 *
 * `players` counts every occupied seat, bots included (a bot fills a real chair a human
 * would otherwise take); `bots` reports how many of those are bots. A table that is not
 * running has nobody seated. `seated` feeds the lobby's table preview: public seat data
 * only (nick, stack, seat, country), the same a spectator sees.
 */

const EMPTY = Object.freeze({ players: 0, bots: 0, seated: Object.freeze([]) });

/**
 * @param {{ occupiedSeats: () => Array<{ index: number, player: { nick: string, stack: number, isBot?: boolean } }> } | null | undefined} table
 * @returns {{ players: number, bots: number, seated: Array<{ seat: number, nick: string, stack: number, bot: boolean, country: string }> }}
 */
export function occupancyOf(table) {
  if (!table) return EMPTY;
  const seated = table.occupiedSeats()
    .filter((s) => s.player)
    .map((s) => ({ seat: s.index, nick: s.player.nick, stack: Number(s.player.stack) || 0, bot: !!s.player.isBot, country: s.player.country || '' }));
  return { players: seated.length, bots: seated.filter((s) => s.bot).length, seated };
}

function hash(str) {
  let value = 2166136261;
  for (let i = 0; i < str.length; i++) {
    value ^= str.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

/** Preserve the original lobby demo counts until a table has real live occupancy. */
export function lobbyOccupancy(table, cfg) {
  if (table) return occupancyOf(table);
  const value = hash(cfg.id + cfg.name);
  let players = 1 + (value % cfg.seats);
  if (value % 5 === 0) players = cfg.seats;
  if (cfg.game === 'spingold') players = 1 + (value % 2);
  return { players, bots: 0, seated: [] };
}
