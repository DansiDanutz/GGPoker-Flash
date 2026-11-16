// Rising sparks (login trophy, phone home banners): a small 2D-canvas particle loop.
// The caller supplies the emitter in canvas pixels, so the sparks line up with the trophy in
// whatever art is showing.
import { isMotionOff } from './motion';

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  hue: number;
}

/** Emitter centre and horizontal spread, in CSS pixels of the canvas. */
export interface Emitter {
  readonly x: number;
  readonly y: number;
  readonly spread: number;
}

interface SparkOptions {
  readonly still: boolean;
  readonly emitterFor: (width: number, height: number) => Emitter;
  /** Base hues to pick from; defaults to mostly gold with a few pink sparks. */
  readonly hues?: readonly number[];
}

const DEFAULT_HUES: readonly number[] = Object.freeze([42, 45, 48, 50, 44, 46, 340]);
const HUE_JITTER = 8;

const MAX_DPR = 1.5;
const DENSITY = 0.00009; // sparks per CSS pixel of area
const MIN_SPARKS = 24;
const MAX_SPARKS = 90;
const STILL_FRAMES = 140; // frames simulated before drawing a single still frame

function spawn(emitter: Emitter, hues: readonly number[]): Spark {
  const ttl = 2.6 + Math.random() * 3.4;
  return {
    x: emitter.x + (Math.random() - 0.5) * emitter.spread,
    y: emitter.y + (Math.random() - 0.3) * emitter.spread * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -(18 + Math.random() * 46),
    life: 0,
    ttl,
    size: 0.7 + Math.random() * 2.1,
    hue: hues[Math.floor(Math.random() * hues.length)] + (Math.random() - 0.5) * HUE_JITTER,
  };
}

function drawSpark(ctx: CanvasRenderingContext2D, s: Spark): void {
  const t = s.life / s.ttl;
  const alpha = Math.sin(Math.PI * t) * 0.95;
  const r = s.size * (1 + 2.6 * (1 - t));
  const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3);
  glow.addColorStop(0, `hsla(${s.hue}, 100%, 82%, ${alpha})`);
  glow.addColorStop(0.35, `hsla(${s.hue}, 100%, 60%, ${alpha * 0.45})`);
  glow.addColorStop(1, `hsla(${s.hue}, 100%, 50%, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Starts the spark loop on `canvas`; returns a cleanup function. */
export function startSparks(canvas: HTMLCanvasElement, { still: stillOption, emitterFor, hues = DEFAULT_HUES }: SparkOptions): () => void {
  const still = stillOption || isMotionOff();
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let w = 0;
  let h = 0;
  let sparks: Spark[] = [];
  let emitter: Emitter = { x: 0, y: 0, spread: 0 };
  let frame = 0;
  let last = performance.now();

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    emitter = emitterFor(w, h);
    const target = Math.max(MIN_SPARKS, Math.min(MAX_SPARKS, Math.round(w * h * DENSITY)));
    sparks = Array.from({ length: target }, () => {
      const s = spawn(emitter, hues);
      return { ...s, life: Math.random() * s.ttl };
    });
  };

  const step = (dt: number) => {
    sparks = sparks.map((s) => {
      const life = s.life + dt;
      if (life >= s.ttl) return spawn(emitter, hues);
      return { ...s, life, x: s.x + (s.vx + Math.sin(life * 2 + s.size) * 6) * dt, y: s.y + s.vy * dt };
    });
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    sparks.forEach((s) => drawSpark(ctx, s));
    ctx.globalCompositeOperation = 'source-over';
  };

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    draw();
    frame = requestAnimationFrame(loop);
  };

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  if (still) {
    for (let i = 0; i < STILL_FRAMES; i++) step(1 / 60);
    draw();
  } else {
    frame = requestAnimationFrame(loop);
  }
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
}
