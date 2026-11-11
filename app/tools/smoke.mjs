#!/usr/bin/env node
// Read-only smoke test against a running DanGG.ro server.
const base = process.env.DANGGRO_URL || 'http://127.0.0.1:5198';
const checks = [];
async function check(name, fn) {
  try { const value = await fn(); checks.push({ name, ok: true, value }); }
  catch (e) { checks.push({ name, ok: false, error: e.message }); }
}
async function j(path, init) {
  const res = await fetch(base + path, init);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}
await check('lobby', async () => {
  const d = await j('/api/lobby');
  if (!Array.isArray(d.tables) || !d.tables.length) throw new Error('no tables');
  return `${d.tables.length} tables`;
});
const login = await j('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'DansiDanutz', password: 'ggpoker' }) });
const auth = { authorization: `Bearer ${login.token}` };
await check('cashier', async () => {
  const d = await j('/api/cashier', { headers: auth });
  if (!d.user || !Array.isArray(d.transactions)) throw new Error('bad cashier payload');
  return `${d.transactions.length} transactions`;
});
await check('elo-all', async () => {
  const d = await j('/api/elo', { headers: auth });
  if (!Array.isArray(d.leaders)) throw new Error('bad ELO payload');
  return `${d.leaders.length} rated`;
});
await check('elo-variants', async () => {
  const games = ['holdem', 'omaha', 'shortdeck', 'rush'];
  for (const game of games) {
    const d = await j(`/api/elo?game=${game}`, { headers: auth });
    if (d.game !== game) throw new Error(`wrong game ${game}`);
  }
  return games.join(', ');
});
await check('notifications', async () => {
  const d = await j('/api/notifications', { headers: auth });
  if (!Array.isArray(d.items)) throw new Error('bad notifications payload');
  return `${d.unread} unread`;
});
await check('tournaments', async () => {
  const d = await j('/api/tournaments');
  if (!Array.isArray(d.tournaments)) throw new Error('bad tournaments payload');
  return `${d.tournaments.length} events`;
});
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? ' — ' + c.value : ' — ' + c.error}`);
if (checks.some((c) => !c.ok)) process.exit(1);
console.log(`Smoke OK — ${base}`);
