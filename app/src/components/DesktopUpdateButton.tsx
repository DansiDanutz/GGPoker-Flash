import React, { useCallback, useEffect, useState } from 'react';
import { UPDATE_CHECK_MS, desktopBridge, readDesktopUpdate, updateTitle, type DesktopUpdateStatus } from '../lib/desktopUpdate';

/** Desktop titlebar: shows "Update" when this app's build differs from dangg.live. */
export function DesktopUpdateButton() {
  const [status, setStatus] = useState<DesktopUpdateStatus>({ outdated: false });
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => setStatus(await readDesktopUpdate()), []);

  useEffect(() => {
    if (!desktopBridge()) return undefined;
    void check();
    const timer = window.setInterval(() => void check(), UPDATE_CHECK_MS);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [check]);

  if (!status.outdated) return null;

  const apply = async () => {
    setBusy(true);
    try {
      if (!(await desktopBridge()?.applyUpdate?.())) {
        setStatus({ outdated: false });
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="title-update" title={updateTitle(status)} disabled={busy} onClick={apply}>
      <span className="title-update-dot" aria-hidden="true" />
      {busy ? 'Updating…' : 'Update'}
    </button>
  );
}
