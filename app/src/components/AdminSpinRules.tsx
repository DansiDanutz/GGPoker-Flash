import React, { useEffect, useRef, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import './spin/spin.css';
import { AdminSpinSixRules } from './AdminSpinSixRules';

const emptyForm = { startingChips: '', timeBankCards: '', actionSeconds: '', secondsPerCard: '', maxCardsPerAction: '', premium: '', payout: '' };

function AdminSpinThreeRules({ stake, setStake, mode, setMode }: any) {
  const { toast } = useApp();
  const [rules, setRules] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [insuranceEnabled, setInsuranceEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadGeneration = useRef(0);
  const saveOperation = useRef<{ key: string; operationId: string } | null>(null);

  const load = async () => {
    const generation = ++loadGeneration.current;
    setError('');
    try {
      const result = await api.admin.spinRules(stake);
      if (generation !== loadGeneration.current || result.state.stake !== stake) return;
      const state = result.state;
      setRules(state);
      const first = state.config.rows[0];
      setForm({
        startingChips: first.startingChips ?? '',
        timeBankCards: first.timeBankCards ?? '',
        actionSeconds: first.actionSeconds ?? '',
        secondsPerCard: first.secondsPerCard ?? '',
        maxCardsPerAction: first.maxCardsPerAction ?? '',
        premium: state.insurance?.premium ?? '',
        payout: state.insurance?.payout ?? '',
      });
      setInsuranceEnabled(!!state.insurance);
    } catch (reason: any) {
      if (generation !== loadGeneration.current) return;
      setError(reason.message || 'Could not load Spin rules');
    }
  };

  useEffect(() => {
    loadGeneration.current++;
    setRules(null);
    load();
    return () => { loadGeneration.current++; };
  }, [stake]);

  const update = (key: string, value: string) => setForm((current: any) => ({ ...current, [key]: value }));
  const numberField = (key: string) => Number(form[key]);
  const input = (key: string, label: string, minimum: number, maximum: number) => (
    <div>
      <label className="admin-label" htmlFor={`spin-${key}`}>{label}</label>
      <input id={`spin-${key}`} className="admin-input" style={{ width: '100%' }} type="number" required min={minimum} max={maximum} step={1} value={form[key]} onChange={(event) => update(key, event.target.value)} />
    </div>
  );

  const save = async () => {
    if (!rules || busy) return;
    const values = Object.fromEntries(['startingChips', 'timeBankCards', 'actionSeconds', 'secondsPerCard', 'maxCardsPerAction'].map((key) => [key, numberField(key)]));
    if (values.startingChips < 300 || values.startingChips > 1000 || values.timeBankCards < 1 || values.timeBankCards > 4 || values.actionSeconds < 1 || values.actionSeconds > 120 || values.secondsPerCard < 1 || values.secondsPerCard > 60 || values.maxCardsPerAction < 1 || values.maxCardsPerAction > values.timeBankCards || Object.values(values).some((value: any) => !Number.isInteger(value))) {
      setError('Enter complete timing values within the displayed limits; maximum cards per action cannot exceed starting time cards.');
      return;
    }
    if (insuranceEnabled && (!Number.isInteger(numberField('premium')) || !Number.isInteger(numberField('payout')) || numberField('premium') < 1 || numberField('payout') < 1 || numberField('premium') > 1000000000 || numberField('payout') > 1000000000)) {
      setError('Insurance premium and payout must be positive whole credits within the displayed limits.');
      return;
    }
    setBusy(true);
    setError('');
    const timing = Object.fromEntries(['startingChips', 'timeBankCards', 'actionSeconds', 'secondsPerCard', 'maxCardsPerAction'].map((key) => [key, numberField(key)]));
    const operationKey = `3max:${stake}:${rules.ruleRevision}:${JSON.stringify(timing)}:${insuranceEnabled ? `${numberField('premium')}:${numberField('payout')}` : 'off'}`;
    if (saveOperation.current?.key !== operationKey) saveOperation.current = { key: operationKey, operationId: crypto.randomUUID() };
    try {
      const result = await api.admin.saveSpinRules({
        mode: '3max', stake, expectedRevision: rules.ruleRevision, operationId: saveOperation.current.operationId,
        config: { rows: rules.config.rows.map((row: any) => ({ ...row, ...timing })) },
        insurance: insuranceEnabled ? { premium: numberField('premium'), payout: numberField('payout') } : null,
      });
      setRules(result.state);
      saveOperation.current = null;
      toast({ kind: 'success', title: 'Spin rules saved', body: `Revision ${result.state.ruleRevision} is active for new registrations.` });
    } catch (reason: any) {
      setError(reason.message || 'Spin rules were not saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-card" aria-labelledby="spin-rules-title">
      <div className="between">
        <div>
          <h3 id="spin-rules-title" style={{ margin: 0 }}>Spin & Gold registration rules</h3>
          <p className="muted small">One timing profile is applied to every committed multiplier row. Native prize frequencies and payout shares stay unchanged.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label className="admin-label">Format
          <select className="admin-input" value={mode} disabled={busy} onChange={(event) => setMode(event.target.value)}><option value="3max">3-Max</option><option value="6max">6-Max</option></select>
        </label>
        <label className="admin-label">Stake
          <select className="admin-input" value={stake} disabled={busy} onChange={(event) => setStake(Number(event.target.value))}>
            <option value={5000}>{money(5000)}</option>
            <option value={10000}>{money(10000)}</option>
          </select>
        </label>
        </div>
      </div>
      {error && <div className="spin-command-error" role="alert"><span>{error}</span><button className="btn btn-ghost btn-sm" onClick={load}>Reload rules</button></div>}
      {!rules && !error && <p className="muted" role="status">Loading Spin rules…</p>}
      {rules && <>
        <p className="muted small">Revision {rules.ruleRevision} · {rules.complete ? 'Complete; registration is open when funded.' : 'Incomplete; registration is closed.'}</p>
        <div className="admin-form">
          {input('startingChips', 'Starting chips (300–1,000)', 300, 1000)}
          {input('timeBankCards', 'Time-bank cards (1–4)', 1, 4)}
          {input('actionSeconds', 'Seconds per action (1–120)', 1, 120)}
          {input('secondsPerCard', 'Seconds per time-bank card (1–60)', 1, 60)}
          {input('maxCardsPerAction', 'Maximum cards per action', 1, 4)}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 12 }}>
          <input type="checkbox" checked={insuranceEnabled} onChange={(event) => setInsuranceEnabled(event.target.checked)} />
          Offer x2 insurance at registration
        </label>
        {insuranceEnabled && <div className="admin-form">
          {input('premium', 'Insurance premium (whole credits)', 1, 1000000000)}
          {input('payout', 'Insurance payout on x2 (whole credits)', 1, 1000000000)}
        </div>}
        <button className="btn btn-red" style={{ marginTop: 14 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save Spin rules'}</button>
      </>}
    </section>
  );
}

export function AdminSpinRules() {
  const [stake, setStake] = useState(5000);
  const [mode, setMode] = useState<'3max' | '6max'>('3max');
  return mode === '6max'
    ? <AdminSpinSixRules stake={stake} setStake={setStake} mode={mode} setMode={setMode} />
    : <AdminSpinThreeRules stake={stake} setStake={setStake} mode={mode} setMode={setMode} />;
}
