#!/usr/bin/env node
// Simulates each catalogue game to report its return to player and hit rate.
import { SLOT_GAMES, spinSlots } from '../app/server/slots.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const spins = Number(process.argv[2] || 200000);
for (const game of SLOT_GAMES) {
  const random = seeded(20261114 + game.id.length * 31);
  let won = 0, hits = 0;
  const bet = 1000;
  for (let i = 0; i < spins; i++) {
    const r = spinSlots(bet, random, game.id);
    won += r.win; if (r.win > 0) hits++;
  }
  console.log(`${game.id.padEnd(14)} rtp=${(won / (bet * spins)).toFixed(4)} hit=${(hits / spins).toFixed(3)} bets=${game.bets.join('/')}`);
}
