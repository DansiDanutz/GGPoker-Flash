import { useEffect, useRef, useState } from 'react';
import { getToken } from '../lib/api';
import { useApp } from '../lib/store';

type Connection = {
  enabled: boolean; hasRecord: boolean;
  status: 'unconfigured' | 'starting' | 'pending' | 'verifying' | 'verified' | 'denied' | 'expired' | 'error' | 'disabled';
  merchantId: string | null; mode: 'test' | 'live' | null; userCode: string | null;
  verificationUri: string | null; expiresAt: string | null; credentialExpiresAt: string | null;
  nextPollAt: string | null; lastError: string | null;
};
async function connectionRequest(path = '', method = 'GET', body?: object): Promise<Connection> {
  const response = await fetch('/api/account/nervixpay' + path, { method, headers: { authorization: `Bearer ${getToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The NervixPay connection could not be updated.');
  return data;
}
const labels = { unconfigured: 'Connection unavailable', starting: 'Preparing approval', pending: 'Waiting for your approval', verifying: 'Checking your account', verified: 'Account connected', denied: 'Approval declined', expired: 'Reconnect required', error: 'Connection needs attention', disabled: 'Not connected' };

export function NervixPayConnection() {
  const { user, navigate } = useApp();
  const [data, setData] = useState<Connection | null>(null), [error, setError] = useState('');
  const [merchantId, setMerchantId] = useState(''), [mode, setMode] = useState<'test' | 'live'>('test');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const registered = !!user && !user.is_guest;
  useEffect(() => { if (registered) { let active = true; void connectionRequest().then(value => { if (active) setData(value); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; } }, [registered, user?.id]);
  const run = async (path = '', method = 'GET', body?: object) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { setData(await connectionRequest(path, method, body)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Connection failed.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <section className="ow-card nervixpay-connection" aria-label="Your NervixPay account">
    <span className="mp-eyebrow">YOUR ACCOUNT · YOUR APPROVAL</span><h3>Connect NervixPay</h3>
    <p>Create your own NervixPay account, complete its setup, then link it here. Every registered player can connect; an organizer subscription is not required.</p>
    <p>Free Play Money needs no payment account. Connecting NervixPay does not deposit money, add chips, buy membership or send a withdrawal.</p>
    <div className="ow-actions"><a className="mp-button mp-button-secondary" href="https://nervixpay.live/dashboard" target="_blank" rel="noopener noreferrer">Create or manage NervixPay account</a></div>
    {!registered ? <><p>Sign in to a permanent DanGG account to save your connection.</p><button className="mp-button mp-button-primary" onClick={() => navigate('/login')}>Sign in to connect</button></> : <>
      {error && <p role="alert">{error}</p>}
      {data && <p role="status"><strong>{labels[data.status]}</strong>{data.mode && ` · ${data.mode === 'live' ? 'Live' : 'Test'}`}</p>}
      {data?.merchantId && <p className="nervixpay-account-id">Merchant: {data.merchantId}</p>}
      {data?.lastError && <p>{data.lastError}</p>}
      {data && !data.enabled && <p>Account linking is not enabled on this installation yet. You can still manage your NervixPay account and use free Play Money.</p>}
      {data?.status === 'verified' && <>
        <p>{data.mode === 'live' ? 'Your approved live connection is available for supported payment features. Each payment still needs its own request and confirmation.' : 'Test connection only. It cannot collect live payments.'}</p>
        {data.credentialExpiresAt && <p>Approval expires {new Date(data.credentialExpiresAt).toLocaleString()}. Reconnect when it expires.</p>}
      </>}
      {data?.userCode && <div className="nervixpay-approval"><p>In NervixPay, review the request from OpenPoker and enter this approval code:</p><strong>{data.userCode}</strong>
        {data.verificationUri === 'https://nervixpay.live/integrations' && <a className="mp-button mp-button-primary" href={data.verificationUri} target="_blank" rel="noopener noreferrer">Review and approve in NervixPay</a>}
        {data.expiresAt && <p>Complete approval before {new Date(data.expiresAt).toLocaleTimeString()}.</p>}
      </div>}
      {data && ['pending', 'verifying'].includes(data.status) && <><p>After approving there, check here. Allow at least five seconds between checks.</p><button className="mp-button mp-button-primary" disabled={busy} onClick={() => void run('/poll', 'POST', {})}>Check approval</button></>}
      {data?.enabled && !['pending', 'starting', 'verifying', 'verified'].includes(data.status) && <form onSubmit={e => { e.preventDefault(); void run('/connect', 'POST', { merchantId: merchantId.trim(), mode }); }}>
        <label>Your NervixPay merchant ID<input className="admin-input" required autoCapitalize="none" spellCheck={false} maxLength={36} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" value={merchantId} onChange={e => setMerchantId(e.target.value)} /></label>
        <p>Copy the merchant ID from your own NervixPay dashboard. Do not enter a password, API token or wallet recovery phrase.</p>
        <label>Connection mode<select className="admin-input" value={mode} onChange={e => { setMode(e.target.value as 'test' | 'live'); setConsent(false); }}><option value="test">Test — no live payments</option><option value="live">Live — real payment links</option></select></label>
        <label className="nervixpay-consent"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />I want OpenPoker to verify this account, create payment links and read payment status in {mode} mode. I will approve access myself in NervixPay.</label>
        <button className="mp-button mp-button-primary" disabled={busy || !consent}>Start secure connection</button>
        <p>Ordinary approvals last seven days. Credentials stay encrypted on the server; you can disconnect here or revoke access in NervixPay.</p>
      </form>}
      <div className="ow-actions"><button className="mp-button mp-button-secondary" disabled={busy} onClick={() => void run()}>Refresh connection</button>
        {data?.hasRecord && (data.status !== 'disabled' || data.lastError) && <button className="mp-button mp-button-secondary" disabled={busy} onClick={() => { if (window.confirm('Disconnect NervixPay? This stops new use of this connection in OpenPoker. Existing payments and chip balances are unchanged.')) void run('', 'DELETE'); }}>{data.status === 'disabled' ? 'Retry credential revocation' : 'Disconnect NervixPay'}</button>}
      </div>
    </>}
  </section>;
}
