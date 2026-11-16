// How each reaction lands on a seat: its own motion (table-reactions.css) and a short
// sound from the table set. Betting and win sounds are left out so a reaction never
// sounds like an action at the table.

export type ReactionSound = 'squeeze' | 'bubble' | 'cheer' | 'mission' | 'rabbit' | 'jackpot' | 'fish' | 'fireworks' | 'gather';

export type ReactionFx = Readonly<{ anim: string; sound: ReactionSound; volume: number }>;

const fx = (anim: string, sound: ReactionSound, volume: number): ReactionFx => Object.freeze({ anim, sound, volume });

/** Indexed by reaction id (1-12), in REACTION_LABELS order. */
export const REACTION_FX: Readonly<Record<number, ReactionFx>> = Object.freeze({
  1: fx('angry', 'squeeze', 0.5), // Angry: shakes and flushes red
  2: fx('thinking', 'bubble', 0.45), // Thinking: tilts slowly side to side
  3: fx('laughing', 'cheer', 0.4), // Laughing: bounces
  4: fx('nicehand', 'mission', 0.5), // Nice hand: thumbs-up nod with a gold glint
  5: fx('clap', 'cheer', 0.45), // Clap: quick squash pulses
  6: fx('crying', 'bubble', 0.4), // Crying: droops and sways
  7: fx('shocked', 'rabbit', 0.6), // Shocked: jolts up big
  8: fx('cool', 'jackpot', 0.35), // Cool: slides in with a tilt
  9: fx('fish', 'fish', 0.5), // Fish: swims side to side
  10: fx('shark', 'bubble', 0.5), // Shark: rises from below
  11: fx('onfire', 'fireworks', 0.35), // On fire: flickers with heat glow
  12: fx('shipit', 'gather', 0.55), // Ship it: coin-flip spin with a gold flash
});

const FALLBACK: ReactionFx = fx('pop', 'bubble', 0.5);

export function reactionFx(id: number): ReactionFx {
  return REACTION_FX[id] ?? FALLBACK;
}
