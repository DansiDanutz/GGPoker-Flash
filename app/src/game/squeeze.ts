// Render the original DanGG card art with a gesture-driven corner peel.

export type SqueezeTransform = { visible: boolean; x: number; y: number; scaleX: number; scaleY?: number; skewX: number; skewY: number };
export type SqueezeSlot = {
  transforms: SqueezeTransform[];
  masks: Array<{ array: Array<{ x: number; y: number }>; occluders?: Array<Array<{ x: number; y: number }>> }>;
};
export type SqueezeData = {
  frames: string[];
  inner: string;
  glyphs: Record<string, { x: number; y: number; w: number; h: number }>;
  slots: SqueezeSlot[];
  canvas: [number, number];
  container: [number, number];
  scale: number;
};

export function cardOrdinal(card: string): number {
  if (typeof card !== 'string' || !/^[2-9TJQKA][cdhs]$/.test(card)) throw new Error('Invalid squeeze card');
  return '23456789TJQKA'.indexOf(card[0]) * 4 + 'cdhs'.indexOf(card[1]);
}

export function squeezeWheelFrame(frame: number, deltaY: number): number {
  return Math.max(0, Math.min(60, frame + Math.sign(deltaY) * 6));
}

export function squeezeDragFrame(previous: number, dx: number, dy: number, hover = false): number {
  const distance = hover ? Math.abs(dy) : Math.hypot(dx, Math.min(0, dy));
  return Math.max(previous, 1, Math.min(60, Math.trunc((1 - (1 - Math.min(1, distance / 400)) ** 3) * 60)));
}

export function drawSqueeze(
  ctx: CanvasRenderingContext2D,
  data: SqueezeData,
  images: { frames: HTMLImageElement[]; inner: HTMLImageElement },
  cards: string[],
  frame: number,
) {
  if (!Number.isInteger(frame) || frame < 0 || frame > 60 || ![2, 4, 5, 6].includes(cards.length)
    || cards.length !== data.slots.length || new Set(cards).size !== cards.length) {
    throw new Error('Invalid squeeze frame or cards');
  }
  const ordinals = cards.map(cardOrdinal);
  ctx.clearRect(0, 0, 652, 484);
  ctx.save();
  ctx.translate(data.container[0], data.container[1]);
  ctx.scale(data.scale, data.scale);
  ctx.drawImage(images.frames[frame], 0, 0);
  for (let i = 0; i < cards.length; i += 1) {
    const t = data.slots[i]?.transforms?.[frame];
    const mask = data.slots[i]?.masks?.[frame];
    if (!t?.visible || !mask) continue;
    const r = data.glyphs[ordinals[i]];
    if (!r) continue;
    const sx = t.scaleX / 100;
    const sy = (t.scaleY ?? t.scaleX) / 100;
    const x = t.skewX * Math.PI / 180;
    const y = t.skewY * Math.PI / 180;
    ctx.save();
    ctx.beginPath();
    mask.array.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    for (const cover of mask.occluders || []) {
      ctx.beginPath();
      ctx.rect(0, 0, 652, 484);
      cover.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.clip('evenodd');
    }
    // The lifted face follows the same perspective projection as its card art.
    ctx.transform(sx * Math.cos(y), sx * Math.sin(y), -sy * Math.sin(x), sy * Math.cos(x), t.x, t.y);
    ctx.drawImage(images.inner, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    ctx.restore();
  }
  ctx.restore();
}

const assets = new Map<number, Promise<{ data: SqueezeData; images: { frames: HTMLImageElement[]; inner: HTMLImageElement } }>>();

export function loadSqueeze(count = 2) {
  const format = ({ 2: 'holdem', 4: 'plo', 5: 'plo5', 6: 'plo6' } as Record<number, string>)[count];
  if (!format) throw new Error('Unsupported squeeze card count');
  if (!assets.has(count)) {
    assets.set(count, (async () => {
      const res = await fetch(`/assets/squeeze/native-squeeze-${format}.json`);
      if (!res.ok) throw new Error('Squeeze data unavailable');
      const data = (await res.json()) as SqueezeData;
      const load = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return image;
      };
      const [frames, inner] = await Promise.all([Promise.all(data.frames.map(load)), load(data.inner)]);
      return { data, images: { frames, inner } };
    })().catch((error) => { assets.delete(count); throw error; }));
  }
  return assets.get(count)!;
}

