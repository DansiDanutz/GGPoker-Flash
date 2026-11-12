import { roomHasHandInProgress } from './tournament-state.js';

/** Blinds a tournament level, matching Table.applyTournamentLevel's 1.5x curve. */
export function tournamentBlinds(tournament = {}, level = 1) {
  const factor = 1.5 ** (Math.max(1, Number(level) || 1) - 1);
  return {
    sb: Math.round((Number(tournament.baseSb) || 0) * factor),
    bb: Math.round((Number(tournament.baseBb) || 0) * factor),
  };
}

/**
 * Advance the shared blind level between hands. Mid-hand advances are refused
 * so the current hand's blinds/bets cannot change underneath it.
 */
export function advanceRoomLevel(room, { delta = 1, liveTables, now = Date.now() } = {}) {
  if (!room) return { ok: false, reason: 'room not running' };
  if (room.winner) return { ok: false, reason: 'finished' };
  if (roomHasHandInProgress(room, liveTables)) return { ok: false, reason: 'hand in progress' };
  const step = Math.max(1, Math.min(20, Number(delta) || 1));
  const current = Math.max(1, Number(room.tournament?.level) || 1);
  const level = Math.min(100, current + step);
  room.tournament.level = level;
  room.tournament.levelStartedAt = now;
  for (const flight of room.flights || []) {
    liveTables?.get(flight.id)?.table?.applyTournamentLevel?.();
    room.ops?.broadcast?.(flight.id);
  }
  return { ok: true, level, blinds: tournamentBlinds(room.tournament, level) };
}
