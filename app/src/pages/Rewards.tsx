import React, { useEffect, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';
import { Avatar } from '../components/Avatar';
import { LEADER_METRICS, formatMetricValue, metricInfo, metricValueLabel, type LeaderMetric, type LeaderboardResponse } from '../lib/leaderboard';

const WHEEL = [
  { label: '500', amount: 500 }, { label: '2.5K', amount: 2500 }, { label: '1K', amount: 1000 },
  { label: '10K', amount: 10000 }, { label: '0', amount: 0 }, { label: '25K', amount: 25000 },
  { label: '5K', amount: 5000 }, { label: '100K', amount: 100000 },
];

export function Rewards({ initialTab = 'ggpass' }: { initialTab?: string } = {}) {
  const { user, refreshUser, toast, navigate } = useApp();
  const [tab, setTab] = useState(initialTab);
  const [missions, setMissions] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [spin, setSpin] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [daily, setDaily] = useState<{ claimed: boolean; amount: number }>({ claimed: false, amount: 0 });
  const [tx, setTx] = useState<any[]>([]);
  const [claiming, setClaiming] = useState(false);

  const load = async () => {
    try {
      const [m, l] = await Promise.all([api.missions(), api.leaderboard()]);
      setMissions(m.missions);
      setLeaders(l.leaders);
    } catch (e: any) { toast({ kind: 'error', title: 'Rewards', body: e.message }); }
  };
  useEffect(() => {
    load();
    api.cashier().then((r) => setTx(r.transactions)).catch(() => {});
    fetch('/api/rewards/daily', { headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } })
      .then((r) => r.json()).then((d) => setDaily({ claimed: !!d.claimed, amount: d.amount || 0 })).catch(() => {});
  }, []);

  const claimDaily = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/rewards/daily', { method: 'POST', headers: { authorization: `Bearer ${localStorage.getItem('ggpoker.token')}` } }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      sound.play('mission');
      setDaily({ claimed: true, amount: res.amount });
      toast({ kind: 'reward', title: 'Daily freebie claimed', body: money(res.amount) });
      await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Daily freebie', body: e.message }); }
    finally { setClaiming(false); }
  };

  const claim = async (m: any) => {
    try {
      const res = await api.claimMission(m.id);
      sound.play('mission');
      toast({ kind: 'reward', title: 'Reward claimed', body: `+${m.reward_kind === 'TICKET' ? `T$${m.reward}` : money(m.reward)}` });
      await load(); await refreshUser();
    } catch (e: any) { toast({ kind: 'error', title: 'Cannot claim', body: e.message }); }
  };

  const doSpin = async () => {
    if (spinning) return;
    setSpinning(true);
    try {
      const res = await api.spin();
      const idx = res.index;
      const turns = 5 + Math.floor(Math.random() * 2);
      const target = turns * 360 + (360 - (idx * 45 + 22.5));
      setSpin(target);
      await new Promise((r) => setTimeout(r, 4200));
      sound.play(idx ? 'win' : 'fold');
      if (res.amount) {
        toast({ kind: 'reward', title: 'Wheel prize!', body: `You won ${money(res.amount)}` });
        await refreshUser();
      } else {
        toast({ kind: 'info', title: 'No prize this time', body: 'Your next free spin unlocks tomorrow.' });
      }
    } catch (e: any) {
      toast({ kind: 'error', title: 'Spin failed', body: e.message });
    } finally { setSpinning(false); }
  };

  const xp = user?.xp ?? 0;
  const level = user?.vip_level ?? 1;
  const levelXp = (level * level * 1200);
  const pct = Math.min(100, Math.round(((xp % levelXp) / levelXp) * 100));

  return (
    <PageShell activeTop="poker" subnav={<SubNav items={[{ key: 'ggpass', label: 'DanGG Pass' }, { key: 'missions', label: 'Daily missions' }, { key: 'wheel', label: 'Prize Wheel' }, { key: 'ranks', label: 'Fish ranks' }, { key: 'fishhistory', label: 'Fish history' }, { key: 'leaders', label: 'Leaderboard' }]} active={tab} onChange={setTab} />}>
      <div className="page">
        <h1 className="page-title">My Rewards</h1>
        <p className="page-sub">DanGG Pass progress, daily missions, Prize Wheel and leaderboards</p>

        {tab === 'ggpass' && (
          <>
            <div className="card" style={{ background: 'linear-gradient(120deg,#2a2311,#1a1a1a 60%)', borderColor: '#5a4519' }}>
              <div className="between">
                <div>
                  <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>DanGG Pass level</div>
                  <div style={{ fontFamily: 'var(--head-font)', fontSize: 34, fontWeight: 900, color: '#ffe6a6' }}>Level {level}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="muted small">VIP points</div>
                  <div className="gold" style={{ fontSize: 20, fontWeight: 800 }}>{(user?.vip_points ?? 0).toLocaleString()}</div>
                </div>
              </div>
              <div className="progress" style={{ marginTop: 14, height: 10 }}><i style={{ width: `${pct}%` }} /></div>
              <div className="between muted small" style={{ marginTop: 6 }}><span>{(xp % levelXp).toLocaleString()} XP</span><span>{levelXp.toLocaleString()} XP to next level</span></div>
            </div>
            <div className="grid g3" style={{ marginTop: 16 }}>
              <div className="card" style={{ background: 'linear-gradient(140deg,#2a1b0e,#1a1a1a)', borderColor: '#5a4519' }}>
                <div className="between">
                  <b style={{ color: '#ffe6a6' }}>Daily freebie</b>
                  <span style={{ fontSize: 26 }}>🎁</span>
                </div>
                <p className="muted small" style={{ margin: '4px 0 10px' }}>One free gift every day. Open it to receive up to {money(5000)}.</p>
                <button className="btn btn-gold btn-block btn-sm" disabled={daily.claimed || claiming} onClick={claimDaily}>
                  {daily.claimed ? `Claimed ${money(daily.amount)}` : claiming ? 'Opening…' : 'Open today\'s gift'}
                </button>
              </div>
              <div className="card">
                <div className="between"><b style={{ color: '#eee' }}>Bad beat jackpot</b><span style={{ fontSize: 22 }}>💥</span></div>
                <p className="muted small" style={{ margin: '4px 0 10px' }}>Lose with aces full of tens or better and win a share of the jackpot.</p>
                <div className="progress"><i style={{ width: '64%' }} /></div>
                <div className="between small muted" style={{ marginTop: 4 }}><span>Current pool</span><b className="gold">{money(199026635)}</b></div>
              </div>
              <div className="card">
                <div className="between"><b style={{ color: '#eee' }}>VIP benefits</b><span style={{ fontSize: 22 }}>👑</span></div>
                <div className="kv small"><span>Rakeback</span><b>{(level * 2.5).toFixed(1)}%</b></div>
                <div className="kv small"><span>Weekly bonus</span><b>{money(level * 2500)}</b></div>
                <div className="kv small"><span>Priority support</span><b>{level >= 5 ? '24/7' : 'Standard'}</b></div>
                <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => navigate('/leaderboard')}>View leaderboard</button>
              </div>
            </div>

            <div className="panel-title" style={{ marginTop: 20 }}>Reward track</div>
            <div className="reward-track">
              {Array.from({ length: 10 }).map((_, i) => {
                const lvl = i + 1;
                const reached = lvl <= level;
                return (
                  <div key={i} className={'reward-node' + (reached ? ' reached' : '')}>
                    <div className="rn-level">{lvl}</div>
                    <div className="rn-icon">{i % 3 === 0 ? '🎟️' : i % 3 === 1 ? '💰' : '🎁'}</div>
                    <div className="rn-label">{i % 3 === 0 ? 'T$5' : i % 3 === 1 ? '$25' : 'Ticket'}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'missions' && (
          <div className="grid g2">
            {missions.map((m) => (
              <div key={m.id} className="card">
                <div className="between">
                  <b style={{ color: '#f0f0f0', fontSize: 14 }}>{m.title}</b>
                  <span className="tag gtd">{m.reward_kind === 'TICKET' ? 'TICKET' : 'CASH'}</span>
                </div>
                <div className="muted small" style={{ margin: '4px 0 10px' }}>{m.description}</div>
                <div className="progress"><i style={{ width: `${Math.min(100, (m.progress / m.goal) * 100)}%` }} /></div>
                <div className="between" style={{ marginTop: 6 }}>
                  <span className="muted small">{m.progress} / {m.goal}</span>
                  <span className="gold small">{m.reward_kind === 'TICKET' ? `T$${m.reward}` : money(m.reward)}</span>
                </div>
                <button
                  className={'btn btn-sm ' + (m.claimed ? 'btn-ghost' : 'btn-gold')}
                  style={{ marginTop: 10 }}
                  disabled={m.claimed || m.progress < m.goal}
                  onClick={() => claim(m)}
                >
                  {m.claimed ? 'Claimed' : m.progress >= m.goal ? 'Claim reward' : 'In progress'}
                </button>
              </div>
            ))}
            {!missions.length && <div className="empty-state">No active missions.</div>}
          </div>
        )}

        {tab === 'wheel' && (
          <div className="wheel-wrap">
            <div className="wheel" style={{ transform: `rotate(${spin}deg)` }}>
              {WHEEL.map((w, i) => {
                const ang = ((i * 45 + 22.5) * Math.PI) / 180;
                const x = 50 + 37 * Math.sin(ang);
                const y = 50 - 37 * Math.cos(ang);
                return (
                  <div key={i} className="wheel-seg" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)' }}>
                    <span>{w.label}</span>
                  </div>
                );
              })}
              <div className="wheel-center">🐟</div>
            </div>
            <div style={{ width: 300 }}>
              <div className="panel-title">Prize Wheel</div>
              <p className="muted" style={{ fontSize: 13 }}>
                Spin the wheel once every time you earn 100 VIP points at the tables. Prizes are credited instantly to your play balance.
              </p>
              <div className="kv"><span>Your VIP points</span><b>{(user?.vip_points ?? 0).toLocaleString()}</b></div>
              <div className="kv"><span>Spins available</span><b>1</b></div>
              <button className="btn btn-gold btn-block" style={{ marginTop: 14, height: 44 }} disabled={spinning} onClick={doSpin}>
                {spinning ? 'Spinning…' : 'Spin the wheel'}
              </button>
            </div>
          </div>
        )}

        {tab === 'ranks' && (
          <div className="grid g3">
            {[
              ['Plankton', '1x', 'Entry level', 0], ['Shrimp', '1.1x', 'Play 500 hands', 500], ['Crab', '1.2x', 'Play 2,000 hands', 2000],
              ['Octopus', '1.35x', 'Play 5,000 hands', 5000], ['Squid', '1.5x', 'Play 12,000 hands', 12000], ['Fish', '1.7x', 'Play 25,000 hands', 25000],
              ['Dolphin', '2x', 'Play 50,000 hands', 50000], ['Shark', '2.5x', 'Play 100,000 hands', 100000], ['Orca', '3x', 'Play 250,000 hands', 250000],
              ['Whale', '4x', 'Play 500,000 hands', 500000], ['Killer Whale', '5x', 'Play 1,000,000 hands', 1000000],
            ].map(([name, mult, req, hands], i) => {
              const current = i <= 2;
              return (
                <div key={name as string} className={'card' + (current ? ' reached' : '')} style={current ? { borderColor: '#6b5320', background: 'linear-gradient(140deg,#241f13,#1a1811)' } : undefined}>
                  <div className="between">
                    <b style={{ color: current ? '#ffe6a6' : '#cfcfcf' }}>{name as string}</b>
                    <span className="tag gtd">{mult as string} rewards</span>
                  </div>
                  <div className="muted small" style={{ marginTop: 6 }}>{req as string}</div>
                  <div className="progress" style={{ marginTop: 8 }}><i style={{ width: `${current ? 100 : 0}%` }} /></div>
                  <div className="muted small" style={{ marginTop: 4 }}>{(hands as number).toLocaleString()} hands</div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'fishhistory' && (
          <div className="card" style={{ padding: 0 }}>
            <table className="admin-table">
              <thead><tr><th>#</th><th>Type</th><th>Amount</th><th>Memo</th><th>Date</th></tr></thead>
              <tbody>
                {tx.filter((t) => ['fishbuffet', 'claim', 'daily', 'mission'].includes(t.kind)).map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td><td style={{ textTransform: 'capitalize' }}>{t.kind}</td>
                    <td style={{ color: t.amount >= 0 ? '#7fe0a0' : '#ff9a9a' }}>{t.amount >= 0 ? '+' : ''}{money(t.amount)}</td>
                    <td className="muted">{t.memo}</td><td className="muted">{t.created_at}</td>
                  </tr>
                ))}
                {!tx.length && <tr><td colSpan={5} className="empty-state">No Prize Wheel history yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'leaders' && (
          <div className="card" style={{ padding: 0 }}>
            <table className="admin-table">
              <thead><tr><th>#</th><th>Player</th><th>VIP level</th><th>XP</th><th>Points</th></tr></thead>
              <tbody>
                {leaders.map((l) => (
                  <tr key={l.rank} style={l.nick === user?.nick ? { background: '#2a2311' } : undefined}>
                    <td>{l.rank}</td>
                    <td><div className="row"><Avatar name={l.nick} src={l.avatar} size={24} /><b>{l.nick}</b></div></td>
                    <td><span className="tag gtd">VIP {l.vip_level}</span></td>
                    <td>{l.xp.toLocaleString()}</td>
                    <td className="gold">{l.vip_points.toLocaleString()}</td>
                  </tr>
                ))}
                {!leaders.length && <tr><td colSpan={5} className="empty-state">Leaderboard is empty.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

export function Leaderboard() {
  const { user } = useApp();
  const [metric, setMetric] = useState<LeaderMetric>('vip');
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    api.leaderboard(metric)
      .then((r) => { if (live) setBoard(r); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'Could not load the leaderboard'); });
    return () => { live = false; };
  }, [metric]);
  const info = metricInfo(metric);
  const leaders = board?.metric === metric ? board.leaders : [];
  const me = board?.metric === metric ? board.me : null;
  return (
    <PageShell activeTop="poker">
      <div className="page">
        <h1 className="page-title">Leaderboard</h1>
        <p className="page-sub">{info.subtitle}</p>
        <div className="seg" role="tablist" aria-label="Leaderboard metric">
          {LEADER_METRICS.map((m) => (
            <button key={m.key} role="tab" aria-selected={m.key === metric} className={m.key === metric ? 'on' : ''} onClick={() => setMetric(m.key)}>{m.tab}</button>
          ))}
        </div>
        {me && <p className="page-sub">Your rank: <b className="gold">#{me.rank}</b> · {metricValueLabel(metric, me.value)}</p>}
        {error && <p className="empty-state">{error}</p>}
        <div className="grid g3 leaderboard-podium" style={{ marginBottom: 18 }}>
          {leaders.slice(0, 3).map((l, i) => (
            <div key={l.nick} className="card" style={{ textAlign: 'center', borderColor: i === 0 ? '#6b5320' : '#2a2a2a' }}>
              <div style={{ fontSize: 28 }}>{['🥇', '🥈', '🥉'][i]}</div>
              <div style={{ margin: '8px auto', width: 54 }}><Avatar name={l.nick} src={l.avatar ?? undefined} size={54} /></div>
              <b style={{ color: '#fff' }}>{l.nick}</b>
              <div className="gold" style={{ fontWeight: 800 }}>{metricValueLabel(metric, l.value)}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead><tr><th>#</th><th>Player</th><th>VIP</th><th>{info.column}</th></tr></thead>
            <tbody>
              {leaders.map((l) => (
                <tr key={l.nick} aria-current={l.nick === user?.nick ? 'true' : undefined} style={l.nick === user?.nick ? { background: '#2a2311' } : undefined}>
                  <td>{l.rank}</td>
                  <td><div className="row"><Avatar name={l.nick} src={l.avatar ?? undefined} size={22} />{l.nick}</div></td>
                  <td>VIP {l.vip_level}</td>
                  <td className="gold">{formatMetricValue(l.value)}</td>
                </tr>
              ))}
              {board && !leaders.length && !error && <tr><td colSpan={4} className="empty-state">Leaderboard is empty.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