export function createSqueezeMotion(paint: (frame: number) => void, complete: () => void, reducedMotion = false) {
  let frame = 0;
  let raf = 0;
  let generation = 0;
  let closed = false;
  let opening = false;
  let wheelTarget: number | null = null;
  const stop = () => { generation += 1; cancelAnimationFrame(raf); raf = 0; };
  const set = (value: number) => { frame = Math.max(0, Math.min(60, value)); paint(frame); };
  function tween(target: number, duration: number, hold = 0, done?: () => void) {
    stop();
    if (reducedMotion) { set(target); if (target === 60) { closed = true; complete(); } else done?.(); return; }
    const version = generation;
    const start = performance.now();
    const from = frame;
    const tick = (now: number) => {
      if (closed || version !== generation) return;
      const progress = duration ? Math.min(1, (now - start) / duration) : 1;
      set(from + (target - from) * (1 - (1 - progress) ** 3));
      if (progress < 1 || now - start < duration + hold) { raf = requestAnimationFrame(tick); return; }
      raf = 0;
      if (target === 60) { closed = true; complete(); } else done?.();
    };
    raf = requestAnimationFrame(tick);
  }
  return {
    get frame() { return Math.trunc(frame); },
    get closed() { return closed; },
    wheel(delta: number) {
      if (!closed && !opening && delta) {
        wheelTarget = squeezeWheelFrame(wheelTarget ?? Math.trunc(frame), delta);
        tween(wheelTarget, 100);
      }
    },
    hover(done: () => void) {
      if (!closed && !opening) { wheelTarget = null; tween(15, 100, 0, done); }
    },
    press(done: () => void) {
      if (closed || opening) return;
      wheelTarget = null;
      if (frame < 15) tween(15, 100, 0, done); else { stop(); done?.(); }
    },
    drag(dx: number, dy: number, hover = false) {
      if (closed || opening) return;
      wheelTarget = null;
      stop();
      set(squeezeDragFrame(frame, dx, dy, hover));
      if (frame === 60) { closed = true; complete(); }
    },
    release(inside = false) {
      if (!closed && !opening) {
        wheelTarget = null;
        tween(frame <= 46 ? (inside ? 15 : 0) : 60, frame <= 46 ? 200 : (60 - frame) * 10);
      }
    },
    open() { if (!closed && !opening) { opening = true; tween(60, (60 - frame) * 10, 500); } },
    dispose() { stop(); closed = true; },
  };
}

/**
 * Mount the squeeze panel. `onClose` runs after the reveal or on failure, and
 * the returned function tears the panel down immediately.
 */
