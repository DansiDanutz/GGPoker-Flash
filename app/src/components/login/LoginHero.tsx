import React, { useEffect, useRef } from 'react';
import { startSparks } from './sparks';
import { coverEmitter, DESKTOP_ART, PHONE_ART, SPLASH_ART, SPLASH_ART_HEIGHT } from './heroArt';
import type { Emitter } from './sparks';
import '../../login-hero.css';

/** Floating chips in front of the backdrop. `depth` scales pointer parallax. */
interface FloatingChip {
  readonly src: string;
  readonly className: string;
  readonly depth: number;
}

const CHIPS: readonly FloatingChip[] = Object.freeze([
  { src: '/assets/login/chip-red.webp', className: 'lh-chip lh-chip-red', depth: 0.9 },
  { src: '/assets/login/chip-purple.webp', className: 'lh-chip lh-chip-purple', depth: 0.55 },
  { src: '/assets/login/chip-gold.webp', className: 'lh-chip lh-chip-gold', depth: 1.4 },
  { src: '/assets/login/chip-black.webp', className: 'lh-chip lh-chip-black', depth: 0.35 },
]);

const PARALLAX_PX = 18;
const PHONE_QUERY = '(max-width: 760px)';

type HeroVariant = 'panel' | 'splash';

interface LoginHeroProps {
  /** `panel`: the art column beside the login card (with headline). `splash`: full-screen phone splash backdrop. */
  readonly variant?: HeroVariant;
}

function emitterFor(variant: HeroVariant, isPhone: boolean, w: number, h: number): Emitter {
  if (variant === 'splash') return coverEmitter(SPLASH_ART, w, h * SPLASH_ART_HEIGHT);
  return coverEmitter(isPhone ? PHONE_ART : DESKTOP_ART, w, h);
}

/**
 * Login hero: photo-real backdrop, drifting gold sparks, floating chips with pointer parallax and
 * the gold headline. Decorative only (the page has its own sr-only heading).
 */
export function LoginHero({ variant = 'panel' }: LoginHeroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const phone = window.matchMedia(PHONE_QUERY);
    return startSparks(canvas, { still: reduced, emitterFor: (w, h) => emitterFor(variant, phone.matches, w, h) });
  }, [variant]);

  useEffect(() => {
    const root = rootRef.current;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!root || !finePointer || reduced) return undefined;
    const onMove = (e: PointerEvent) => {
      const box = root.getBoundingClientRect();
      const x = (e.clientX - box.left) / box.width - 0.5;
      const y = (e.clientY - box.top) / box.height - 0.5;
      root.style.setProperty('--lh-px', `${(x * PARALLAX_PX).toFixed(1)}px`);
      root.style.setProperty('--lh-py', `${(y * PARALLAX_PX).toFixed(1)}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return (
    <div className={variant === 'splash' ? 'login2-hero lh-splash' : 'login2-hero'} ref={rootRef} aria-hidden="true">
      <div className="lh-backdrop" />
      <div className="lh-glow" />
      <canvas className="lh-sparks" ref={canvasRef} />
      {CHIPS.map((chip) => (
        <img key={chip.src} className={chip.className} src={chip.src} alt="" draggable={false}
          style={{ '--lh-depth': chip.depth } as React.CSSProperties} />
      ))}
      {variant === 'panel' && (
        <div className="lh-copy">
          <p className="lh-kicker">DanGG · Play money poker</p>
          <p className="lh-title"><span>Pull up</span><span>a chair</span></p>
          <p className="lh-sub">Real tables · play chips · zero cash at stake</p>
        </div>
      )}
    </div>
  );
}
