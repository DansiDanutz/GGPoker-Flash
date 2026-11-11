/* Phone install helpers.
 *
 * Chrome/Android fires `beforeinstallprompt`; we hold the event and replay it
 * from the "Download App" button. Safari/iOS has no install API, so the same
 * screen shows the Share -> Add to Home Screen steps instead. Both paths end in
 * a standalone window launched from the home-screen icon.
 */

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

export type Platform = 'ios' | 'android' | 'other';

const PENDING_KEY = 'ggpoker.installPending';
const SKIPPED_KEY = 'ggpoker.installSkipped';

let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    try { listener(); } catch { /* a broken subscriber must not break install */ }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    localStorage.removeItem(PENDING_KEY);
    localStorage.setItem(SKIPPED_KEY, '1');
    emit();
  });
  // Launching from the home-screen icon: the install goal is already met.
  const standaloneQuery = window.matchMedia('(display-mode: standalone)');
  standaloneQuery.addEventListener?.('change', (event) => {
    if (event.matches) {
      localStorage.removeItem(PENDING_KEY);
      emit();
    }
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  // iPadOS reports a desktop Mac UA; multi-touch is the giveaway.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

export function isPhone(): boolean {
  if (typeof window === 'undefined') return false;
  if (detectPlatform() !== 'other') return true;
  return window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
}

export function installPending(): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandalone()) {
    localStorage.removeItem(PENDING_KEY);
    return false;
  }
  return localStorage.getItem(PENDING_KEY) === '1' && localStorage.getItem(SKIPPED_KEY) !== '1';
}

/** Called right after a new account is created on a phone. */
export function markInstallPending(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PENDING_KEY, '1');
  localStorage.removeItem(SKIPPED_KEY);
  emit();
}

export function skipInstall(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PENDING_KEY);
  localStorage.setItem(SKIPPED_KEY, '1');
  emit();
}

export function completeInstall(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PENDING_KEY);
  localStorage.setItem(SKIPPED_KEY, '1');
  emit();
}

export function installPromptAvailable(): boolean {
  return deferredPrompt !== null;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') completeInstall();
    return choice.outcome;
  } catch {
    return 'dismissed';
  }
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
