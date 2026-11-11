import React, { useEffect, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell } from '../components/PageShell';

const RANKS = ['Clownfish', 'Shrimp', 'Crab', 'Octopus', 'Turtle', 'Dolphin', 'Shark', 'Whale'];

export function Ocean() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try { setData(await api.ocean()); } catch (e: any) { toast({ kind: 'error', title: 'Ocean Rewards', body: e.message }); }
  };
  useEffect(() => { load(); }, []);

  const buy = async (item: any) => {
    setBusy(item.id);
    try {
      const res = await api.buyOcean(item.id);
      sound.play('mission');
      toast({ kind: 'reward', title: 'Reward unlocked', body: item.name });
      await load(); await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Cannot redeem', body: e.message }); }
    finally { setBusy(null); }
  };

  const level = data?.level;
  return (
    <PageShell activeTop="poker">
      <div className="page" style={{ paddingTop: 12 }}>
        <div className="ocean-hero">
          <img className="ocean-bg" src="/assets/ocean/Banner_Ocean_Whale.png" alt="" />
          <div className="ocean-hero-overlay" />
          <div className="ocean-hero-content">
            <div className="th-kicker">OCEAN REWARDS</div>
            <h1>Dive deeper, earn more</h1>
            <div className="row" style={{ gap: 16 }}>
              <div className="ocean-gem"><span>💎</span>{(data?.gems ?? user?.gems ?? 0).toLocaleString()} gems</div>
              <div className="ocean-gem"><span>🐟</span>{level?.name || 'Clownfish'}</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <div className="between">
            <div>
              <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Your ocean level</div>
              <div style={{ fontFamily: 'var(--head-font)', fontSize: 26, fontWeight: 800, color: '#ffe6a6' }}>{level?.name || 'Clownfish'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="muted small">Next level</div>
              <b style={{ color: '#e8e8e8' }}>{data?.next ? `${data.next.name} · ${data.next.min.toLocaleString()} gems` : 'Max level'}</b>
            </div>
          </div>
          <div className="progress" style={{ marginTop: 12, height: 10 }}><i style={{ width: `${data?.progress ?? 0}%` }} /></div>
          <div className="ocean-ranks">
            {RANKS.map((r, i) => (
              <div key={r} className={'ocean-rank' + (level && level.rank === i ? ' on' : '') + (level && level.rank > i ? ' done' : '')}>
                <img src={`/assets/ocean/Ocean_Rewards_Rank_${i}.png`} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-title" style={{ marginTop: 18 }}>Gem store</div>
        <div className="grid g3">
          {(data?.items || []).map((item: any) => {
            const affordable = (data?.gems || 0) >= item.cost;
            return (
              <div key={item.id} className="card ocean-item">
                <div className="between">
                  <b style={{ color: '#f0f0f0' }}>{item.name}</b>
                  <span style={{ fontSize: 24 }}>{item.kind === 'TICKET' ? '🎟️' : item.kind === 'PLAY' ? '🪙' : '💰'}</span>
                </div>
                <div className="muted small" style={{ margin: '4px 0 12px' }}>{item.desc}</div>
                <div className="between">
                  <span className="ocean-gem small"><span>💎</span>{item.cost.toLocaleString()}</span>
                  <button className={'btn btn-sm ' + (affordable ? 'btn-gold' : 'btn-ghost')} disabled={!affordable || busy === item.id} onClick={() => buy(item)}>
                    {busy === item.id ? 'Redeeming…' : affordable ? 'Redeem' : 'Not enough gems'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel-title" style={{ marginTop: 18 }}>Recent gem activity</div>
        <div className="card" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead><tr><th>#</th><th>Reward</th><th>Gems</th><th>Date</th></tr></thead>
            <tbody>
              {(data?.history || []).map((h: any) => (
                <tr key={h.id}><td>{h.id}</td><td>{h.memo}</td>
                    <td style={{ color: h.amount >= 0 ? '#7fe0a0' : '#ff9a9a' }}>
                      {h.currency === 'TICKET' ? `${h.amount >= 0 ? '+' : ''}${h.amount} T$` : h.currency === 'GEM' ? `${h.amount >= 0 ? '+' : ''}${h.amount} gems` : `${h.amount >= 0 ? '+' : ''}${money(h.amount)}`}
                    </td><td className="muted">{h.created_at}</td></tr>
              ))}
              {!data?.history?.length && <tr><td colSpan={4} className="empty-state">Redeem a reward to start your gem history.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>
          Earn gems by playing cash games, completing missions and opening daily gifts. Gems have no cash value.
        </p>
      </div>
    </PageShell>
  );
}

export function GGCare() {
  const { user, refreshUser, toast, navigate } = useApp();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => { try { setData(await api.ggcare()); } catch { /* ignore */ } };
  useEffect(() => { load(); }, []);

  const claim = async () => {
    setBusy(true);
    try {
      const r = await api.claimCare();
      sound.play('mission');
      toast({ kind: 'reward', title: 'GG Care bonus claimed', body: money(r.amount) });
      await load(); await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'GG Care', body: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <PageShell activeTop="poker">
      <div className="page" style={{ paddingTop: 12 }}>
        <div className="care-hero">
          <img src="/assets/ui/discover/Bg_Discover_GGcare.png" alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="care-overlay" />
          <div className="care-content">
            <div className="th-kicker">#THANKSGG</div>
            <h1>GG Care</h1>
            <p>Bad beat protection, daily prizes and a thank-you for playing.</p>
            <div className="care-jackpot">Bad Beat Jackpot <b>{money(data?.jackpot || 199026635)}</b></div>
          </div>
        </div>

        <div className="grid g3" style={{ marginTop: 14 }}>
          <div className="card">
            <div className="panel-title">Daily care bonus</div>
            <p className="muted small">A small thank-you every day you play. No wagering, credited instantly.</p>
            <button className={'btn btn-gold btn-block '} disabled={busy || data?.claimed} onClick={claim}>
              {data?.claimed ? `Claimed ${money(data.amount)}` : busy ? 'Claiming…' : 'Claim daily bonus'}
            </button>
          </div>
          <div className="card">
            <div className="panel-title">Bad beat jackpot</div>
            <div className="kv"><span>Current pool</span><b className="gold">{money(data?.jackpot || 199026635)}</b></div>
            <div className="kv"><span>Qualifying hand</span><b>Aces full of tens</b></div>
            <div className="kv"><span>Loser share</span><b>40%</b></div>
            <div className="kv"><span>Table share</span><b>20%</b></div>
          </div>
          <div className="card">
            <div className="panel-title">Your care status</div>
            <div className="kv"><span>Player</span><b>{user?.nick}</b></div>
            <div className="kv"><span>VIP level</span><b>{user?.vip_level}</b></div>
            <div className="kv"><span>Daily bonus</span><b>{data?.claimed ? 'Claimed today' : 'Available'}</b></div>
            <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => navigate('/rewards')}>All rewards</button>
          </div>
        </div>

        <div className="panel-title" style={{ marginTop: 18 }}>How it works</div>
        <div className="grid g3">
          {[
            ['1', 'Play any cash game', 'Every raked hand contributes to the jackpot.'],
            ['2', 'Lose with a monster', 'Aces full of tens or better, using both hole cards.'],
            ['3', 'Get paid', 'The loser, the winner and the table share the pool.'],
          ].map(([n, t, b]) => (
            <div key={n} className="card"><div style={{ fontSize: 22, color: '#e7b64b', fontWeight: 900 }}>{n}</div><b style={{ color: '#eee' }}>{t}</b><div className="muted small">{b}</div></div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 10 }}>GG Care is part of the local play-money simulation. No real money is involved.</p>
      </div>
    </PageShell>
  );
}
