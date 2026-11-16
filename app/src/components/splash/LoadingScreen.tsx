import React, { useEffect, useRef, useState } from 'react';
import { startSparks } from '../../lib/sparks';
import { LOADING_STEP_MS, loadingStep } from './loadingSteps';
import { CreatorCredit } from '../brand/CreatorCredit';
import '../../loading-screen.css';

/** The four 3D chips from the login art, orbiting the logo (order sets their place on the orbit). */
const ORBIT_CHIPS: readonly string[] = Object.freeze(['red', 'purple', 'gold', 'black']);

/** Sparks rise from just under the logo, across about half the screen width. */
const SPARK_Y = 0.6;
const SPARK_SPREAD = 0.5;
const SPARK_HUES: readonly number[] = Object.freeze([40, 44, 48, 50, 46, 0, 340]);

interface LoadingScreenProps {
  readonly logo: string;
  readonly name: string;
}

/**
 * The screen shown while the app connects, before the login page: the DanGG logo in a spinning
 * gold halo, the login chips orbiting it, rising sparks, a gold progress bar and status lines.
 */
export function LoadingScreen({ logo, name }: LoadingScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return startSparks(canvas, {
      still,
      hues: SPARK_HUES,
      emitterFor: (w, h) => ({ x: w / 2, y: h * SPARK_Y, spread: Math.min(w, 900) * SPARK_SPREAD }),
    });
  }, []);

  useEffect(() => {
    const started = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - started), LOADING_STEP_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="ls" role="status" aria-live="polite">
      <div className="ls-glow" aria-hidden="true" />
      <canvas className="ls-sparks" ref={canvasRef} aria-hidden="true" />
      <div className="ls-stage">
        <div className="ls-halo" aria-hidden="true" />
        {ORBIT_CHIPS.map((chip, i) => (
          <span key={chip} className="ls-orbit" style={{ '--ls-i': i } as React.CSSProperties} aria-hidden="true">
            <img className="ls-chip" src={`/assets/login/chip-${chip}.webp`} alt="" />
          </span>
        ))}
        <div className="ls-logo" style={{ '--ls-logo': `url("${logo}")` } as React.CSSProperties}>
          <img src={logo} alt={name} />
        </div>
      </div>
      <p className="ls-tag">Play-money poker room</p>
      <div className="ls-bar" aria-hidden="true"><i /></div>
      <p className="ls-status">{loadingStep(elapsed)}</p>
      <CreatorCredit className="ls-credit" />
      <p className="ls-legal">Play money · 18+ · no real-money gambling</p>
    </div>
  );
}
