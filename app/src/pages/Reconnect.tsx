import React, { useState } from 'react';
import { useApp } from '../lib/store';

export function Reconnect() {
  const { brand, refreshUser, logout } = useApp();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    try { await refreshUser(3); } finally { setBusy(false); }
  };

  return (
    <div className="reconnect-screen">
      <div className="reconnect-card">
        <img className="reconnect-logo" src={brand.logo} alt="DanGG" />
        <p className="install-kicker">NO CONNECTION</p>
        <h1 className="reconnect-title">Can&apos;t reach DanGG</h1>
        <p className="reconnect-sub">
          Your session is saved on this phone. Check your connection and try again —
          you will come straight back to the lobby.
        </p>
        <button className="btn btn-red btn-block install-primary" onClick={retry} disabled={busy}>
          {busy ? 'Reconnecting…' : 'Try again'}
        </button>
        <button className="install-skip" onClick={logout}>Log in with another account</button>
      </div>
    </div>
  );
}
