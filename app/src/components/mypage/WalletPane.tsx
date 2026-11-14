import React, { useState } from 'react';
import { money } from '../../lib/api';
import { useApp } from '../../lib/store';
import { sound } from '../../lib/sound';

/** My Wallet (reference 040): the four balances, ticket row and refresh. */
export function WalletPane() {
  const { user, refreshUser, navigate, toast } = useApp();
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      await refreshUser();
      sound.play('coin', { volume: .35 });
      toast({ kind: 'info', title: 'Wallet refreshed' });
    } finally { setBusy(false); }
  };

  const cards = [
    { key: 'usd', label: 'USD Available', value: money(user?.balance ?? 0), accent: 'gold' },
    { key: 'poker', label: 'Poker Dollar', value: `P$${(user?.play_chips ?? 0).toLocaleString()}`, accent: 'gold' },
    { key: 'tournament', label: 'Tournament Dollar', value: `T$${(user?.tickets ?? 0).toLocaleString()}`, accent: 'gold' },
    { key: 'gems', label: 'Gems', value: (user?.gems ?? 0).toLocaleString(), accent: 'violet' },
  ];

  return (
    <div className="wallet">
      <button type="button" className="wallet-refresh" onClick={refresh} disabled={busy}>
        <span aria-hidden="true">↻</span> {busy ? 'Refreshing…' : 'Refresh'}
      </button>

      <div className="wallet-cards">
        {cards.map((c) => (
          <div key={c.key} className={'wallet-card wallet-' + c.accent}>
            <span className="wallet-label">{c.label} <i aria-hidden="true">i</i></span>
            <b>{c.value}</b>
            {c.key === 'poker' && (
              <button type="button" className="wallet-chip-btn" onClick={() => navigate('/rewards')}>Receive chips</button>
            )}
          </div>
        ))}
      </div>

      <div className="wallet-ticket">
        <span className="wallet-ticket-label">Ticket <i aria-hidden="true">i</i></span>
        <b>{user?.tickets ?? 0}</b>
        <button type="button" className="wallet-ticket-link" onClick={() => navigate('/rewards')}>Get more</button>
      </div>

      <div className="wallet-actions">
        <button type="button" className="wallet-action" onClick={() => navigate('/cashier')}>Cashier &amp; transactions</button>
        <button type="button" className="wallet-action" onClick={() => navigate('/rewards')}>Daily freebie</button>
      </div>

      <p className="wallet-note">Play money only. Balances have no cash value and cannot be withdrawn.</p>
    </div>
  );
}
