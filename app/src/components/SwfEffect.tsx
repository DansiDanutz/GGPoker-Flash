import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    RufflePlayer?: any;
  }
}

let rufflePromise: Promise<void> | null = null;

function loadRuffle(): Promise<void> {
  if (window.RufflePlayer) return Promise.resolve();
  if (rufflePromise) return rufflePromise;
  rufflePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/ruffle/ruffle.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Ruffle failed to load'));
    document.head.appendChild(script);
  });
  return rufflePromise;
}

/** Transparent overlay that plays an official SWF through Ruffle. */
export function SwfEffect({ src, onDone, className = '' }: { src: string; onDone: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    let player: any = null;
    let timer = 0;
    (async () => {
      await loadRuffle();
      if (cancelled || !host.current) return;
      player = window.RufflePlayer!.newest().createPlayer();
      player.style.width = '100%';
      player.style.height = '100%';
      player.style.display = 'block';
      host.current.appendChild(player);
      const api = player.ruffle();
      api.config = {
        autoplay: 'on',
        unmuteOverlay: 'hidden',
        letterbox: 'on',
        wmode: 'transparent',
        scale: 'showAll',
        quality: 'high',
        menu: false,
        allowScriptAccess: false,
        allowNetworking: 'none',
      };
      await api.load(src);
      timer = window.setTimeout(() => doneRef.current(), 7000);
    })().catch((err) => {
      console.warn('SWF effect failed', err);
      timer = window.setTimeout(() => doneRef.current(), 1200);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      try { player?.remove(); } catch { /* ignore */ }
    };
  }, [src]);

  return <div ref={host} className={'swf-effect ' + className} aria-hidden="true" />;
}
