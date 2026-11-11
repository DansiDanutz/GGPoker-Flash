import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { sound } from '../lib/sound';

export function Login() {
  const { login, register, navigate, toast, brand, demoAccount, enterGuest } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(loginId.trim(), password);
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

  const seed = () => { setLoginId('DansiDanutz'); setPassword('ggpoker'); setMode('login'); };
  const switchMode = (next: 'login' | 'register') => { setMode(next); setErr(''); };

  const registering = mode === 'register';

  return (
    <div className="login-screen">
      <div className="login-art">
        <div className="glow">
          <div className="glow-eyebrow">Play money poker</div>
          <h2>Let's build the world's biggest poker room</h2>
          <p>Play money · Instant play · No risk</p>
        </div>
      </div>

      <div className="login-box">
        <img className="brand-logo" src={brand.logo} alt="DanGG" />

        <div className="seg" role="tablist" aria-label="Account access">
          <button role="tab" aria-selected={!registering} className={!registering ? 'on' : ''} onClick={() => switchMode('login')}>Log in</button>
          <button role="tab" aria-selected={registering} className={registering ? 'on' : ''} onClick={() => switchMode('register')}>Create account</button>
        </div>

        <div className="auth-head">
          <h1>{registering ? 'Create your free account' : 'Welcome back'}</h1>
          <p>
            {registering
              ? 'No deposit, no cash value — nothing at risk.'
              : 'Log in to pick up your seat, your chips and your rewards.'}
          </p>
        </div>

        {err && <div className="auth-error">{err}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-id">Account ID or nickname</label>
            <input
              id="login-id"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoFocus
              autoComplete="username"
              placeholder="Your DanGG.Live ID"
            />
          </div>

          {registering && (
            <>
              <div className="field">
                <label htmlFor="login-nick">Nickname at the tables</label>
                <input
                  id="login-nick"
                  value={nick}
                  onChange={(e) => setNick(e.target.value)}
                  placeholder="Pick a nickname"
                />
              </div>
              <div className="field">
                <label htmlFor="login-email">Email <span className="field-hint">optional</span></label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="login-password">
              Password {registering && <span className="field-hint">6+ characters</span>}
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={registering ? 'new-password' : 'current-password'}
              placeholder="••••••••"
            />
          </div>

          <button className="btn btn-red btn-block auth-cta" disabled={busy}>
            {busy ? 'Please wait…' : registering ? 'Create account & play' : 'Log in'}
          </button>
        </form>

        <div className="auth-links">
          {demoAccount && <button onClick={seed}>Use demo account</button>}
          <button onClick={() => { enterGuest(); navigate('/'); }}>Play as guest</button>
        </div>

        {registering && (
          <div className="auth-perks">
            <span>Instant balance</span>
            <span>Cash &amp; tournaments</span>
            <span>Browser or app</span>
          </div>
        )}

        <div className="login-footer">
          {!registering && demoAccount && <>Demo account: <b>DansiDanutz</b> / <b>ggpoker</b><br /></>}
          Play money only — no real money, deposits or cash value.
        </div>
      </div>
    </div>
  );
}
