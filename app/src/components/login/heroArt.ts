import type { Emitter } from '../../lib/sparks';

/** One login backdrop: its pixel size, CSS background-position and where the trophy rim sits. */
export interface HeroArt {
  readonly width: number;
  readonly height: number;
  /** background-position as fractions (0..1), matching login-hero.css. */
  readonly posX: number;
  readonly posY: number;
  /** Trophy rim centre and spark spread, as fractions of the image. */
  readonly rimX: number;
  readonly rimY: number;
  readonly spread: number;
}

export const DESKTOP_ART: HeroArt = Object.freeze({
  width: 1024, height: 1536, posX: 0.5, posY: 0.72, rimX: 0.48, rimY: 0.59, spread: 0.36,
});

export const PHONE_ART: HeroArt = Object.freeze({
  width: 1672, height: 941, posX: 0.92, posY: 0.5, rimX: 0.733, rimY: 0.35, spread: 0.2,
});

/** The phone splash shows the portrait art in its top part only (see .lh-splash in login-hero.css). */
export const SPLASH_ART_HEIGHT = 0.72;
export const SPLASH_ART: HeroArt = Object.freeze({ ...DESKTOP_ART, posY: 0.7 });

/** Maps the trophy rim into a box showing `art` with `background-size: cover`. */
export function coverEmitter(art: HeroArt, boxW: number, boxH: number): Emitter {
  const scale = Math.max(boxW / art.width, boxH / art.height);
  const drawnW = art.width * scale;
  const drawnH = art.height * scale;
  const offsetX = (boxW - drawnW) * art.posX;
  const offsetY = (boxH - drawnH) * art.posY;
  return {
    x: offsetX + art.rimX * drawnW,
    y: offsetY + art.rimY * drawnH,
    spread: art.spread * drawnW,
  };
}
