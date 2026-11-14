// The "Enable table & lobby animations" setting, applied to the whole app: when it is off (or the
// system asks for reduced motion) the root carries MOTION_OFF_CLASS and motion.css stops animations.

export const MOTION_OFF_CLASS = 'motion-off';

export function shouldFreezeMotion({ enabled, reducedMotion }: { enabled: boolean; reducedMotion: boolean }): boolean {
  return !enabled || reducedMotion;
}

/** Sets or clears the motion-off class on <html> to match the animations setting. */
export function applyMotionPref(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(MOTION_OFF_CLASS, !enabled);
}

/** True when animations are switched off in settings or the system prefers reduced motion. */
export function isMotionOff(): boolean {
  if (typeof window === 'undefined') return false;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const enabled = !document.documentElement.classList.contains(MOTION_OFF_CLASS);
  return shouldFreezeMotion({ enabled, reducedMotion });
}
