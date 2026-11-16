// Battle Royale (P0 slice B0): the native rules and payout format have not been
// captured, so DanGG does not offer the format. Rows seeded under the label used to play as
// plain Hold'em; they are switched off (never deleted) and every seat route refuses them.
export const BATTLE_ROYALE_GAME = 'battleroyale';
export const BATTLE_ROYALE_UNAVAILABLE = 'Battle Royale rules are not available in DanGG yet';

/** @param {string | null | undefined} game @returns {boolean} */
export function isBattleRoyale(game) {
  return game === BATTLE_ROYALE_GAME;
}

/**
 * Disables every enabled Battle Royale table. Idempotent: a second run changes nothing.
 * @param {{ prepare: (sql: string) => { run: (...a: unknown[]) => { changes: number | bigint } } }} db
 * @returns {number} rows switched off by this call
 */
export function disableBattleRoyaleTables(db) {
  const res = db.prepare('UPDATE tables SET enabled = 0 WHERE game = ? AND enabled = 1').run(BATTLE_ROYALE_GAME);
  return Number(res.changes);
}
