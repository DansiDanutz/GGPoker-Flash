import { useEffect, useRef } from 'react';

export function useModalIsolation<T extends HTMLElement>(active = true) {
  const dialog = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const root = dialog.current;
    if (!root) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const siblings = [...(root.parentElement?.children || [])].filter((element) => element !== root) as HTMLElement[];
    const previousInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    root.tabIndex = -1;
    root.focus();
    root.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return;
      if (event.key !== 'Tab') { event.stopPropagation(); return; }
      const controls = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length);
      if (!controls.length) { event.preventDefault(); root.focus(); event.stopPropagation(); return; }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      event.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      siblings.forEach((element, index) => { element.inert = previousInert[index]; });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [active]);
  return dialog;
}
