import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, money, SpinQueueState } from '../../lib/api';
import { useApp } from '../../lib/store';
import './spin.css';

export function SpinRegistration({ stake }: { stake: number }) {
  const { user, navigate, toast, refreshUser } = useApp();
  const [queue, setQueue] = useState<SpinQueueState | null>(null);
  const [mode, setMode] = useState<'3max' | '6max'>('3max');
  const [count, setCount] = useState(1);
  const [insurance, setInsurance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadGeneration = useRef(0);
  const operationBatch = useRef<{ key: string; ids: string[]; expectedRevisions: (number | undefined)[]; ruleRevisions: (number | undefined)[]; insuranceChoices: (boolean | undefined)[] } | null>(null);
  const cancelOperations = useRef(new Map<string, { operationId: string; expectedRevision: number }>());

  const load = useCallback(async (quiet = false) => {
    if (!user) return;
    const generation = ++loadGeneration.current;
    try {
      const result = await api.spinQueue(stake, mode);
      if (generation !== loadGeneration.current || result.state.mode !== mode || result.state.stake !== stake) return;
      setQueue(result.state);
      if (!quiet) setError('');
    } catch (reason: any) {
      if (generation !== loadGeneration.current) return;
      if (!quiet) setError(reason.message || 'Could not load Spin registration');
    }
  }, [stake, mode, user]);

  useEffect(() => {
    loadGeneration.current++;
    operationBatch.current = null;
    cancelOperations.current.clear();
    setQueue(null);
    setInsurance(false);
    load();
    const timer = window.setInterval(() => load(true), 2000);
    return () => { loadGeneration.current++; window.clearInterval(timer); };
  }, [load]);

  const register = async () => {
    if (!user) { navigate('/login'); return; }
    if (!queue || busy) return;
    setBusy(true);
    setError('');
    let revision = queue.revision;
    let currentQueue = queue;
    const batchKey = `${mode}:${stake}:${count}:${insurance}`;
    if (operationBatch.current?.key !== batchKey) operationBatch.current = { key: batchKey, ids: Array.from({ length: count }, () => crypto.randomUUID()), expectedRevisions: [], ruleRevisions: [], insuranceChoices: [] };
    let completed = 0;
    try {
      for (let index = 0; index < count; index++) {
        let retried = false;
        for (;;) {
          try {
            if (operationBatch.current!.expectedRevisions[index] === undefined) operationBatch.current!.expectedRevisions[index] = revision;
            if (operationBatch.current!.ruleRevisions[index] === undefined) operationBatch.current!.ruleRevisions[index] = currentQueue.ruleRevision;
            if (operationBatch.current!.insuranceChoices[index] === undefined) operationBatch.current!.insuranceChoices[index] = insurance && !!currentQueue.insurance;
            const result = await api.spinRegister({
              stake,
              mode,
              expectedRevision: operationBatch.current!.expectedRevisions[index]!,
              ruleRevision: operationBatch.current!.ruleRevisions[index]!,
              operationId: operationBatch.current!.ids[index],
              insurance: operationBatch.current!.insuranceChoices[index]!,
            });
            revision = result.revision;
            completed = index + 1;
            if (result.state.eventId) {
              await refreshUser();
              navigate(`/table/spin:${result.state.eventId}`);
              return;
            }
            break;
          } catch (reason: any) {
            if (reason.status !== 409 || retried) throw reason;
            const latest = await api.spinQueue(stake, mode);
            currentQueue = latest.state;
            revision = currentQueue.revision;
            operationBatch.current!.ruleRevisions[index] = currentQueue.ruleRevision;
            operationBatch.current!.insuranceChoices[index] = insurance && !!currentQueue.insurance;
            operationBatch.current!.expectedRevisions[index] = undefined;
            setQueue(currentQueue);
            retried = true;
          }
        }
      }
      await refreshUser();
      await load();
      operationBatch.current = null;
      toast({ kind: 'success', title: 'Spin registration confirmed', body: `${count} ${count === 1 ? 'entry is' : 'entries are'} waiting for a full table.` });
    } catch (reason: any) {
      setError(completed
        ? `${completed}/${count} registrations confirmed. Retry to reconcile the remainder with the same operation IDs; no duplicate entries will be created.`
        : `${reason.message || 'Registration was not completed'} Retry to reconcile with the same operation ID.`);
      await load(true);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (registrationId: string, revision: number) => {
    if (busy) return;
    operationBatch.current = null;
    if (!cancelOperations.current.has(registrationId)) cancelOperations.current.set(registrationId, { operationId: crypto.randomUUID(), expectedRevision: revision });
    const operation = cancelOperations.current.get(registrationId)!;
    setBusy(true);
    setError('');
    try {
      await api.spinCancel(registrationId, operation);
      cancelOperations.current.delete(registrationId);
      await refreshUser();
      await load();
      toast({ kind: 'success', title: 'Registration cancelled', body: 'The entry and any premium were refunded.' });
    } catch (reason: any) {
      setError(reason.message || 'Cancellation was not completed');
    } finally {
      setBusy(false);
    }
  };

  const active = queue?.registrations.length || 0;
  const maximum = queue ? Math.max(1, queue.maxActive - active) : 1;
  useEffect(() => { setCount((current) => Math.min(current, maximum)); }, [maximum]);

  const premium = queue?.insurance?.premium || 0;
  const total = queue ? count * (stake + (insurance ? premium : 0)) : stake;

  return (
    <section className="spin-registration" id="spin-registration" aria-labelledby="spin-registration-title">
      <div className="spin-registration-heading">
        <div><small>{mode === '6max' ? 'SIX-MAX LOCAL PRACTICE' : 'THREE-MAX SIT & GO'}</small><h2 id="spin-registration-title">Spin & Gold · {money(stake)}</h2></div>
        {queue && <span className="spin-queue-count">{active}/{queue.maxActive} active</span>}
      </div>
      <div className="spin-mode-choice" role="group" aria-label="Spin table size">
        <button type="button" aria-pressed={mode === '3max'} disabled={busy} onClick={() => setMode('3max')}>3-Max</button>
        <button type="button" aria-pressed={mode === '6max'} disabled={busy} onClick={() => setMode('6max')}>6-Max</button>
      </div>
      {!user && <p className="spin-queue-empty">Log in to register. Your entry is charged only when the server accepts it.</p>}
      {user && !queue && !error && <p className="spin-queue-empty" role="status">Loading registration…</p>}
      {error && <div className="spin-command-error" role="alert"><span>{error}</span><button type="button" onClick={() => load()}>Retry</button></div>}
      {user && queue && <>
        {!queue.complete && <p className="spin-command-error" role="status">Registration is closed until the owner saves complete Spin timing rules.</p>}
        <div className="spin-registration-options">
          <label>Matches
            <select value={count} onChange={(event) => setCount(Number(event.target.value))} disabled={busy || !queue.complete}>
              {Array.from({ length: maximum }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={`spin-insurance-choice${!queue.insurance ? ' unavailable' : ''}`}>
            <input type="checkbox" checked={insurance} disabled={!queue.complete || !queue.insurance || busy} onChange={(event) => setInsurance(event.target.checked)} />
            <span>{queue.insurance ? `x${mode === '6max' ? 4 : 2} insurance · ${money(queue.insurance.premium)} premium · ${money(queue.insurance.payout)} payout` : 'Insurance unavailable until configured'}</span>
          </label>
        </div>
        <button className="spin-register-button" type="button" disabled={busy || !queue.complete || active >= queue.maxActive} onClick={register}>
          {!queue.complete ? 'Configuration required' : busy ? 'Processing…' : `Register ${count} ${count === 1 ? 'match' : 'matches'} · ${money(total)}`}
        </button>
        <div className="spin-active-list" aria-live="polite">
          {queue.registrations.map((registration) => (
            <div className="spin-active-row" key={registration.registrationId}>
              <span><b>{registration.status === 'matched' ? 'Match ready' : 'Waiting for a full table'}</b><small>{registration.insurance ? 'Insurance selected' : 'No insurance'}</small></span>
              {registration.status === 'matched' && registration.eventId
                ? <button type="button" onClick={() => navigate(`/table/spin:${registration.eventId}`)}>Open match</button>
                : <button type="button" disabled={busy} onClick={() => cancel(registration.registrationId, registration.revision)}>Cancel</button>}
            </div>
          ))}
          {!queue.registrations.length && <p className="spin-queue-empty">No active registrations at this stake.</p>}
        </div>
      </>}
    </section>
  );
}
