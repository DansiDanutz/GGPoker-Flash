// Tournament blind schedule: one curve shared by every flight, the admin controls and reports.

/** Each level multiplies the base blinds by this factor. */
export const BLIND_GROWTH = 1.5;

/**
 * Highest blind level. Blinds stop rising here: 1.5^19 ≈ 2,217x the base big blind.
 * Events start 50 big blinds deep (base BB = starting stack / 50), so at the cap one big
 * blind is about 44 starting stacks, which forces any field we seat to a finish while every
 * amount stays a small safe integer. The old cap of 100 levels reached 1.5^99 ≈ 2.6e17x,
 * past Number.MAX_SAFE_INTEGER. The Codex reference (blind-level.mjs) likewise stops at a
 * fixed final level (7 doublings, 64x); our slower 1.5x curve needs more levels to bite.
 */
export const MAX_TOURNAMENT_LEVEL = 20;

/** A usable level number: integer, at least 1, at most the cap. */
export function clampTournamentLevel(level) {
  const n = Math.floor(Number(level));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_TOURNAMENT_LEVEL, n);
}

/**
 * Blinds and ante at a level. The ante keeps the base level's ante-to-big-blind ratio,
 * measured against the rounded big blind so the ratio survives rounding.
 * @param {{ baseSb?: number, baseBb?: number, baseAnte?: number }} tournament
 * @param {number} level
 * @returns {{ sb: number, bb: number, ante: number }}
 */
export function tournamentLevelBlinds(tournament = {}, level = 1) {
  const factor = BLIND_GROWTH ** (clampTournamentLevel(level) - 1);
  const baseSb = Number(tournament.baseSb) || 0;
  const baseBb = Number(tournament.baseBb) || 0;
  const baseAnte = Number(tournament.baseAnte) || 0;
  const bb = Math.round(baseBb * factor);
  const ante = baseAnte > 0 && baseBb > 0 ? Math.round((bb * baseAnte) / baseBb) : 0;
  return { sb: Math.round(baseSb * factor), bb, ante };
}
