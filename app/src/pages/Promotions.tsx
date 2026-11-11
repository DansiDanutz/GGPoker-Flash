import React, { useEffect, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { PageShell, SubNav } from '../components/PageShell';
import { Avatar } from '../components/Avatar';
import { useI18n } from '../lib/i18n';
import { CARD_BACKS, DEFAULT_BETS, NORMAL_CHOICES, OPENING_CHOICES, betLabel, readBetPrefs, readCardBack, readStackMode, type BetPrefs, type StackMode } from '../lib/tablePrefs';

export function Promotions() {
  const { toast, navigate } = useApp();
  const [banners, setBanners] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    fetch('/api/lobby').then((r) => r.json()).then((d) => setBanners(d.banners || [])).catch(() => {});
  }, []);

  const promos = [
    { title: 'Daily $100,000 Flipout', sub: '#ThanksGG · every day', img: '/assets/ui/discover/Bg_Discover_Leaderboard_FlipNGo.png', tag: 'All-in' },
    { title: 'Fish Buffet', sub: 'Spin the wheel, win up to 100,000x', img: '/assets/ui/discover/Bg_Discover_Fishbuffet.png', tag: 'Rewards', link: '/rewards' },
    { title: 'GG Care', sub: 'Bad beat protection & daily prizes', img: '/assets/ui/discover/Bg_Discover_GGcare.png', tag: 'Cashback', link: '/ggcare' },
    { title: 'Ocean Rewards', sub: 'Collect gems, climb the reef', img: '/assets/ui/discover/D_Discover_OceanRewards_Whale.png', tag: 'Rewards', link: '/ocean' },
    { title: 'Hold’em Leaderboards', sub: '$50,000 weekly race', img: '/assets/ui/discover/Bg_Discover_Leaderboard_Holdem.png', tag: 'Leaderboard' },
    { title: 'Mystery Battle Royale', sub: 'Bounty tournaments with hidden prizes', img: '/assets/ui/discover/Bg_Discover_Leaderboard_MysterBattleRoyal.png', tag: 'Tournament' },
    { title: 'Honeymoon Bonus', sub: 'New player welcome package', img: '/assets/ui/discover/Bg_Discover_Honeymoon.png', tag: 'Bonus' },
    { title: 'Weekly Freeroll', sub: 'Free entry, real prizes', img: '/assets/ui/discover/Bg_Discove_WeeklyFreeroll_EN.png', tag: 'Freeroll' },
    { title: 'After The Fold', sub: 'Win your share of $40,000 daily', img: '/assets/ui/discover/Bg_Discover_AoF.png', tag: 'All-in or Fold' },
    { title: 'Daily Freebie', sub: 'A free gift every day', img: '/assets/ui/discover/Bg_Discover_DailyFreebie.png', tag: 'Gift' },
    { title: 'Casino Bonus', sub: 'Weekly casino free spins', img: '/assets/ui/discover/Bg_Discover_CasinoBonus_EN.png', tag: 'Casino' },
    { title: 'Fish Buffet Platinum', sub: 'Higher ranks, bigger wheels', img: '/assets/ui/discover/Bg_Discover_Fishbuffet_Platinum.png', tag: 'Rewards' },
    { title: 'Spin & Gold Leaderboard', sub: 'Weekly SNG race', img: '/assets/ui/discover/Bg_Discover_Leaderboard_SpinNGold.png', tag: 'Leaderboard' },
    { title: 'Rush & Cash Leaderboard', sub: 'Fast-fold race', img: '/assets/ui/discover/Bg_Discover_Leaderboard_RushNCash_Holdem.png', tag: 'Leaderboard' },
    { title: 'Short Deck Leaderboard', sub: 'Six-plus race', img: '/assets/ui/discover/Bg_Discover_Leaderboard_ShortDeck.png', tag: 'Leaderboard' },
  ];

  return (
    <PageShell activeTop="poker">
      <div className="page">
        <h1 className="page-title">Promotions</h1>
        <p className="page-sub">All running offers, missions and giveaways</p>
        <div className="promo-grid">
          {promos.map((p) => (
            <div key={p.title} className="promo-card" onClick={() => { if ((p as any).link) navigate((p as any).link); else setDetail(p); }}>
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
  const { lang, setLang, languages } = useI18n();
  const [tab, setTab] = useState('general');
  const [nick, setNick] = useState(user?.nick || '');
  const [theme, setTheme] = useState(localStorage.getItem('ggpoker.theme') || 'Green');
  const [volume, setVolume] = useState(Number(localStorage.getItem('ggpoker.volume') || 70));
  const [betting, setBetting] = useState<BetPrefs>(() => readBetPrefs());
  const [showHand, setShowHand] = useState(() => localStorage.getItem('ggpoker.showHand') !== '0');
  const [hotkeyHints, setHotkeyHints] = useState(() => localStorage.getItem('ggpoker.hotkeyHints') !== '0');
  const [hotkeys, setHotkeys] = useState(() => localStorage.getItem('ggpoker.hotkeys') !== '0');
  const [dealSpeed, setDealSpeed] = useState(() => Number(localStorage.getItem('ggpoker.dealSpeed') || 3));
  const [cardBack, setCardBack] = useState(readCardBack());
  const [cardFront, setCardFront] = useState(() => localStorage.getItem('ggpoker.cardFront') || 'classic');
  const [stackMode, setStackMode] = useState<StackMode>(readStackMode);
  const [roomBg, setRoomBg] = useState(() => localStorage.getItem('ggpoker.roomBg') || 'featured');
  const [channels, setChannels] = useState({ ...sound.channels });
  const [buyinPct, setBuyinPct] = useState(() => Number(localStorage.getItem('ggpoker.buyinPct') || 0));
  const [autoTopup, setAutoTopup] = useState(() => localStorage.getItem('ggpoker.autoTopup') === '1');
  const [topupTrigger, setTopupTrigger] = useState(() => Number(localStorage.getItem('ggpoker.topupTrigger') || 25));
  const [topupTarget, setTopupTarget] = useState(() => Number(localStorage.getItem('ggpoker.topupTarget') || 100));
  const [currentPw, setCurrentPw] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [fourColor, setFourColor] = useState(localStorage.getItem('ggpoker.fourcolor') === '1');
  const [autoMuck, setAutoMuck] = useState(localStorage.getItem('ggpoker.automuck') !== '0');
  const [runItTwice, setRunItTwice] = useState(localStorage.getItem('ggpoker.rit') === '1');

  const persist = (key: string, value: string) => {
    localStorage.setItem(key, value);
    api.saveSettings({
      lang: localStorage.getItem('ggpoker.lang'), theme: localStorage.getItem('ggpoker.theme'),
      volume: localStorage.getItem('ggpoker.volume'), fourcolor: localStorage.getItem('ggpoker.fourcolor'),
      automuck: localStorage.getItem('ggpoker.automuck'), rit: localStorage.getItem('ggpoker.rit'),
      betPrefs: localStorage.getItem('ggpoker.betPrefs'), showHand: localStorage.getItem('ggpoker.showHand'),
      hotkeyHints: localStorage.getItem('ggpoker.hotkeyHints'), dealSpeed: localStorage.getItem('ggpoker.dealSpeed'),
      cardBack: localStorage.getItem('ggpoker.cardBack'),
    }).catch(() => {});
  };
  const saveBetting = (next: BetPrefs) => {
    setBetting(next);
    persist('ggpoker.betPrefs', JSON.stringify(next));
  };
  const changePassword = async () => {
    try {
      await api.changePassword(currentPw, nextPw);
      setCurrentPw(''); setNextPw('');
      toast({ kind: 'success', title: 'Password changed', body: 'Other sessions have been signed out.' });
    } catch (e: any) { toast({ kind: 'error', title: 'Password not changed', body: e.message }); }
  };

  const saveNick = async () => {
    try { await api.setNick(nick); await refreshUser(); sound.play('coin'); toast({ kind: 'success', title: 'Nickname updated', body: nick }); }
    catch (e: any) { toast({ kind: 'error', title: 'Cannot change nickname', body: e.message }); }
  };

  return (
    <PageShell activeTop="poker" subnav={<SubNav items={[{ key: 'general', label: 'General' }, { key: 'sound', label: 'Sound' }, { key: 'table', label: 'Table & cards' }, { key: 'betting', label: 'Betting' }, { key: 'account', label: 'Account' }, { key: 'responsible', label: 'Responsible gaming' }]} active={tab} onChange={setTab} />}>
      <div className="page">
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Preferences are stored locally and applied instantly</p>

        {tab === 'general' && (
          <div className="grid g2">
            <div className="card">
              <div className="panel-title">Language</div>
              <select className="admin-select" style={{ width: '100%' }} value={lang} onChange={(e) => { setLang(e.target.value); }}>
                {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
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
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-title">Buy-in defaults</div>
              <div className="between"><span className="muted small">Default buy-in (0% = table minimum)</span><b>{buyinPct}% of maximum</b></div>
              <input type="range" min={0} max={100} value={buyinPct} style={{ width: '100%' }}
                onChange={(e) => { const v = Number(e.target.value); setBuyinPct(v); persist('ggpoker.buyinPct', String(v)); }} />
              <label className="switch-row" style={{ marginTop: 8 }}><span>Auto top-up after a hand</span><input type="checkbox" checked={autoTopup} onChange={(e) => { setAutoTopup(e.target.checked); persist('ggpoker.autoTopup', e.target.checked ? '1' : '0'); }} /></label>
              <div className="grid g2" style={{ marginTop: 6 }}>
                <div>
                  <div className="between muted small"><span>Refill below</span><b>{topupTrigger}%</b></div>
                  <input type="range" min={5} max={80} value={topupTrigger} style={{ width: '100%' }} onChange={(e) => {
                    const v = Math.min(Number(e.target.value), topupTarget); setTopupTrigger(v); persist('ggpoker.topupTrigger', String(v));
                  }} />
                </div>
                <div>
                  <div className="between muted small"><span>Refill to</span><b>{topupTarget}%</b></div>
                  <input type="range" min={20} max={100} value={topupTarget} style={{ width: '100%' }} onChange={(e) => {
                    const v = Math.max(Number(e.target.value), topupTrigger); setTopupTarget(v); persist('ggpoker.topupTarget', String(v));
                  }} />
                </div>
              </div>
              <p className="muted small">Uses practice chips only. Auto top-up never refills during a hand.</p>
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
              {([['sfx', 'Card & chip sounds'], ['voice', 'Action voices'], ['alerts', 'Notification alerts'], ['music', 'Lobby music'], ['ambience', 'Table ambience']] as const).map(([key, label]) => (
                <label key={key} className="switch-row"><span>{label}</span><input type="checkbox" checked={channels[key]} onChange={(e) => { const on = e.target.checked; sound.setChannel(key, on); setChannels({ ...sound.channels }); }} /></label>
              ))}
              <p className="muted small">These are independent channels; master sound still overrides all of them.</p>
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
            <div className="panel-title" style={{ marginTop: 18 }}>Card back</div>
            <div className="cardback-grid">
              {CARD_BACKS.map((b) => (
                <button key={b.id} className={'cardback-swatch back-skin-' + b.id + (cardBack === b.id ? ' on' : '')} onClick={() => { setCardBack(b.id); persist('ggpoker.cardBack', b.id); sound.play('click', { volume: .4 }); }}>
                  <span className="back-preview" />
                  <b>{b.label}</b>
                </button>
              ))}
            </div>
            <div className="panel-title" style={{ marginTop: 18 }}>Room background</div>
            <div className="room-bg-grid">
              {([['featured', 'Featured room', 'featured_6ring.png'], ['dark', 'Dark room', 'room_dark.png'], ['floor', 'Stone floor', 'room_floor.png']] as const).map(([id, label, img]) => (
                <button key={id} className={'room-bg-choice' + (roomBg === id ? ' on' : '')} onClick={() => { setRoomBg(id); persist('ggpoker.roomBg', id); sound.play('click', { volume: .4 }); }}>
                  <span style={{ backgroundImage: `url('/assets/tables/${img}')` }} /><b>{label}</b>
                </button>
              ))}
            </div>
            <div className="panel-title" style={{ marginTop: 18 }}>Card front</div>
            <div className="card-front-grid">
              {([['classic', 'Classic'], ['jumbo', 'Jumbo index'], ['minimal', 'Minimal'], ['four', 'Four colour']] as const).map(([id, label]) => (
                <button key={id} className={'card-front-choice' + (cardFront === id ? ' on' : '')} onClick={() => { setCardFront(id); persist('ggpoker.cardFront', id); if (id === 'four') { setFourColor(true); persist('ggpoker.fourcolor', '1'); } }}>
                  <span className={'mini-card front-' + id}><i>A</i><b>♠</b></span><b>{label}</b>
                </button>
              ))}
            </div>
            <div className="grid g2" style={{ marginTop: 18 }}>
              <div className="card">
                <div className="panel-title">Cards</div>
                <label className="switch-row"><span>Four-colour deck</span><input type="checkbox" checked={fourColor} onChange={(e) => { setFourColor(e.target.checked); persist('ggpoker.fourcolor', e.target.checked ? '1' : '0'); }} /></label>
                <label className="switch-row"><span>Show hand strength</span><input type="checkbox" checked={showHand} onChange={(e) => { setShowHand(e.target.checked); persist('ggpoker.showHand', e.target.checked ? '1' : '0'); }} /></label>
                <label className="switch-row"><span>Enable table hotkeys</span><input type="checkbox" checked={hotkeys} onChange={(e) => { setHotkeys(e.target.checked); persist('ggpoker.hotkeys', e.target.checked ? '1' : '0'); }} /></label>
                <label className="switch-row"><span>Show keyboard hints</span><input type="checkbox" checked={hotkeyHints} onChange={(e) => { setHotkeyHints(e.target.checked); persist('ggpoker.hotkeyHints', e.target.checked ? '1' : '0'); }} /></label>
                <div className="admin-label" style={{ marginTop: 14 }}>Dealer animation speed</div>
                <input type="range" min={1} max={5} value={dealSpeed} style={{ width: '100%' }}
                  onChange={(e) => { const v = Number(e.target.value); setDealSpeed(v); persist('ggpoker.dealSpeed', String(v)); }} />
                <div className="between muted small"><span>Slow</span><span>{dealSpeed}</span><span>Fast</span></div>
              </div>
              <div className="card">
                <div className="panel-title">Time bank</div>
                <div className="kv"><span>Time bank seconds</span><b>10s</b></div>
                <p className="muted small">One 10-second extension per hand. The table engine owns the timer, so the value is fixed for now.</p>
                <div className="panel-title" style={{ marginTop: 18 }}>Deck</div>
                <div className="kv"><span>Card fronts</span><b>{fourColor ? 'Four colour' : 'Two colour'}</b></div>
                <div className="kv"><span>Card back</span><b>{CARD_BACKS.find((b) => b.id === cardBack)?.label}</b></div>
                <label className="admin-label" style={{ marginTop: 14 }}>Stack display</label>
                <select className="admin-select" value={stackMode} onChange={(e) => { const v = e.target.value as StackMode; setStackMode(v); persist('ggpoker.stackMode', v); }}>
                  <option value="chips">Chips</option>
                  <option value="bb">Big blinds</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
          </>
        )}

        {tab === 'betting' && (
          <div className="grid g2">
            <div className="card">
              <div className="panel-title">Pre-flop opening</div>
              <p className="muted small">The four buttons shown before the flop. Values are in big blinds.</p>
              <div className="bet-pref-grid">
                {(betting.opening).map((v, i) => (
                  <label key={i}><span>Button {i + 1}</span>
                    <select className="admin-select" value={String(v)} onChange={(e) => {
                      const raw = e.target.value; const val: any = raw === 'pot' ? 'pot' : Number(raw);
                      const next = { ...betting, opening: betting.opening.map((x, j) => j === i ? val : x) }; saveBetting(next);
                    }}>
                      {OPENING_CHOICES.map((v2) => <option key={String(v2)} value={String(v2)}>{betLabel(v2, true)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="panel-title">Post-flop sizing</div>
              <p className="muted small">The four buttons after the flop. Percentages are of the pot plus the call amount.</p>
              <div className="bet-pref-grid">
                {(betting.normal).map((v, i) => (
                  <label key={i}><span>Button {i + 1}</span>
                    <select className="admin-select" value={String(v)} onChange={(e) => {
                      const raw = e.target.value; const val: any = raw === 'max' ? 'max' : Number(raw);
                      const next = { ...betting, normal: betting.normal.map((x, j) => j === i ? val : x) }; saveBetting(next);
                    }}>
                      {NORMAL_CHOICES.map((v2) => <option key={String(v2)} value={String(v2)}>{betLabel(v2, false)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="panel-title">Preview</div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {betting.opening.map((v, i) => <span key={'o' + i} className="tag gold">{betLabel(v, true)}</span>)}
                <span style={{ width: 12 }} />
                {betting.normal.map((v, i) => <span key={'n' + i} className="tag">{betLabel(v, false)}</span>)}
              </div>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => saveBetting({ opening: [...DEFAULT_BETS.opening], normal: [...DEFAULT_BETS.normal] })}>Reset defaults</button>
              </div>
              <p className="muted small">Shortcuts only prepare an amount — they never submit an action.</p>
            </div>
          </div>
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
              <input className="admin-input" style={{ width: '100%' }} value={user?.email || ''} disabled />
              <p className="muted small">Email changes are managed by the local operator.</p>
              <div className="kv" style={{ marginTop: 12 }}><span>Balance</span><b>{money(user?.balance ?? 0)}</b></div>
              <div className="kv"><span>Tickets</span><b>T${user?.tickets ?? 0}</b></div>
              <div className="kv"><span>Member since</span><b>{user?.created_at?.slice(0, 10)}</b></div>
            </div>
            <div className="card">
              <div className="panel-title">Security</div>
              <div className="field"><label>Current password</label><input type="password" placeholder="••••••••" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" /></div>
              <div className="field"><label>New password</label><input type="password" placeholder="At least 4 characters" value={nextPw} onChange={(e) => setNextPw(e.target.value)} autoComplete="new-password" /></div>
              <button className="btn btn-red btn-sm" disabled={!currentPw || nextPw.length < 4} onClick={changePassword}>Change password</button>
              <div className="panel-title" style={{ marginTop: 20 }}>Sessions</div>
              <div className="kv"><span>This device</span><b>macOS · active now</b></div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={async () => {
                try { await api.revokeOtherSessions(); toast({ kind: 'success', title: 'Other sessions signed out' }); }
                catch (e: any) { toast({ kind: 'error', title: 'Could not sign out sessions', body: e.message }); }
              }}>Sign out other devices</button>
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
                {['24 hours', '7 days', '30 days', 'Self-exclude'].map((x) => <button key={x} className="btn btn-ghost btn-sm" onClick={() => toast({ kind: 'info', title: 'Play-money limit', body: `${x} breaks are not enforced in this local clone.` })}>{x}</button>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
