import { useEffect } from 'react';

/** How long a finger rests on an icon before its name shows, and how long the name stays. */
export const TIP_HOLD_MS = 1000;
export const TIP_LINGER_MS = 1500;

/**
 * Phones have no hover: pressing and holding a [data-tip] control for a second shows its
 * name (class tip-hold) and swallows the click that would follow, so a curious press
 * never toggles anything.
 */
export function useHoldTips(): void {
  useEffect(() => {
    let timer = 0;
    let hideTimer = 0;
    let held: Element | null = null;
    let showed = false;
    const clear = () => { window.clearTimeout(timer); timer = 0; };
    const onStart = (e: TouchEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
      if (!el) return;
      clear();
      held = el;
      showed = false;
      timer = window.setTimeout(() => {
        showed = true;
        el.classList.add('tip-hold');
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => el.classList.remove('tip-hold'), TIP_LINGER_MS);
      }, TIP_HOLD_MS);
    };
    const onEnd = (e: TouchEvent) => {
      clear();
      if (showed && held) e.preventDefault();
      held = null;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: false });
    document.addEventListener('touchmove', clear, { passive: true });
    document.addEventListener('touchcancel', clear, { passive: true });
    return () => {
      clear();
      window.clearTimeout(hideTimer);
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchmove', clear);
      document.removeEventListener('touchcancel', clear);
    };
  }, []);
}
