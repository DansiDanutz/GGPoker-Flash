import React, { useEffect, useRef, useState } from 'react';
import '../../loading-screen.css';

export const INTRO_READ_MS = 3500;
const INTRO_IMAGE = '/assets/brand/openpoker-intro.png';

/** Keep the poster readable, then turn its pixels into the login backdrop. */
export function LoadingScreen({ ready, bypass = false, children }: { readonly ready: boolean; readonly bypass?: boolean; readonly children: React.ReactNode }) {
  const [read, setRead] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(bypass);
  const poster = useRef<HTMLImageElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!loaded && !failed) return;
    const timer = window.setTimeout(() => setRead(true), INTRO_READ_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, failed]);

  useEffect(() => {
    if (bypass) { setDone(true); return; }
    if (!read || !ready || done) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const surface = canvas.current;
    const source = poster.current;
    const context = surface?.getContext('2d');
    if (reduced || failed || !surface || !source || !context) {
      setLeaving(true);
      const timer = window.setTimeout(() => setDone(true), 200);
      return () => window.clearTimeout(timer);
    }
    let frame = 0;
    let cancelled = false;
    const target = new Image();
    const width = surface.width = innerWidth;
    const height = surface.height = innerHeight;
    const columns = 30;
    const rows = Math.min(72, Math.ceil(columns * height / width));
    const sample = document.createElement('canvas');
    sample.width = columns; sample.height = rows;
    const sampler = sample.getContext('2d')!;
    sampler.fillStyle = '#100516'; sampler.fillRect(0, 0, columns, rows);
    const scale = Math.min(width / source.naturalWidth, height / source.naturalHeight);
    const imageWidth = source.naturalWidth * scale;
    const imageHeight = source.naturalHeight * scale;
    sampler.drawImage(source, (width - imageWidth) / width * columns / 2, (height - imageHeight) / height * rows / 2, imageWidth / width * columns, imageHeight / height * rows);
    const from = sampler.getImageData(0, 0, columns, rows).data;
    let to = from;
    const start = performance.now();
    function draw(time: number) {
      if (cancelled) return;
      const progress = Math.min(1, (time - start) / 950);
      const ease = progress * progress * (3 - 2 * progress);
      const scatter = Math.sin(progress * Math.PI);
      context!.clearRect(0, 0, width, height);
      context!.globalAlpha = 1 - Math.max(0, (progress - .7) / .3);
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const index = (row * columns + column) * 4;
        const red = Math.round(from[index] + (to[index] - from[index]) * ease);
        const green = Math.round(from[index + 1] + (to[index + 1] - from[index + 1]) * ease);
        const blue = Math.round(from[index + 2] + (to[index + 2] - from[index + 2]) * ease);
        const x = (column + .5) * width / columns + Math.sin(row * 1.7 + column) * scatter * width * .12;
        const y = (row + .5) * height / rows + Math.cos(column * 1.3 + row) * scatter * height * .08;
        const size = 1 - scatter * .72;
        context!.fillStyle = `rgb(${red},${green},${blue})`;
        context!.fillRect(x - width / columns * size / 2, y - height / rows * size / 2, width / columns * size + 1, height / rows * size + 1);
      }
      if (progress < 1) frame = requestAnimationFrame(draw);
      else setDone(true);
    }
    target.onload = () => {
      if (cancelled) return;
      sampler.drawImage(target, 0, 0, columns, rows);
      to = sampler.getImageData(0, 0, columns, rows).data;
    };
    target.src = innerWidth > 760 ? '/assets/login/backdrop-wide.webp' : '/assets/login/backdrop.webp';
    setLeaving(true);
    frame = requestAnimationFrame(draw);
    return () => { cancelled = true; cancelAnimationFrame(frame); target.onload = null; };
  }, [read, ready, done, failed, bypass]);

  return <>
    <div className="ls-content" inert={!done && !bypass} aria-hidden={!done && !bypass ? true : undefined}>{children}</div>
    {!done && !bypass && <div className={`ls${leaving ? ' ls--leaving' : ''}`} role="status" aria-label="Introducing OpenPoker, the project behind DanGG">
      <img ref={poster} className="ls-poster" src={INTRO_IMAGE} alt="Hi, I’m Dan. Let me introduce you to OpenPoker, the open-source project behind DanGG. OpenPoker4all / OpenPoker on GitHub. Built by DansiDanutz." onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      {failed && <p className="ls-fallback">OpenPoker · The project behind DanGG<br />Built by DansiDanutz</p>}
      <canvas ref={canvas} className="ls-particles" aria-hidden="true" />
      {read && !ready && <div className="ls-progress"><progress aria-label="Connecting to DanGG" /><span>Connecting to DanGG…</span></div>}
    </div>}
  </>;
}
