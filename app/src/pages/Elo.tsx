import { useEffect, useState } from 'react';
import { PageShell } from '../components/PageShell';
import { Avatar } from '../components/Avatar';
import { useApp } from '../lib/store';
import { api } from '../lib/api';

function tier(elo: number) {
  if (elo >= 2000) return { name: 'Diamond', color: '#8fd6ff', next: 2200 };
  if (elo >= 1800) return { name: 'Platinum', color: '#cdbdf0', next: 2000 };
  if (elo >= 1600) return { name: 'Gold', color: '#e7bd68', next: 1800 };
  if (elo >= 1400) return { name: 'Silver', color: '#c8d3ce', next: 1600 };
  if (elo >= 1200) return { name: 'Bronze', color: '#d39a70', next: 1400 };
  return { name: 'Rookie', color: '#8ea79b', next: 1200 };
}

export function Elo() {
  const { user, navigate, toast } = useApp();
  const [data, setData] = useState<{ leaders: any[]; me: any }>({ leaders: [], me: null });
  const challenge = location.hash.includes('challenge=1');
  useEffect(() => { api.elo().then(setData).catch(() => {}); }, []);
  const myElo = data.me?.elo ?? user?.elo ?? 1000;
  const t = tier(Number(myElo));
  const leaders = data.leaders || [];
  const myRank = data.me?.rank || leaders.findIndex((l) => l.id === user?.id) + 1 || 0;
  return (
    <PageShell activeTop="poker">
      <div className="page">
        <div className="between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 className="page-title">ELO Rating</h1>
            <p className="page-sub">Skill-based rating for local cash tables. Win hands to climb; every completed hand settles ELO.</p>
          </div>
          <button className="btn btn-gold" onClick={() => navigate('/')}>Play a cash table</button>
        </div>

        {challenge && (
          <div className="card elo-challenge-banner">
            <b>ELO Challenge</b>
            <span>Open a private heads-up table, share its invite from the table menu, and settle the match on the ladder.</span>
            <button className="btn btn-gold btn-sm" style={{ marginLeft: 'auto' }} onClick={async () => {
              try {
                const r = await api.hostTable({ name: `${user?.nick || 'Player'} ELO challenge`, game: 'holdem', seats: 2, sb: 100, bb: 200, min_buyin: 4000, max_buyin: 20000 });
                navigate(`/table/${r.id}?buyin=4000`);
              } catch (e: any) { toast({ kind: 'error', title: 'Could not create challenge', body: e.message }); }
            }}>Create heads-up table</button>
          </div>
        )}

        <div className="elo-hero">
          <div className="elo-ring" style={{ borderColor: t.color }}>
            <b style={{ color: t.color }}>{Number(myElo).toLocaleString()}</b>
            <span>ELO</span>
          </div>
          <div className="elo-copy">
            <small>{t.name} division</small>
            <h2>{user?.nick || 'Guest'}</h2>
            <p>{myRank ? `Rank #${myRank} in the local ladder` : 'Complete a cash-table hand to enter the ladder.'}</p>
            <div className="elo-track"><i style={{ width: `${Math.min(100, Math.max(4, ((Number(myElo) - (t.next - 200)) / 200) * 100))}%`, background: t.color }} /></div>
            <span className="muted small">Next division at {t.next} ELO</span>
          </div>
          <div className="elo-kpis">
            <div><b>{leaders.length}</b><span>rated players</span></div>
            <div><b>K 24</b><span>rating factor</span></div>
            <div><b>±30</b><span>max change</span></div>
          </div>
        </div>

        <div className="grid g3" style={{ marginTop: 16 }}>
          {leaders.slice(0, 3).map((l, i) => (
            <div key={l.id} className="card" style={{ textAlign: 'center', borderColor: i === 0 ? '#6b5320' : '#2a2a2a' }}>
              <div style={{ fontSize: 26 }}>{['🥇', '🥈', '🥉'][i]}</div>
              <div style={{ margin: '8px auto', width: 54 }}><Avatar name={l.nick} src={l.avatar} size={54} /></div>
              <b style={{ color: '#fff' }}>{l.nick}</b>
              <div style={{ color: tier(Number(l.elo)).color, fontWeight: 900, fontFamily: 'var(--head-font)' }}>{Number(l.elo).toLocaleString()} ELO</div>
              <span className="muted small">{tier(Number(l.elo)).name}</span>
            </div>
          ))}
        </div>

        <div className="grid g2" style={{ marginTop: 16, alignItems: 'start' }}>
          <div className="card" style={{ padding: 0 }}>
            <div className="panel-title" style={{ padding: '12px 12px 6px' }}>ELO ladder</div>
            <table className="admin-table">
              <thead><tr><th>#</th><th>Player</th><th>Division</th><th>ELO</th></tr></thead>
              <tbody>
                {leaders.map((l, i) => (
                  <tr key={l.id} style={l.id === user?.id ? { background: '#2a2311' } : undefined}>
                    <td>{i + 1}</td>
                    <td><div className="row"><Avatar name={l.nick} src={l.avatar} size={22} />{l.nick}</div></td>
                    <td style={{ color: tier(Number(l.elo)).color }}>{tier(Number(l.elo)).name}</td>
                    <td className="gold">{Number(l.elo).toLocaleString()}</td>
                  </tr>
                ))}
                {!leaders.length && <tr><td colSpan={4}><div className="empty-state">No rated hands yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="panel-title">Recent rating changes</div>
            {(data.me?.history || []).length ? (data.me.history as any[]).map((h, i) => (
              <div key={i} className="kv elo-history-row">
                <span>{h.created_at?.slice(5, 16)}</span>
                <b style={{ color: h.delta >= 0 ? '#9fd8b0' : '#e08b8b' }}>{h.delta >= 0 ? '+' : ''}{h.delta}</b>
                <span className="muted small">{h.before} → {h.after}</span>
              </div>
            )) : <p className="muted small">No settled hands yet. Play a cash hand to start your history.</p>}
            <div className="panel-title" style={{ marginTop: 16 }}>How ELO works</div>
            <p className="muted small" style={{ lineHeight: 1.6 }}>
              Every completed cash-table hand settles an Elo rating change against the average rating of the opponents dealt in. The K-factor is 24, capped at ±30, and the rating is floored at zero. Tournament and bot-only hands do not count.
            </p>
            <div className="panel-title" style={{ marginTop: 16 }}>Divisions</div>
            {[['Rookie', 0, 1200], ['Bronze', 1200, 1400], ['Silver', 1400, 1600], ['Gold', 1600, 1800], ['Platinum', 1800, 2000], ['Diamond', 2000, 2200]].map(([name, lo, hi]) => (
              <div key={String(name)} className="kv"><span>{name}</span><b>{Number(lo)}–{Number(hi)}</b></div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
