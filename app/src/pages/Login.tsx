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

  return (
    <div className="login-screen">
      <div className="login-art">
        <div className="glow">
          <h2>Let's build the world's biggest poker room</h2>
          <p>Play money · Instant play · No risk</p>
        </div>
      </div>
      <div className="login-box">
        <img className="brand-logo" src={brand.logo} alt="DanGG" />
        <div className="tabs-line">
          <button className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setErr(''); }}>Log in</button>
          <button className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setErr(''); }}>Create account</button>
        </div>
        {err && <div className="auth-error">{err}</div>}
        <form onSubmit={submit}>
          <div className="field">
            <label>Account ID or nickname</label>
            <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoFocus placeholder="Your DanGG.Live ID" />
          </div>
          {mode === 'register' && (
            <>
              <div className="field">
                <label>Nickname (shown at the tables)</label>
                <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Pick a nickname" />
              </div>
              <div className="field">
                <label>Email (optional)</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
            </>
          )}
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          <button className="btn btn-red btn-block" style={{ height: 44, marginTop: 8 }} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account & play'}
          </button>
        </form>
        <div className="auth-links">
          {demoAccount && <button onClick={seed}>Use demo account</button>}
          <button onClick={() => { enterGuest(); navigate('/'); }}>Play as guest</button>
        </div>
        <div className="login-footer">
          {demoAccount && <>Demo account: <b>DansiDanutz</b> / <b>ggpoker</b><br /></>}
          This is a local, offline play-money clone. No real money, deposits or cash value.
        </div>
      </div>
    </div>
  );
}
