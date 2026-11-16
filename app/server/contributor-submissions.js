// SPDX-License-Identifier: AGPL-3.0-only
import { randomUUID } from 'node:crypto';
import { CONTRIBUTOR_PLUGINS, validatePluginRegistration } from './contributor-plugins.js';

export const CONTRIBUTOR_REPO = 'OpenPoker4all/OpenPoker';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail('Invalid text field.');
  return value.trim();
};
export function pullNumber(url) {
  const match = typeof url === 'string' && url.match(/^https:\/\/github\.com\/OpenPoker4all\/OpenPoker\/pull\/([1-9]\d{0,8})\/?$/);
  if (!match) fail(`Use a pull request URL in ${CONTRIBUTOR_REPO}.`);
  return Number(match[1]);
}

export async function verifyContribution(number, { fetcher = fetch } = {}) {
  const get = async (path) => {
    let response;
    try { response = await fetcher(`https://api.github.com/repos/${CONTRIBUTOR_REPO}${path}`, {
      headers: { accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'user-agent': 'OpenPoker-contributor-review' },
      signal: AbortSignal.timeout(10000), redirect: 'error',
    }); } catch { fail('GitHub verification is unavailable. Try again later.', 502); }
    if (!response.ok) fail('GitHub could not verify this PR or CI (possibly rate limited). Try again later.', 502);
    return response.json();
  };
  const pr = await get(`/pulls/${number}`);
  if (pr.base?.repo?.full_name !== CONTRIBUTOR_REPO || pr.base?.ref !== 'main' || !/^[a-f0-9]{40}$/.test(pr.head?.sha || '') || pr.draft) fail('Submit a ready-for-review PR targeting OpenPoker main.', 409);
  const ci = await get(`/actions/workflows/ci.yml/runs?head_sha=${pr.head.sha}&per_page=100`);
  const latest = (ci.workflow_runs || []).filter((run) => run.head_sha === pr.head.sha && run.event === 'pull_request').sort((a, b) => b.id - a.id)[0];
  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') fail('The latest OpenPoker CI run must pass on this exact PR commit.', 409);
  return { pr_number: number, head_sha: pr.head.sha, author: text(pr.user?.login, 100), merged: pr.merged === true,
    merge_sha: pr.merge_commit_sha || null, ci_run_id: latest.id, ci_url: `https://github.com/${CONTRIBUTOR_REPO}/actions/runs/${latest.id}` };
}

