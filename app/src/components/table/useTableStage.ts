import { useEffect, useState, type RefObject } from 'react';
import { stageBox, stageMode, type StageBox, type StageMode } from '../../game/tableStage';

/** `short`: a wide table on a short screen (landscape phone) that needs compact seats. */
export type Stage = StageBox & { mode: StageMode; short: boolean };

const SHORT_SCREEN = 520;

const FALLBACK_TOP_BAR = 44;
const FALLBACK_ACTION_BAR = 110;

function measure(screen: HTMLElement | null): Stage {
  const width = screen?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1440);
  const height = screen?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 900);
  const topBar = (screen?.querySelector('.table-topbar') as HTMLElement | null)?.offsetHeight ?? FALLBACK_TOP_BAR;
  const actionBar = (screen?.querySelector('.action-bar') as HTMLElement | null)?.offsetHeight ?? FALLBACK_ACTION_BAR;
  const mode = stageMode(width, height);
  return { ...stageBox({ width, height, topBar, actionBar }), mode, short: mode === 'wide' && height < SHORT_SCREEN };
}

const same = (a: Stage, b: Stage) =>
  a.mode === b.mode && a.short === b.short && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

/** The rail box for the current screen, re-measured when the screen, top bar or action bar resize. */
export function useTableStage(screenRef: RefObject<HTMLElement | null>, remeasureKey: unknown): Stage {
  const [stage, setStage] = useState<Stage>(() => measure(null));
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const update = () => setStage((prev) => { const next = measure(screen); return same(prev, next) ? prev : next; });
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(screen);
    for (const sel of ['.table-topbar', '.action-bar']) {
      const el = screen.querySelector(sel);
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [screenRef, remeasureKey]);
  return stage;
}
