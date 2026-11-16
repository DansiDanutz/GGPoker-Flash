import React, { useEffect, useRef, useState } from 'react';
import { api, money } from '../lib/api';
import { useApp } from '../lib/store';
import './spin/spin.css';

export function AdminSpinSixRules({ stake, setStake, mode, setMode }: any) {
  const { toast } = useApp();
  const [rules, setRules] = useState<any>(null);
  const [insuranceEnabled, setInsuranceEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadGeneration = useRef(0);
  const saveOperation = useRef<{ key: string; operationId: string } | null>(null);

  const load = async () => {
    const generation = ++loadGeneration.current;
    setError('');
    try {
      const result = await api.admin.spinRules(stake, '6max');
      if (generation !== loadGeneration.current || result.state.stake !== stake) return;
      setRules(result.state);
      setInsuranceEnabled(!!result.state.insurance);
    } catch (reason: any) {
      if (generation !== loadGeneration.current) return;
      setError(reason.message || 'Could not load 6-Max rules');
    }
  };

  useEffect(() => {
    loadGeneration.current++;
    setRules(null);
    load();
    return () => { loadGeneration.current++; };
  }, [stake]);

  const updateConfig = (key: string, value: any) => setRules((current: any) => ({ ...current, config: { ...current.config, [key]: value } }));
  const updateClock = (key: string, value: string) => setRules((current: any) => ({ ...current, config: { ...current.config, clock: { ...current.config.clock, [key]: Number(value) } } }));
  const updateOutcome = (index: number, key: string, value: any) => setRules((current: any) => ({
    ...current,
    config: { ...current.config, outcomes: current.config.outcomes.map((row: any, rowIndex: number) => rowIndex === index ? { ...row, [key]: value } : row) },
  }));
  const input = (id: string, label: string, value: any, onChange: (value: string) => void, minimum = 1, maximum = 100000000) => (
    <div>
      <label className="admin-label" htmlFor={id}>{label}</label>
      <input id={id} className="admin-input" style={{ width: '100%' }} type="number" required min={minimum} max={maximum} step={1} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );

  const save = async () => {
    if (!rules || busy) return;
    if (frequency !== 100000000) { setError('Probability tickets must total exactly 100,000,000 before saving.'); return; }
    const validBlinds = rules.config.smallBlinds.every((value: number, index: number, values: number[]) => Number.isSafeInteger(value) && value > 0 && (!index || value > values[index - 1]));
    const validOutcomes = rules.config.outcomes.every((row: any) => Number.isSafeInteger(row.multiplier) && row.multiplier > 0 && Number.isSafeInteger(row.frequency) && row.frequency > 0 && Number.isInteger(row.startingChips) && row.startingChips >= 300 && row.startingChips <= 1000 && Number.isInteger(row.timeBankCards) && row.timeBankCards >= 1 && row.timeBankCards <= 4 && Number.isSafeInteger(row.interval) && row.interval >= 1 && row.interval <= 60 && row.prizeShares.length > 0 && row.prizeShares.every((share: number) => Number.isInteger(share) && share > 0 && share <= 100) && row.prizeShares.reduce((sum: number, share: number) => sum + share, 0) === 100);
    if (!validBlinds || !validOutcomes) { setError('Complete every blind and outcome with positive integers inside the displayed limits; each prize-share row must total 100%.'); return; }
    const clock = rules.config.clock;
    if (!Number.isSafeInteger(clock.actionSeconds) || clock.actionSeconds < 1 || clock.actionSeconds > 120 || !Number.isSafeInteger(clock.freeTimeChipSecondsPerUnit) || clock.freeTimeChipSecondsPerUnit < 1 || clock.freeTimeChipSecondsPerUnit > 60 || !Number.isSafeInteger(clock.maxTimeChipsPerAction) || clock.maxTimeChipsPerAction < 1 || clock.maxTimeChipsPerAction > 4) { setError('Complete all three action-clock fields within their displayed limits.'); return; }
    if (insuranceEnabled && (!Number.isInteger(rules.insurance?.premium) || !Number.isInteger(rules.insurance?.payout) || rules.insurance.premium < 1 || rules.insurance.payout < 1)) { setError('Insurance premium and payout must be positive whole credits.'); return; }
    setBusy(true);
    setError('');
    const operationKey = `6max:${stake}:${rules.ruleRevision}:${JSON.stringify(rules.config)}:${insuranceEnabled ? JSON.stringify(rules.insurance) : 'off'}`;
    if (saveOperation.current?.key !== operationKey) saveOperation.current = { key: operationKey, operationId: crypto.randomUUID() };
    try {
      const result = await api.admin.saveSpinRules({
        mode: '6max', stake, expectedRevision: rules.ruleRevision, operationId: saveOperation.current.operationId,
        config: rules.config,
        insurance: insuranceEnabled ? { premium: Number(rules.insurance?.premium || 0), payout: Number(rules.insurance?.payout || 0) } : null,
      });
      setRules(result.state);
      saveOperation.current = null;
      setInsuranceEnabled(!!result.state.insurance);
      toast({ kind: 'success', title: '6-Max rules saved', body: `Revision ${result.state.ruleRevision} is active for new six-player registrations.` });
    } catch (reason: any) {
      setError(reason.message || '6-Max rules were not saved');
    } finally {
      setBusy(false);
    }
  };

  const frequency = rules?.config.outcomes.reduce((sum: number, row: any) => sum + row.frequency, 0) || 0;
  return (
    <section className="admin-card" aria-labelledby="spin-six-rules-title">
      <div className="between">
        <div>
          <h3 id="spin-six-rules-title" style={{ margin: 0 }}>Spin & Gold 6-Max local-practice rules</h3>
          <p className="muted small">Independent explicit rules, not recovered operator odds. Registration opens only after a complete funded configuration is saved.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label className="admin-label">Format
            <select className="admin-input" value={mode} disabled={busy} onChange={(event) => setMode(event.target.value)}><option value="3max">3-Max</option><option value="6max">6-Max</option></select>
          </label>
          <label className="admin-label">Stake
            <select className="admin-input" value={stake} disabled={busy} onChange={(event) => setStake(Number(event.target.value))}><option value={5000}>{money(5000)}</option><option value={10000}>{money(10000)}</option></select>
          </label>
        </div>
      </div>
      {error && <div className="spin-command-error" role="alert"><span>{error}</span><button className="btn btn-ghost btn-sm" onClick={load}>Reload rules</button></div>}
      {!rules && !error && <p className="muted" role="status">Loading 6-Max rules…</p>}
      {rules && <>
        <p className="muted small" role="status">Revision {rules.ruleRevision} · {rules.complete ? 'Complete; registration is open when funded.' : 'Draft only; registration is closed until saved.'}</p>
        <h4>Blind ladder and action clock</h4>
        <div className="admin-form">
          <div>
            <label className="admin-label" htmlFor="spin-six-smallBlinds">Small blinds, comma separated</label>
            <input id="spin-six-smallBlinds" className="admin-input" style={{ width: '100%' }} required value={rules.config.smallBlinds.join(',')} onChange={(event) => updateConfig('smallBlinds', event.target.value.split(',').map((value) => Number(value.trim())))} />
          </div>
          {input('spin-six-actionSeconds', 'Seconds per action (1–120)', rules.config.clock.actionSeconds, (value) => updateClock('actionSeconds', value), 1, 120)}
          {input('spin-six-freeTime', 'Seconds per time card (1–60)', rules.config.clock.freeTimeChipSecondsPerUnit, (value) => updateClock('freeTimeChipSecondsPerUnit', value), 1, 60)}
          {input('spin-six-maxTime', 'Maximum cards per action (1–4)', rules.config.clock.maxTimeChipsPerAction, (value) => updateClock('maxTimeChipsPerAction', value), 1, 4)}
        </div>
        <div className="between" style={{ marginTop: 18 }}>
          <h4 style={{ margin: 0 }}>Prize outcomes</h4>
          <button className="btn btn-ghost btn-sm" type="button" disabled={rules.config.outcomes.length >= 32} onClick={() => updateConfig('outcomes', [...rules.config.outcomes, { multiplier: 4, frequency: 1, prizeShares: [100], startingChips: 500, timeBankCards: 3, noDealing: false, unit: 'minutes', interval: 1 }])}>Add outcome</button>
        </div>
        <p className="muted small" role="status">Probability tickets: {frequency.toLocaleString()} / 100,000,000. Each row needs positive prize shares totaling 100%.</p>
        {rules.config.outcomes.map((row: any, index: number) => (
          <fieldset key={index} style={{ minWidth: 0, marginTop: 12, padding: 12, border: '1px solid #414752', borderRadius: 8 }}>
            <legend>Outcome {index + 1}</legend>
            <div className="admin-form">
              {input(`spin-six-${index}-multiplier`, 'Multiplier', row.multiplier, (value) => updateOutcome(index, 'multiplier', Number(value)))}
              {input(`spin-six-${index}-frequency`, 'Probability tickets', row.frequency, (value) => updateOutcome(index, 'frequency', Number(value)))}
              <div>
                <label className="admin-label" htmlFor={`spin-six-${index}-shares`}>Prize shares %, comma separated</label>
                <input id={`spin-six-${index}-shares`} className="admin-input" style={{ width: '100%' }} required value={row.prizeShares.join(',')} onChange={(event) => updateOutcome(index, 'prizeShares', event.target.value.split(',').map((value) => Number(value.trim())))} />
              </div>
              {input(`spin-six-${index}-chips`, 'Starting chips (300–1,000)', row.startingChips, (value) => updateOutcome(index, 'startingChips', Number(value)), 300, 1000)}
              {input(`spin-six-${index}-cards`, 'Starting time cards (1–4)', row.timeBankCards, (value) => updateOutcome(index, 'timeBankCards', Number(value)), 1, 4)}
              <div>
                <label className="admin-label" htmlFor={`spin-six-${index}-unit`}>Blind-level unit</label>
                <select id={`spin-six-${index}-unit`} className="admin-input" style={{ width: '100%' }} value={row.unit} onChange={(event) => updateOutcome(index, 'unit', event.target.value)}><option value="minutes">Minutes</option><option value="hands">Completed hands</option></select>
              </div>
              {input(`spin-six-${index}-interval`, 'Blind-level interval (1–60)', row.interval, (value) => updateOutcome(index, 'interval', Number(value)), 1, 60)}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} type="button" disabled={rules.config.outcomes.length <= 1} onClick={() => updateConfig('outcomes', rules.config.outcomes.filter((_: any, rowIndex: number) => rowIndex !== index))}>Remove outcome</button>
          </fieldset>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 12 }}>
          <input type="checkbox" checked={insuranceEnabled} onChange={(event) => setInsuranceEnabled(event.target.checked)} />
          Offer x4 insurance at registration
        </label>
        {insuranceEnabled && <div className="admin-form">
          {input('spin-six-premium', 'Insurance premium (whole credits)', rules.insurance?.premium || 0, (value) => setRules((current: any) => ({ ...current, insurance: { ...current.insurance, premium: Number(value) } })))}
          {input('spin-six-payout', 'Insurance payout on x4 (whole credits)', rules.insurance?.payout || 0, (value) => setRules((current: any) => ({ ...current, insurance: { ...current.insurance, payout: Number(value) } })))}
        </div>}
        <button className="btn btn-red" style={{ marginTop: 14 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save 6-Max rules'}</button>
      </>}
    </section>
  );
}
