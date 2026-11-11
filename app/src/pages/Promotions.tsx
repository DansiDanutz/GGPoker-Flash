import React, { useEffect, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';
import { Avatar } from '../components/Avatar';

export function Promotions() {
  const { toast, navigate } = useApp();
  const [banners, setBanners] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    fetch('/api/lobby').then((r) => r.json()).then((d) => setBanners(d.banners || [])).catch(() => {});
  }, []);

  const promos = [
    { title: 'Daily $100,000 Flipout', sub: '#ThanksGG · every day', img: '/assets/ui/discover/Bg_Discover_Leaderboard_FlipNGo.png', tag: 'All-in' },
    { title: 'Fish Buffet', sub: 'Spin the wheel, win up to 100,000x', img: '/assets/ui/discover/Bg_Discover_Fishbuffet.png', tag: 'Rewards' },
    { title: 'GG Care', sub: 'Bad beat protection & daily prizes', img: '/assets/ui/discover/Bg_Discover_GGcare.png', tag: 'Cashback' },
    { title: 'Hold’em Leaderboards', sub: '$50,000 weekly race', img: '/assets/ui/discover/Bg_Discover_Leaderboard_Holdem.png', tag: 'Leaderboard' },
    { title: 'Mystery Battle Royale', sub: 'Bounty tournaments with hidden prizes', img: '/assets/ui/discover/Bg_Discover_Leaderboard_MysterBattleRoyal.png', tag: 'Tournament' },
    { title: 'Honeymoon Bonus', sub: 'New player welcome package', img: '/assets/ui/discover/Bg_Discover_Honeymoon.png', tag: 'Bonus' },
    { title: 'Weekly Freeroll', sub: 'Free entry, real prizes', img: '/assets/ui/discover/Bg_Discove_WeeklyFreeroll_EN.png', tag: 'Freeroll' },
    { title: 'After The Fold', sub: 'Win your share of $40,000 daily', img: '/assets/ui/discover/Bg_Discover_AoF.png', tag: 'All-in or Fold' },
  ];

  return (
    <PageShell activeTop="poker">
      <div className="page">
        <h1 className="page-title">Promotions</h1>
        <p className="page-sub">All running offers, missions and giveaways</p>
        <div className="promo-grid">
          {promos.map((p) => (
            <div key={p.title} className="promo-card" onClick={() => setDetail(p)}>
              <img src={p.img} alt="" onError={(e) => { (e.target as HTMLImageElement).src = '/assets/chrome/promo.png'; }} />
              <div className="overlay">
                <span className="tag gtd" style={{ alignSelf: 'flex-start', marginBottom: 4 }}>{p.tag}</span>
                <h3>{p.title}</h3>
                <p>{p.sub}</p>
              </div>
            </div>
          ))}
        </div>
        {detail && (
          <div className="modal-backdrop" onClick={() => setDetail(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head"><h3>{detail.title}</h3><button className="title-icon" onClick={() => setDetail(null)}>✕</button></div>
              <div className="modal-body">
                <img src={detail.img} alt="" style={{ width: '100%', borderRadius: 6, marginBottom: 12 }} onError={(e) => { (e.target as HTMLImageElement).src = '/assets/chrome/promo.png'; }} />
                <p style={{ color: '#ccc', fontSize: 13, lineHeight: 1.6 }}>
                  {detail.title} is running now. Opt in from this page, then play the qualifying games to earn entries,
                  rewards and leaderboard points. All prizes are play-money and credited instantly.
                </p>
                <button className="btn btn-gold btn-block" onClick={() => { setDetail(null); toast({ kind: 'reward', title: 'Opted in', body: detail.title }); }}>Opt in</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

const LANGS = ['English', 'Romanian', 'German', 'French', 'Spanish', 'Portuguese', 'Russian', 'Ukrainian', 'Polish', 'Turkish', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Thai', 'Vietnamese', 'Indonesian', 'Hindi', 'Arabic', 'Hebrew'];
const THEMES = ['Green', 'Black', 'Red', 'Navy', 'Purple', 'Gray', 'Brown', 'Cobalt', 'Cooper', 'ChocoBrown'];

export function Settings() {
  const { user, refreshUser, toast, soundOn, toggleSound, animations, setAnimations } = useApp();
  const [tab, setTab] = useState('general');
  const [nick, setNick] = useState(user?.nick || '');
  const [lang, setLang] = useState(localStorage.getItem('ggpoker.lang') || 'English');
  const [theme, setTheme] = useState(localStorage.getItem('ggpoker.theme') || 'Green');
  const [volume, setVolume] = useState(Number(localStorage.getItem('ggpoker.volume') || 70));
  const [timeBank, setTimeBank] = useState(30);
  const [fourColor, setFourColor] = useState(localStorage.getItem('ggpoker.fourcolor') === '1');
  const [autoMuck, setAutoMuck] = useState(localStorage.getItem('ggpoker.automuck') !== '0');
  const [runItTwice, setRunItTwice] = useState(localStorage.getItem('ggpoker.rit') === '1');

  const persist = (key: string, value: string) => {
    localStorage.setItem(key, value);
    api.saveSettings({
      lang: localStorage.getItem('ggpoker.lang'), theme: localStorage.getItem('ggpoker.theme'),
      volume: localStorage.getItem('ggpoker.volume'), fourcolor: localStorage.getItem('ggpoker.fourcolor'),
      automuck: localStorage.getItem('ggpoker.automuck'), rit: localStorage.getItem('ggpoker.rit'),
    }).catch(() => {});
  };

  const saveNick = async () => {
    try { await api.setNick(nick); await refreshUser(); sound.play('coin'); toast({ kind: 'success', title: 'Nickname updated', body: nick }); }
    catch (e: any) { toast({ kind: 'error', title: 'Cannot change nickname', body: e.message }); }
  };

  return (
    <PageShell activeTop="poker" subnav={<SubNav items={[{ key: 'general', label: 'General' }, { key: 'sound', label: 'Sound' }, { key: 'table', label: 'Table & cards' }, { key: 'account', label: 'Account' }, { key: 'responsible', label: 'Responsible gaming' }]} active={tab} onChange={setTab} />}>
      <div className="page">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Preferences are stored locally and applied instantly</p>

        {tab === 'general' && (
          <div className="grid g2">
            <div className="card">
              <div className="panel-title">Language</div>
              <select className="admin-select" style={{ width: '100%' }} value={lang} onChange={(e) => { setLang(e.target.value); persist('ggpoker.lang', e.target.value); }}>
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <div className="panel-title" style={{ marginTop: 18 }}>Animations</div>
              <label className="switch-row">
                <span>Enable table & lobby animations</span>
                <input type="checkbox" checked={animations} onChange={(e) => setAnimations(e.target.checked)} />
              </label>
              <label className="switch-row">
                <span>Run it twice when all-in</span>
                <input type="checkbox" checked={runItTwice} onChange={(e) => { setRunItTwice(e.target.checked); persist('ggpoker.rit', e.target.checked ? '1' : '0'); }} />
              </label>
              <label className="switch-row">
                <span>Auto-muck losing hands</span>
                <input type="checkbox" checked={autoMuck} onChange={(e) => { setAutoMuck(e.target.checked); persist('ggpoker.automuck', e.target.checked ? '1' : '0'); }} />
              </label>
            </div>
            <div className="card">
              <div className="panel-title">Display</div>
              <div className="kv"><span>Display currency</span><b>USD</b></div>
              <div className="kv"><span>Chip display</span><b>Both (chips + amount)</b></div>
              <div className="kv"><span>Table view</span><b>Table View</b></div>
              <div className="panel-title" style={{ marginTop: 18 }}>Session</div>
              <div className="kv"><span>Session timer</span><b>Enabled</b></div>
              <div className="kv"><span>Streamer mode</span><b>Off</b></div>
              <div className="kv"><span>Theme</span><b>{theme}</b></div>
            </div>
          </div>
        )}

        {tab === 'sound' && (
          <div className="grid g2">
            <div className="card">
              <div className="panel-title">Sound</div>
              <label className="switch-row"><span>Master sound</span><input type="checkbox" checked={soundOn} onChange={toggleSound} /></label>
              <div className="admin-label">Master volume</div>
              <input type="range" min={0} max={100} value={volume} style={{ width: '100%' }}
                onChange={(e) => { const v = Number(e.target.value); setVolume(v); sound.volume = v / 100; persist('ggpoker.volume', String(v)); sound.play('click'); }} />
              <div className="between muted small"><span>0</span><span>{volume}%</span><span>100</span></div>
              <div className="panel-title" style={{ marginTop: 18 }}>Test sounds</div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {['deal', 'bet', 'raise', 'win', 'allin', 'coin', 'turn'].map((s) => (
                  <button key={s} className="btn btn-ghost btn-sm" onClick={() => sound.play(s as any)}>{s}</button>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="panel-title">Audio channels</div>
              {[['Card & chip sounds', true], ['Action voices', true], ['Notification alerts', true], ['Lobby music', true], ['Table ambience', false]].map(([l, v]) => (
                <label key={l as string} className="switch-row"><span>{l as string}</span><input type="checkbox" defaultChecked={v as boolean} /></label>
              ))}
            </div>
          </div>
        )}

        {tab === 'table' && (
          <>
            <div className="panel-title">Table colour</div>
            <div className="theme-grid">
              {THEMES.map((t) => (
                <button key={t} className={'theme-swatch' + (theme === t ? ' on' : '')} onClick={() => { setTheme(t); persist('ggpoker.theme', t); sound.play('click'); }}>
                  <img src={`/assets/ui/option_page/SettingPage_ColoredBG_${t}.png`} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span style={{ background: t === 'Green' ? '#2f7a4a' : t === 'Red' ? '#7a2f35' : t === 'Navy' ? '#243a5e' : t === 'Black' ? '#1b1b1b' : t === 'Purple' ? '#4a2f6b' : '#3a3a3a' }} />
                  <b>{t}</b>
                </button>
              ))}
            </div>
            <div className="grid g2" style={{ marginTop: 18 }}>
              <div className="card">
                <div className="panel-title">Cards</div>
                <label className="switch-row"><span>Four-colour deck</span><input type="checkbox" checked={fourColor} onChange={(e) => { setFourColor(e.target.checked); persist('ggpoker.fourcolor', e.target.checked ? '1' : '0'); }} /></label>
                <label className="switch-row"><span>Show hand strength</span><input type="checkbox" defaultChecked /></label>
                <label className="switch-row"><span>Dealer animation speed</span><input type="range" min={1} max={5} defaultValue={3} /></label>
              </div>
              <div className="card">
                <div className="panel-title">Time bank</div>
                <div className="kv"><span>Time bank seconds</span><b>{timeBank}s</b></div>
                <input type="range" min={5} max={60} value={timeBank} onChange={(e) => setTimeBank(Number(e.target.value))} style={{ width: '100%' }} />
                <p className="muted small">Extra time you can use on a single decision. The timer ring around your avatar shows the remaining time.</p>
              </div>
            </div>
          </>
        )}

        {tab === 'account' && (
          <div className="grid g2">
            <div className="card">
              <div className="panel-title">Profile</div>
              <div className="row" style={{ marginBottom: 12 }}>
                <Avatar name={user?.nick || '?'} src={user?.avatar} size={64} />
                <div>
                  <b style={{ color: '#fff' }}>{user?.nick}</b>
                  <div className="muted small">{user?.login} · VIP {user?.vip_level}</div>
                </div>
              </div>
              <label className="admin-label">Nickname</label>
              <div className="row"><input className="admin-input" style={{ flex: 1 }} value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} /><button className="btn btn-red btn-sm" onClick={saveNick}>Save</button></div>
              <label className="admin-label">Email</label>
              <input className="admin-input" style={{ width: '100%' }} defaultValue={user?.email} />
              <div className="kv" style={{ marginTop: 12 }}><span>Balance</span><b>{money(user?.balance ?? 0)}</b></div>
              <div className="kv"><span>Tickets</span><b>T${user?.tickets ?? 0}</b></div>
              <div className="kv"><span>Member since</span><b>{user?.created_at?.slice(0, 10)}</b></div>
            </div>
            <div className="card">
              <div className="panel-title">Security</div>
              <div className="field"><label>Current password</label><input type="password" placeholder="••••••••" /></div>
              <div className="field"><label>New password</label><input type="password" placeholder="••••••••" /></div>
              <button className="btn btn-red btn-sm" onClick={() => toast({ kind: 'success', title: 'Password changed', body: 'Use it on your next login.' })}>Change password</button>
              <div className="panel-title" style={{ marginTop: 20 }}>Sessions</div>
              <div className="kv"><span>This device</span><b>macOS · active now</b></div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => toast({ kind: 'info', title: 'Other sessions', body: 'No other active sessions.' })}>Sign out other devices</button>
            </div>
          </div>
        )}

        {tab === 'responsible' && (
          <div className="grid g2">
            <div className="card">
              <div className="panel-title">Play limits</div>
              <div className="kv"><span>Daily deposit limit</span><b>$500.00</b></div>
              <div className="kv"><span>Weekly loss limit</span><b>Not set</b></div>
              <div className="kv"><span>Session reminder</span><b>Every 60 minutes</b></div>
              <div className="kv"><span>Reality check</span><b>Enabled</b></div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => toast({ kind: 'info', title: 'Limits', body: 'This is a play-money clone — no deposits are possible.' })}>Edit limits</button>
            </div>
            <div className="card">
              <div className="panel-title">Take a break</div>
              <p className="muted" style={{ fontSize: 13 }}>Pause your account for a period of time. You will be logged out and unable to play until the break ends.</p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {['24 hours', '7 days', '30 days', 'Self-exclude'].map((x) => <button key={x} className="btn btn-ghost btn-sm">{x}</button>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