export function createContributorSubmissions({ db, billing, commerce, registrations = CONTRIBUTOR_PLUGINS, verify = verifyContribution, now = Date.now }) {
  registrations.forEach(validatePluginRegistration);
  if (new Set(registrations.map((plugin) => plugin.id)).size !== registrations.length) throw new Error('Duplicate contributor plugin registration.');
  db.exec(`CREATE TABLE IF NOT EXISTS contributor_submissions (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), publisher_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL, pr_number INTEGER NOT NULL, head_sha TEXT NOT NULL, notes TEXT NOT NULL,
    proof_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted', reason TEXT NOT NULL DEFAULT '',
    reviewed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(plugin_id,head_sha)
  ); CREATE INDEX IF NOT EXISTS contributor_owner ON contributor_submissions(user_id,created_at);`);
  const row = (id) => db.prepare('SELECT * FROM contributor_submissions WHERE id=?').get(id);
  const view = (value) => value && ({ ...value, proof: JSON.parse(value.proof_json), proof_json: undefined,
    installed: registrations.some((p) => p.id === value.plugin_id && p.prNumber === value.pr_number) });
  const audit = (actor, action, detail) => db.prepare('INSERT INTO audit_log(actor,action,detail) VALUES (?,?,?)').run(actor, action, JSON.stringify(detail));
  const transaction = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  const eligible = (id) => {
    if (!billing.account(id).memberships.contributor.active) fail('Active $9 Contributor membership required for marketplace submission.', 402);
    const publisher = commerce.publisherForUser(id);
    if (!publisher || publisher.status !== 'approved') fail('An approved publisher profile is required.', 403);
    return publisher;
  };
  return {
    list: (userId) => db.prepare(`SELECT * FROM contributor_submissions ${userId == null ? '' : 'WHERE user_id=?'} ORDER BY created_at DESC LIMIT 100`).all(...(userId == null ? [] : [userId])).map(view),
    plugins: () => registrations.map((plugin) => ({ ...plugin, play_money_free: true })),
    async submit(userId, body) {
      eligible(userId);
      const pluginId = text(body.pluginId, 61), notes = text(body.notes, 4000), number = pullNumber(body.prUrl);
      if (!/^[a-z][a-z0-9-]{2,60}$/.test(pluginId)) fail('Use a lowercase plugin identifier.');
      if (db.prepare('SELECT COUNT(*) n FROM contributor_submissions WHERE user_id=? AND created_at>=?').get(userId, new Date(now() - 86400000).toISOString()).n >= 10) fail('Submission limit reached. Try tomorrow.', 429);
      const proof = await verify(number);
      return transaction(() => {
        const publisher = eligible(userId);
        const existing = db.prepare('SELECT * FROM contributor_submissions WHERE plugin_id=? AND head_sha=?').get(pluginId, proof.head_sha);
        if (existing) { if (existing.user_id !== userId) fail('This version is already submitted.', 409); return view(existing); }
        if (db.prepare('SELECT COUNT(*) n FROM contributor_submissions WHERE user_id=? AND created_at>=?').get(userId, new Date(now() - 86400000).toISOString()).n >= 10) fail('Submission limit reached. Try tomorrow.', 429);
        const id = randomUUID(), at = new Date(now()).toISOString();
        db.prepare('INSERT INTO contributor_submissions(id,user_id,publisher_id,plugin_id,pr_number,head_sha,notes,proof_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(id, userId, publisher.id, pluginId, number, proof.head_sha, notes, JSON.stringify(proof), at, at);
        audit(String(userId), 'contributor_submitted', { id, pluginId, head_sha: proof.head_sha });
        return view(row(id));
      });
    },
    async review(id, body, actor) {
      const current = row(id); if (!current) fail('Submission not found.', 404);
      if (!['approve', 'reject', 'publish', 'revoke'].includes(body.action)) fail('Invalid review action.');
      const reason = text(body.reason, 2000);
      let proof;
      if (['approve', 'publish'].includes(body.action)) {
        eligible(current.user_id);
        proof = await verify(current.pr_number);
        if (!proof.merged || proof.head_sha !== current.head_sha) fail('The submitted commit must be merged with passing CI. Changed commits need a new submission.', 409);
      }
      return transaction(() => {
        const fresh = row(id), at = new Date(now()).toISOString();
        const transitions = { approve: ['submitted', 'approved'], reject: ['submitted', 'rejected'], publish: ['approved', 'published'], revoke: ['published', 'revoked'] };
        const [before, after] = transitions[body.action];
        if (fresh.status !== before) fail(`This action requires status ${before}.`, 409);
        if (proof) eligible(fresh.user_id);
        if (body.action === 'approve' && body.authorConfirmed !== true) fail('Confirm that the PR author owns this contributor account.');
        const productId = `contrib-${fresh.plugin_id}`;
        if (body.action === 'publish') {
          const plugin = registrations.find((p) => p.id === fresh.plugin_id && p.prNumber === fresh.pr_number);
          if (!plugin) fail('Deploy the merged plugin registration before activating it.', 409);
          const previous = db.prepare("SELECT user_id FROM contributor_submissions WHERE plugin_id=? AND status='published'").get(fresh.plugin_id);
          if (previous && previous.user_id !== fresh.user_id) fail('Plugin already belongs to another contributor.', 409);
          db.prepare("UPDATE contributor_submissions SET status='superseded',updated_at=? WHERE plugin_id=? AND status='published'").run(at, fresh.plugin_id);
          db.prepare(`INSERT INTO marketplace_products(id,slug,name,summary,description,category,delivery,status,pricing,price_cents,currency,features_json,featured,sort_order,created_at,updated_at)
            VALUES (?,?,?,?,?,'extensions','open_source_extension','available','quote',NULL,'USD','[]',0,100,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,summary=excluded.summary,description=excluded.description,status='available',updated_at=excluded.updated_at`)
            .run(productId, productId, plugin.name, plugin.summary, `Version ${plugin.version}. Free in Play Money. Reviewed source: https://github.com/${CONTRIBUTOR_REPO}/pull/${fresh.pr_number}. Paid organizer use requires a separately confirmed offer.`, at, at);
        }
        if (body.action === 'revoke') db.prepare("UPDATE marketplace_products SET status='archived',updated_at=? WHERE id=?").run(at, productId);
        db.prepare('UPDATE contributor_submissions SET status=?,reason=?,reviewed_by=?,proof_json=?,updated_at=? WHERE id=?')
          .run(after, reason, actor, proof ? JSON.stringify(proof) : fresh.proof_json, at, id);
        audit(actor, `contributor_${body.action}`, { id, head_sha: fresh.head_sha, user_id: fresh.user_id });
        return view(row(id));
      });
    },
  };
}

export function createContributorRoutes({ submissions, json, requireUser, requireAdmin, readBody }) {
  return async (req, res, url) => {
    const p = url.pathname, root = '/api/marketplace/contributor', admin = '/api/admin/marketplace/contributor';
    if (p !== root && !p.startsWith(root + '/') && p !== admin && !p.startsWith(admin + '/')) return false;
    try {
      if (p === root + '/plugins' && req.method === 'GET') { json(res, 200, { plugins: submissions.plugins() }); return true; }
      const isAdmin = p === admin || p.startsWith(admin + '/');
      const user = isAdmin ? requireAdmin(req, res) : requireUser(req, res); if (!user) return true;
      if (/^guest_[0-9a-f]{8}-[0-9a-f]{3}$/.test(user.login)) fail('Use a registered account for the Contributor workspace.', 403);
      if ((p === root || p === admin) && req.method === 'GET') { json(res, 200, { submissions: submissions.list(isAdmin ? null : user.id) }); return true; }
      if (req.method !== 'POST') fail('Method not allowed.', 405);
      const body = await readBody(req);
      const allowed = isAdmin ? ['action', 'reason', 'authorConfirmed'] : ['pluginId', 'prUrl', 'notes'];
      if (!body || typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > 8000 || Object.keys(body).some((key) => !allowed.includes(key))) fail('Invalid submission fields.');
      if (p === root) json(res, 201, { submission: await submissions.submit(user.id, body) });
      else if (isAdmin && /^[a-f0-9-]{36}$/.test(p.slice(admin.length + 1))) json(res, 200, { submission: await submissions.review(p.slice(admin.length + 1), body, user.login) });
      else fail('Route not found.', 404);
      return true;
    } catch (error) { if (!error.status) throw error; json(res, error.status, { error: error.message }); return true; }
  };
}
