import { useState } from 'react';
import { PageShell } from '../components/PageShell';
import '../contributor.css';
import './rake-lab.css';

type Preview = { pot: number; rakePercent: number; rakeCap: number; flopSeen: boolean; rake: number; remaining: number; capReached: boolean };

export function RakeLab() {
  const [pot, setPot] = useState('6000'), [percent, setPercent] = useState('5'), [cap, setCap] = useState('300');
  const [flop, setFlop] = useState(true), [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Preview | null>(null), [error, setError] = useState('');
  const clear = () => { setResult(null); setError(''); };
  async function calculate() {
    setBusy(true); clear();
    try {
      const query = new URLSearchParams({ pot, percent, cap, flop: flop ? '1' : '0' });
      const response = await fetch(`/api/plugins/rake-lab?${query}`, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Preview unavailable. Try again.');
      setResult(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Preview unavailable. Try again.'); }
    finally { setBusy(false); }
  }
  return <PageShell activeTop="contributor"><main className="page contributor-workspace rake-lab">
    <p>FREE PLAY MONEY TOOL</p><h1>Rake Lab</h1>
    <p>Explore how percentage rake and a cap affect one cash-game pot. All values are whole virtual chips with no cash value.</p>
    <p>This calculator does not create games, change table settings or move Cash Chips or service credits.</p>
    <form onSubmit={event => { event.preventDefault(); void calculate(); }} onChange={clear}>
      <fieldset disabled={busy}><legend>Single-pot preview</legend>
        <label htmlFor="rake-lab-pot">Pot (virtual chips)<input id="rake-lab-pot" type="number" min="0" max="9000000000" step="1" required value={pot} onChange={event => setPot(event.target.value)} /></label>
        <label htmlFor="rake-lab-percent">Rake (%)<select id="rake-lab-percent" value={percent} onChange={event => setPercent(event.target.value)}>{[2, 3, 4, 5].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
        <label htmlFor="rake-lab-cap">Cap per hand (virtual chips)<input id="rake-lab-cap" type="number" min="1" max="9000000000" step="1" required value={cap} onChange={event => setCap(event.target.value)} /></label>
        <label className="contributor-check"><input type="checkbox" checked={flop} onChange={event => setFlop(event.target.checked)} />A flop was dealt</label>
        <button className="btn btn-red" type="submit">{busy ? 'Calculating…' : 'Calculate preview'}</button>
      </fieldset>
    </form>
    {error && <p role="alert">{error}</p>}
    <div role="status" aria-live="polite">{result && <article aria-label="Rake preview result">
      <h2>{result.capReached ? 'Cap reached' : result.flopSeen ? 'Below the cap' : 'No flop, no rake'}</h2>
      <dl><dt>Pot before rake</dt><dd>{result.pot.toLocaleString()} chips</dd><dt>Rake removed</dt><dd>{result.rake.toLocaleString()} chips</dd><dt>Left for players</dt><dd>{result.remaining.toLocaleString()} chips</dd></dl>
      <p>{result.rakePercent}% rake, capped at {result.rakeCap.toLocaleString()} chips. Fractional chips are rounded down. No rake is taken before the flop.</p>
    </article>}</div>
    <p>Learning example for a single cash-game pot only. It does not simulate side pots, tournament fees or Spin &amp; Go payouts.</p>
    <a href="#/contributor">Back to Contributor</a>
  </main></PageShell>;
}