export function createSqueezePanel(
  parent: HTMLElement,
  cards: string[],
  onClose: (error?: Error) => void,
  playCues: (names: string[]) => void = () => {},
  enable3D = false,
  hand?: () => HTMLElement | null,
) {
  const panel = document.createElement('section');
  const canvas = document.createElement('canvas');
  const felt = new Image();
  const button = document.createElement('button');
  panel.className = 'cardSqueeze';
  panel.dataset.cards = String(cards.length);
  panel.setAttribute('aria-label', 'Card Squeeze');
  panel.setAttribute('aria-busy', 'true');
  canvas.width = 652;
  canvas.height = 484;
  canvas.setAttribute('aria-label', 'Squeeze your face-down hole cards');
  canvas.tabIndex = 0;
  felt.src = '/assets/squeeze/native-squeeze-felt.png';
  felt.alt = '';
  button.type = 'button';
  button.textContent = 'Open';
  button.disabled = true;
  button.className = 'squeezeOpen';
  panel.append(felt, canvas, button);
  parent.append(panel);

  let returnCleanup: (() => void) | undefined;
  let finishing = false;
  let disposed = false;
  let motion: ReturnType<typeof createSqueezeMotion> | null = null;
  let releaseRenderer: (() => void) | undefined;
  let start: { x: number; y: number } | null = null;
  let current = { x: 0, y: 0 };
  let pressed = false;
  let hovering = false;

  const dispose = () => {
    disposed = true;
    motion?.dispose();
    returnCleanup?.();
    releaseRenderer?.();
    panel.remove();
  };
  function finish() {
    if (disposed || finishing) return;
    finishing = true;
    button.hidden = true;
    button.disabled = true;
    motion?.dispose();
    const target = hand?.();
    if (target && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panel.dataset.phase = 'returning';
      panel.style.pointerEvents = 'none';
      returnCleanup = returnSqueezeCards(canvas, parent, target, () => { if (!disposed) { dispose(); onClose(); } });
    } else { dispose(); onClose(); }
  }

  loadSqueeze(cards.length).then(async ({ data, images }) => {
    if (disposed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Squeeze canvas unavailable');
    let surface: { paint: (frame: number) => void; dispose: () => void } | undefined;
    let lost = false;
    const gpuCanvas = document.createElement('canvas');
    const paint = (frame: number) => {
      if (surface && !lost) {
        surface.paint(frame);
        ctx.clearRect(0,0,652,484);
        ctx.drawImage(gpuCanvas,0,0);
      } else drawSqueeze(ctx, data, images, cards, Math.trunc(frame));
      panel.dataset.frame = String(Math.trunc(frame));
    };
    if (enable3D && cards.length === 2) {
      try {
        const { createSqueeze3D } = await import('./squeeze3d');
        if (disposed) return;
        surface = await createSqueeze3D(gpuCanvas, cards.map(cardOrdinal), () => {
          lost = true; surface?.dispose(); panel.dataset.renderer = '2d-fallback';
          if (!disposed) paint(motion?.frame ?? 0);
        });
        releaseRenderer = surface.dispose;
        if (disposed || lost) { surface.dispose(); if (disposed) return; }
      } catch { lost = true; }
    }
    panel.dataset.renderer = surface && !lost ? 'webgl' : enable3D ? '2d-fallback' : '2d-default';
    motion = createSqueezeMotion(paint, finish, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    paint(0);
    panel.setAttribute('aria-busy', 'false');
    button.disabled = false;
    button.onclick = () => {
      button.hidden = true;
      playCues(['SqueezeOpen']);
      motion?.open();
    };
    const point = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left) * 652 / rect.width, y: (e.clientY - rect.top) * 484 / rect.height };
    };
    const anchor = () => {
      if (!motion) return;
      start = { x: current.x, y: current.y + 400 * (1 - (1 - motion.frame / 60) ** (1 / 3)) };
    };
    const hoverArea = (p: { x: number; y: number }) => p.x > 160 && p.x < 590 && p.y > 292 && p.y < 392;
    canvas.onwheel = (e) => { e.preventDefault(); start = null; hovering = false; motion?.wheel(e.deltaY); };
    canvas.onpointerenter = (e) => {
      if (e.pointerType !== 'mouse' || pressed) return;
      current = point(e);
      hovering = hoverArea(current);
      motion?.hover(() => { if (!disposed) anchor(); });
    };
    canvas.onpointerleave = () => { if (!pressed) { start = null; hovering = false; motion?.release(false); } };
    canvas.onpointerdown = (e) => {
      e.preventDefault();
      pressed = true;
      hovering = false;
      start = null;
      current = point(e);
      canvas.setPointerCapture(e.pointerId);
      motion?.press(() => { if (pressed && !disposed) anchor(); });
    };
    canvas.onpointermove = (e) => {
      current = point(e);
      if (e.pointerType === 'mouse' && !pressed && !hovering && hoverArea(current)) { hovering = true; anchor(); }
      if (!start || (!pressed && !hovering)) return;
      start.y = Math.max(start.y, current.y);
      motion?.drag(current.x - start.x, current.y - start.y, !pressed);
    };
    canvas.onpointerup = (e) => {
      if (!pressed) return;
      pressed = false;
      hovering = false;
      start = null;
      current = point(e);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      motion?.release(e.pointerType === 'mouse' && e.type === 'pointerup' && current.x >= 0 && current.x <= 652 && current.y >= 0 && current.y <= 484);
    };
    canvas.onpointercancel = canvas.onpointerup;
    canvas.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); button.click(); }
    };
  }).catch((error: Error) => {
    if (!disposed) { dispose(); onClose(error); }
  });

  return dispose;
}

