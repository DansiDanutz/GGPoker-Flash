import { useEffect, useRef, useState } from 'react';
import { contributorApi, type Contribution } from '../lib/contributor-api';
import { useApp } from '../lib/store';
import '../contributor.css';

const REPO = 'https://github.com/OpenPoker4all/OpenPoker';

export function ContributorWorkspace({ admin = false }: { admin?: boolean }) {
  const { user } = useApp();
  const [rows, setRows] = useState<Contribution[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [form, setForm] = useState({ pluginId: '', prUrl: '', notes: '' });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setRows([]); setError('');
    if (!user || user.is_guest) return;
    contributorApi.list(admin).then((data) => {
      if (!cancelled) { setRows(data.submissions); }
    }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load submissions.'); });
    return () => { cancelled = true; };
  }, [user?.id, admin, refresh]);
  async function action(work: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); setNotice(message); setRefresh((n) => n + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!user || user.is_guest) return <p>Sign in to a registered account to view your Contributor workspace.</p>;
  return <section className="contributor-workspace" aria-label={admin ? 'Contributor review queue' : 'Contributor workspace'}>
    <h2>{admin ? 'Contributor review queue' : 'Build and test in Play Money'}</h2>
    {!admin && <>
      <p>Develop browser features, server rules and new games in your own clone. Local development and Play Money testing are free. Official marketplace submission requires an active $9/month Contributor membership and an approved publisher profile.</p>
      <ol><li>Clone OpenPoker, install its dependencies and run <code>cd app && pnpm sandbox</code>.</li><li>Implement your feature, add tests and a free Play Money entry point.</li><li>Open a GitHub PR. After CI passes, submit its link below.</li><li>OpenPoker reviews the source, merges accepted work, and activates the released plugin for your contributor account.</li></ol>
      <p><a href={`${REPO}/blob/main/docs/CONTRIBUTOR_SANDBOX.md`} target="_blank" rel="noreferrer">Contributor guide</a> · <a href={`${REPO}/compare`} target="_blank" rel="noreferrer">Open a pull request</a></p>
      <p>Local testing never grants official marketplace approval. Publishing a listing is separate from merging source code. These records belong to this installation.</p>
      <form onSubmit={(event) => { event.preventDefault(); void action(() => contributorApi.submit(form), 'Commit submitted for review.'); }}>
        <fieldset disabled={busy}>
          <legend>Submit a tested contribution</legend>
          <label>Plugin ID<input required pattern="[a-z][a-z0-9-]{2,60}" maxLength={61} value={form.pluginId} onChange={(e) => setForm({ ...form, pluginId: e.target.value })} /></label>
          <label>OpenPoker pull request URL<input required type="url" maxLength={160} placeholder={`${REPO}/pull/123`} value={form.prUrl} onChange={(e) => setForm({ ...form, prUrl: e.target.value })} /></label>
          <label>Testing instructions and results<textarea required maxLength={4000} rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <button className="mp-button mp-button-primary" type="submit">Submit for approval</button>
        </fieldset>
      </form>
    </>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="contributor-heading"><h3>{admin ? 'Submitted versions' : 'My submissions and activated plugins'}</h3><button type="button" disabled={busy} onClick={() => setRefresh((n) => n + 1)}>Refresh</button></div>
    {!rows.length && <p>No submissions yet.</p>}
    {rows.map((row) => <article key={row.id}>
      <h4>{row.plugin_id} <span>· {row.status}</span></h4>
      <p><a href={`${REPO}/pull/${row.pr_number}`} target="_blank" rel="noreferrer">PR #{row.pr_number}</a> · <a href={row.proof.ci_url} target="_blank" rel="noreferrer">Verified CI</a> · <code>{row.head_sha}</code></p>
      <p>GitHub author: {row.proof.author}{admin ? ` · Account ${row.user_id}` : ''} · {row.installed ? 'Included in this release' : 'Not yet in this release'}</p>
      <p className="contributor-notes">{row.notes}</p>{row.reason && <p><strong>Review:</strong> {row.reason}</p>}
      {admin && ['submitted', 'approved', 'published'].includes(row.status) && <fieldset disabled={busy}>
        <label>Review reason<textarea maxLength={2000} value={reasons[row.id] || ''} onChange={(e) => setReasons({ ...reasons, [row.id]: e.target.value })} /></label>
        {row.status === 'submitted' && <label className="contributor-check"><input type="checkbox" checked={confirmed[row.id] || false} onChange={(e) => setConfirmed({ ...confirmed, [row.id]: e.target.checked })} />I verified that the PR author owns this contributor account and reviewed the implementation.</label>}
        <div className="contributor-actions">{(row.status === 'submitted' ? ['approve', 'reject'] : row.status === 'approved' ? ['publish'] : ['revoke']).map((operation) => <button type="button" key={operation} disabled={!reasons[row.id]?.trim() || (operation === 'approve' && !confirmed[row.id])} onClick={() => void action(() => contributorApi.review(row.id, { action: operation, reason: reasons[row.id], authorConfirmed: !!confirmed[row.id] }), `Review action recorded: ${operation}.`)}>{operation === 'publish' ? 'Publish and activate' : operation}</button>)}</div>
      </fieldset>}
    </article>)}
  </section>;
}
