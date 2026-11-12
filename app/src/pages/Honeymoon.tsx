import React, { useEffect, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';

export function Honeymoon() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => { try { setData(await api.honeymoon()); } catch { /* ignore */ } };
  useEffect(() => { load(); }, []);

  const claim = async (step: string) => {
    setBusy(step);
    try {
      const r = await api.claimHoneymoon(step);
      sound.play('mission');
      toast({ kind: 'reward', title: 'Welcome Bonus gift', body: money(r.amount) });
      await load(); await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Welcome Bonus', body: e.message }); }
    finally { setBusy(null); }
  };

  return (
    <PageShell activeTop="poker">
      <div className="page" style={{ paddingTop: 12 }}>
        <div className="honey-hero">
          <img src="/assets/ui/discover/Bg_Discover_Honeymoon.png" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="honey-overlay" />
          <div className="honey-content">
            <div className="th-kicker">NEW PLAYER PACKAGE</div>
            <h1>Welcome Bonus</h1>
            <p>Start your first week with daily gifts, a welcome bonus and a mission path built for new players.</p>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="pill">Welcome {data?.welcome?.claimed ? '✓ claimed' : money(data?.welcome?.amount || 500)}</span>
              <span className="pill">Daily {data?.daily?.claimed ? '✓ claimed' : money(data?.daily?.amount || 100)}</span>
            </div>
          </div>
        </div>

        <div className="grid g3" style={{ marginTop: 14 }}>
          <div className="card">
            <div className="panel-title">1 · Welcome bonus</div>
            <p className="muted small">A one-time gift credited the first time you open your Welcome Bonus package.</p>
            <div className="kv"><span>Reward</span><b className="gold">{money(500)}</b></div>
            <button className="btn btn-gold btn-block" disabled={busy === 'welcome' || data?.welcome?.claimed} onClick={() => claim('welcome')}>
              {data?.welcome?.claimed ? 'Claimed' : busy === 'welcome' ? 'Claiming…' : 'Claim welcome bonus'}
            </button>
          </div>
          <div className="card">
            <div className="panel-title">2 · Daily gift</div>
            <p className="muted small">Come back each day of your first week for a small top-up.</p>
            <div className="kv"><span>Today</span><b className="gold">{money(100)}</b></div>
            <button className="btn btn-gold btn-block" disabled={busy === 'daily' || data?.daily?.claimed} onClick={() => claim('daily')}>
              {data?.daily?.claimed ? 'Claimed today' : busy === 'daily' ? 'Claiming…' : 'Claim daily gift'}
            </button>
          </div>
          <div className="card">
            <div className="panel-title">3 · Starter missions</div>
            <p className="muted small">Complete the weekly mission path to unlock extra rewards and DanGG Pass points.</p>
            <div className="kv"><span>Player</span><b>{user?.nick}</b></div>
            <button className="btn btn-ghost btn-block" onClick={() => navigate('/rewards')}>Open missions</button>
          </div>
        </div>

        <div className="panel-title" style={{ marginTop: 18 }}>Your first week</div>
        <div className="grid g4">
          {[
            ['Day 1', 'Welcome bonus', 'Claim your one-time gift'],
            ['Day 2', 'Daily gift', 'Small top-up, no wagering'],
            ['Day 3', 'Mission path', 'Complete weekly missions'],
            ['Day 7', 'Welcome Bonus complete', 'Unlock your next reward tier'],
          ].map(([d, t, s]) => (
            <div key={d} className="card"><div className="muted small">{d}</div><b style={{ color: '#f0d9a8' }}>{t}</b><div className="muted small">{s}</div></div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>Welcome Bonus is part of the local play-money simulation. No real money is involved.</p>
      </div>
    </PageShell>
  );
}