/** Dissolve the rendered cards into fragments and assemble the seated hand. */
export function returnSqueezeCards(source: HTMLCanvasElement, host: HTMLElement, hand: HTMLElement, done: () => void) {
  const overlay = document.createElement('canvas');
  overlay.className = 'squeeze-particles';
  overlay.setAttribute('aria-hidden', 'true');
  const bounds = host.getBoundingClientRect();
  const from = source.getBoundingClientRect();
  const pixelRatio = Math.min(devicePixelRatio, 2);
  overlay.width = Math.ceil(bounds.width * pixelRatio);
  overlay.height = Math.ceil(bounds.height * pixelRatio);
  Object.assign(overlay.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  const ctx = overlay.getContext('2d');
  const input = source.getContext('2d');
  const targets = [...hand.querySelectorAll<HTMLElement>('.card-slot')];
  if (!ctx || !input || !targets.length) { done(); return () => {}; }
  const pixels = input.getImageData(0, 0, source.width, source.height).data;
  const fragments: { x: number; y: number; color: string }[] = [];
  const step = 10;
  for (let y = 0; y < source.height; y += step) for (let x = 0; x < source.width; x += step) {
    const offset = (y * source.width + x) * 4;
    if (pixels[offset + 3] > 100) fragments.push({ x, y, color: `rgb(${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]})` });
  }
  if (!fragments.length) { done(); return () => {}; }
  const left = Math.min(...fragments.map(p => p.x)), right = Math.max(...fragments.map(p => p.x)) + step;
  const top = Math.min(...fragments.map(p => p.y)), bottom = Math.max(...fragments.map(p => p.y)) + step;
  // Cache geometry before drawing: no layout reads or trigonometry per fragment per frame.
  const rects = targets.map(n => n.getBoundingClientRect());
  const paths = fragments.map((particle, index) => {
    const unit = (particle.x - left) / (right - left) * targets.length;
    const target = rects[Math.min(targets.length - 1, Math.floor(unit))];
    return {
      sx: from.left - bounds.left + particle.x / source.width * from.width,
      sy: from.top - bounds.top + particle.y / source.height * from.height,
      tx: target.left - bounds.left + (unit % 1) * target.width,
      ty: target.top - bounds.top + (particle.y - top) / (bottom - top) * target.height,
      scatter: Math.sin(index * 2.4) * 16, lift: 18 + index % 18, color: particle.color,
    };
  });
  const previousVisibility = hand.style.visibility, previousOpacity = hand.style.opacity;
  const sourceOpacity = source.style.opacity;
  host.append(overlay);
  ctx.scale(pixelRatio, pixelRatio);
  let raf = 0, stopped = false;
  const start = performance.now();
  const dispose = () => {
    stopped = true; cancelAnimationFrame(raf); overlay.remove();
    source.style.opacity = sourceOpacity;
    hand.style.visibility = previousVisibility; hand.style.opacity = previousOpacity;
  };
  const frame = (now: number) => {
    if (stopped) return;
    if (!hand.isConnected || !source.isConnected) { dispose(); done(); return; }
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / 850);
    overlay.dataset.progress = progress.toFixed(3);
    ctx.clearRect(0, 0, bounds.width, bounds.height);
    source.style.opacity = String(Math.max(0, 1 - progress / .18));
    const travel = Math.max(0, Math.min(1, (progress - .08) / .72));
    const eased = travel ** 3 * (travel * (travel * 6 - 15) + 10);
    // Travel ends at 680 ms; hold the arrived particles for 150 ms before revealing.
    const assembled = Math.max(0, Math.min(1, (elapsed - 830) / 160));
    hand.style.visibility = 'visible'; hand.style.opacity = String(assembled);
    const arc = Math.sin(Math.PI * travel);
    const size = step / source.width * from.width * (1 - .7 * eased);
    ctx.globalAlpha = Math.min(1, progress / .16) * (1 - assembled);
    for (const particle of paths) {
      const x = particle.sx + (particle.tx - particle.sx) * eased + particle.scatter * arc;
      const y = particle.sy + (particle.ty - particle.sy) * eased - particle.lift * arc;
      ctx.fillStyle = particle.color; ctx.fillRect(x, y, size, size);
    }
    if (assembled < 1) raf = requestAnimationFrame(frame);
    else {
      // React closes the squeeze on the next commit; do not hide the assembled hand in between.
      hand.classList.remove('squeeze-target-hidden');
      dispose(); done();
    }
  };
  raf = requestAnimationFrame(frame);
  return dispose;
}
