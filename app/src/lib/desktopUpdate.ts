// The desktop app's update check (electron/update.cjs answers through the preload bridge).

export type DesktopVersion = { readonly version: string; readonly build: string };
export type DesktopUpdateStatus = {
  readonly outdated: boolean;
  readonly local?: DesktopVersion | null;
  readonly live?: DesktopVersion | null;
};

type UpdateBridge = {
  updateStatus?: () => Promise<DesktopUpdateStatus>;
  applyUpdate?: () => Promise<boolean>;
};

/** Re-check every 30 minutes while the app stays open. */
export const UPDATE_CHECK_MS = 30 * 60 * 1000;

export function desktopBridge(): UpdateBridge | null {
  const bridge = typeof window !== 'undefined' ? (window as unknown as { ggDesktop?: UpdateBridge }).ggDesktop : undefined;
  return bridge && typeof bridge.updateStatus === 'function' ? bridge : null;
}

/** Status from the desktop shell; anything unexpected (or no desktop shell) means no update. */
export async function readDesktopUpdate(bridge: UpdateBridge | null = desktopBridge()): Promise<DesktopUpdateStatus> {
  if (!bridge?.updateStatus) return { outdated: false };
  try {
    const status = await bridge.updateStatus();
    return status && status.outdated === true ? status : { outdated: false };
  } catch {
    return { outdated: false };
  }
}

/** Tooltip text for the button: which build this copy runs and which build is live. */
export function updateTitle(status: DesktopUpdateStatus): string {
  const local = status.local ? `v${status.local.version} (${status.local.build})` : 'unknown';
  const live = status.live ? `v${status.live.version} (${status.live.build})` : 'unknown';
  return `This app: ${local}. Live: ${live}. Update switches the app to dangg.live.`;
}
