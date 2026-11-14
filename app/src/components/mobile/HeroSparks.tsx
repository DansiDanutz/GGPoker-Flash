import React, { useEffect, useRef } from 'react';
import { startSparks } from '../../lib/sparks';

/** Where the banner art's focal motif sits, as fractions of the hero card (see homeContent art). */
const FOCUS_X = 0.66;
const FOCUS_Y = 0.5;
const SPREAD = 0.42;

interface HeroSparksProps {
  /** Spark hues for the current slide; a new list restarts the effect in the new colours. */
  readonly hues: readonly number[];
}

/** Live layer over the phone home banner: sparks in the slide's colours around its focal motif. */
export function HeroSparks({ hues }: HeroSparksProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return startSparks(canvas, {
      still,
      hues,
      emitterFor: (w, h) => ({ x: w * FOCUS_X, y: h * FOCUS_Y, spread: w * SPREAD }),
    });
  }, [hues]);
  return <canvas className="p-hero-sparks" ref={canvasRef} aria-hidden="true" />;
}
