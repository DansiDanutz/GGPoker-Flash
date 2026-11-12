import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APP_BUILD, APP_VERSION, buildLabel } from '../lib/version';
import { dropStaleCaches, isCurrentVersion, readServerVersion, reloadForBuild, type ServerVersion } from '../lib/versionCheck';

type Phase = 'checking' | 'ready' | 'updating' | 'blocked';

const ATTEMPTS_KEY = 'ggpoker.versionAttempts';

export function VersionGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [latest, setLatest] = useState<ServerVersion | null>(null);
  const busy = useRef(false);

  const forceUpdate = useCallback(async (server: ServerVersion, manual = false) => {
    if (busy.current) return;
    busy.current = true;
    setLatest(server);
    setPhase('updating');
    const attempts = Number(sessionStorage.getItem(ATTEMPTS_KEY) || '0') + (manual ? 0 : 1);
    sessionStorage.setItem(ATTEMPTS_KEY, String(attempts));
    if (!manual && attempts > 2) {
      setPhase('blocked');
      busy.current = false;
      return;
    }
    await dropStaleCaches();
    window.setTimeout(() => setPhase('blocked'), 6000);
    reloadForBuild(server);
  }, []);

  const check = useCallback(async (initial: boolean) => {
    const server = await readServerVersion();
    if (!server || isCurrentVersion(server)) {
      if (initial) {
        sessionStorage.removeItem(ATTEMPTS_KEY);
        setPhase('ready');
      }
      return;
    }
    await forceUpdate(server);
  }, [forceUpdate]);

  useEffect(() => {
    // The Vite dev server computes a fresh stamp while the API may still serve
    // the last dist/version.json; never fight that loop during development.
    if (import.meta.env.DEV) { setPhase('ready'); return; }
    void check(true);
  }, [check]);

  // Every time the app is brought back to the foreground, re-check. This is
  // where an installed phone picks up a deploy made while it was in the
  // background, without waiting for the next cold start.
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  if (phase === 'ready') return <>{children}</>;

  if (phase === 'blocked') {
    return (
      <div className="version-gate">
        <div className="version-gate-card">
          <div className="version-gate-brand">Dan<b>GG</b></div>
          <h1>Update required</h1>
          <p>This build is out of date. Reload to play the latest version.</p>
          <p className="version-gate-versions">
            Your build: v{APP_VERSION} · {buildLabel(APP_BUILD)}<br />
            Latest build: v{latest?.version || '—'} · {buildLabel(latest?.build || '')}
          </p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.setItem(ATTEMPTS_KEY, '0');
              const server = latest || { version: APP_VERSION, build: APP_BUILD };
              void forceUpdate(server, true);
            }}
          >
            Update now
          </button>
          <p className="version-gate-hint">If this keeps happening, close the app completely and reopen it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="version-gate">
      <div className="version-gate-card">
        <div className="version-gate-brand">Dan<b>GG</b></div>
        <div className="version-gate-spinner" aria-hidden="true" />
        <p>{phase === 'updating' ? 'Updating to the latest version…' : 'Checking version…'}</p>
      </div>
    </div>
  );
}
