import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';
import { useI18n } from '../lib/i18n';
import { APP_BUILD, APP_VERSION, buildLabel } from '../lib/version';

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="8" r="3.6" /><path d="M4.5 20c.7-3.6 3.8-5.6 7.5-5.6s6.8 2 7.5 5.6" />
  </svg>
);
const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <rect x="4.5" y="10" width="15" height="10" rx="2.2" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
  </svg>
);
const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.2" /><path d="m4.5 7 7.5 6 7.5-6" />
  </svg>
);
const EyeIcon = ({ off }: { off?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6Z" />
    <circle cx="12" cy="12" r="2.8" />
    {off && <path d="M4 4 20 20" />}
  </svg>
);
const HelpIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.3" /><circle cx="12" cy="17.2" r=".7" fill="currentColor" stroke="none" />
  </svg>
);
const GlobeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3Z" />
  </svg>
);

export function Login() {
  const { login, register, navigate, toast, brand, demoAccount, enterGuest } = useApp();
  const { lang, setLang, languages } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginId, setLoginId] = useState(() => {
    try { return localStorage.getItem('ggpoker.rememberLogin') || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [remember, setRemember] = useState(() => {
    try { return localStorage.getItem('ggpoker.remember') === '1'; } catch { return false; }
  });
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [legal, setLegal] = useState<null | 'terms' | 'privacy'>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setErr(''); }, [mode]);
  useEffect(() => {
    if (!langOpen) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.login2-lang-wrap')) setLangOpen(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [langOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(loginId.trim(), password);
        try {
          if (remember) {
            localStorage.setItem('ggpoker.remember', '1');
            localStorage.setItem('ggpoker.rememberLogin', loginId.trim());
          } else {
            localStorage.removeItem('ggpoker.remember');
            localStorage.removeItem('ggpoker.rememberLogin');
          }
        } catch { /* private mode */ }
        sound.play('coin');
        toast({ kind: 'success', title: 'Welcome back', body: 'Good luck at the tables!' });
      } else {
        await register({ login: loginId.trim(), nick: nick.trim() || loginId.trim(), password, email });
        sound.play('coin');
        toast({ kind: 'reward', title: 'Welcome bonus credited', body: 'Your play balance is ready.' });
      }
    } catch (e: any) {
      setErr(e.message || 'Something went wrong');
      sound.play('fold', { volume: .4 });
    } finally {
      setBusy(false);
    }
  };

  const seed = () => {
    setLoginId('DansiDanutz');
    setPassword('ggpoker');
    setMode('login');
    cardRef.current?.querySelector<HTMLInputElement>('#login-id')?.focus();
  };
  const switchMode = (next: 'login' | 'register') => { setMode(next); setErr(''); };
  const registering = mode === 'register';
  const openHelp = () => { setHelpOpen(true); sound.play('click', { volume: .4 }); };

  return (
    <div className="login2">
      <h1 className="login2-sr">The table is waiting. Play money poker.</h1>

      <header className="login2-top">
        <img className="login2-logo" src={brand.logo} alt="DanGG" />
        <div className="login2-top-actions">
          <button type="button" onClick={openHelp}><HelpIcon />Help</button>
          <div className="login2-lang-wrap">
            <button type="button" onClick={(e) => { e.stopPropagation(); setLangOpen((v) => !v); }} aria-haspopup="listbox" aria-expanded={langOpen}>
              <GlobeIcon />{lang.toUpperCase()}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {langOpen && (
              <div className="login2-lang" role="listbox" aria-label="Language">
                {languages.map((l) => (
                  <button key={l.code} role="option" aria-selected={l.code === lang} className={l.code === lang ? 'on' : ''} onClick={() => { setLang(l.code); setLangOpen(false); sound.play('click', { volume: .4 }); }}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="login2-hero" aria-hidden="true" />


      <div className="login2-side">
        <div className="login2-card" ref={cardRef}>
          <div className="login2-tabs" role="tablist" aria-label="Account access">
            <button role="tab" aria-selected={!registering} className={!registering ? 'on' : ''} onClick={() => switchMode('login')}>Log in</button>
            <button role="tab" aria-selected={registering} className={registering ? 'on' : ''} onClick={() => switchMode('register')}>Create account</button>
          </div>

          <div className="login2-head">
            <h2>{registering ? 'Create your account' : 'Welcome back'}</h2>
            <p>{registering ? 'No deposit. No cash value. Just play.' : 'Your next hand is waiting.'}</p>
          </div>

          {err && <div className="login2-error" role="alert">{err}</div>}

          <form onSubmit={submit}>
            <div className="login2-field">
              <label htmlFor="login-id">Account ID or nickname</label>
              <div className="login2-input">
                <UserIcon />
                <input id="login-id" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoFocus autoComplete="username" placeholder="Your DanGG.Live ID" required />
              </div>
            </div>

            {registering && (
              <>
                <div className="login2-field">
                  <label htmlFor="login-nick">Nickname at the tables</label>
                  <div className="login2-input">
                    <UserIcon />
                    <input id="login-nick" value={nick} onChange={(e) => setNick(e.target.value)} autoComplete="nickname" placeholder="Pick a nickname" />
                  </div>
                </div>
                <div className="login2-field">
                  <label htmlFor="login-email">Email <span className="login2-hint">optional</span></label>
                  <div className="login2-input">
                    <MailIcon />
                    <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
                  </div>
                </div>
              </>
            )}

            <div className="login2-field">
              <label htmlFor="login-password">Password</label>
              <div className="login2-input">
                <LockIcon />
                <input
                  id="login-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={registering ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  required
                />
                <button type="button" className="login2-eye" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)}>
                  <EyeIcon off={showPw} />
                </button>
              </div>
            </div>

            {!registering && (
              <div className="login2-row">
                <label className="login2-remember">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  <span className="login2-check" aria-hidden="true" />
                  Remember me
                </label>
                <button type="button" className="login2-forgot" onClick={() => setHelpOpen(true)}>Forgot password?</button>
              </div>
            )}

            <button className="login2-cta" disabled={busy}>
              {busy ? 'Please wait…' : registering ? 'Create account & play' : 'Log in'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <div className="login2-sep"><span>or</span></div>

          <button type="button" className="login2-guest" onClick={() => { enterGuest(); navigate('/'); }}>Play as guest</button>

          {demoAccount && (
            <button type="button" className="login2-demo" onClick={seed}>Use demo account (DansiDanutz)</button>
          )}

          <p className="login2-foot-note">Play money only. No real money, deposits or cash value.</p>
          <p className="login2-version">v{APP_VERSION} · build {buildLabel(APP_BUILD)}</p>
        </div>
      </div>

      <footer className="login2-foot">
        <button type="button" onClick={() => setLegal('terms')}>Terms</button>
        <span className="divider" aria-hidden="true">|</span>
        <button type="button" onClick={() => setLegal('privacy')}>Privacy</button>
      </footer>

      {helpOpen && (
        <div className="login2-modal" role="dialog" aria-modal="true" aria-label="Help" onClick={() => setHelpOpen(false)}>
          <div className="login2-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Need a hand?</h3>
            <p>DanGG is a play-money poker room. If you are locked out or need a password reset, contact support and include your account ID or nickname.</p>
            <p className="login2-modal-note">support@dangg.live</p>
            <button type="button" className="login2-modal-close" onClick={() => setHelpOpen(false)}>Close</button>
          </div>
        </div>
      )}

      {legal && (
        <div className="login2-modal" role="dialog" aria-modal="true" aria-label={legal === 'terms' ? 'Terms' : 'Privacy'} onClick={() => setLegal(null)}>
          <div className="login2-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>{legal === 'terms' ? 'Terms of play' : 'Privacy'}</h3>
            {legal === 'terms' ? (
              <>
                <p>DanGG is a play-money poker room. No real money is wagered, won or lost, and chips or accounts have no cash value.</p>
                <p>Play is for entertainment. Abuse, collusion or automated play can end a session. Play responsibly.</p>
              </>
            ) : (
              <>
                <p>We store your nickname, login, hashed password, game history and device preferences to run the game and keep your session secure.</p>
                <p>No real-money payment data is collected. Contact support to delete your account and game history.</p>
              </>
            )}
            <button type="button" className="login2-modal-close" onClick={() => setLegal(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
