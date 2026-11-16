import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { sound } from '../../lib/sound';
import { spinPresentationStage, SpinPresentationStage } from '../../game/spinPresentation';
import { SpinWheel } from './SpinWheel';
import { SpinInsurancePanel } from './SpinInsurancePanel';
import { useModalIsolation } from '../../lib/useModalIsolation';

export type SpinPresentationState = {
  eventId: string;
  multiplier: number;
  prize: number;
  payouts: number[];
  seats: number;
  multipliers?: number[];
  presentation: {
    revision: number;
    barrierOpensAt: number;
    acknowledgements: string[];
    insured: boolean;
    insurancePayout?: number;
    insuranceMultiplier?: number;
  };
};

export function SpinPresentation({ spin }: { spin: SpinPresentationState }) {
  const [localAcknowledgements, setLocalAcknowledgements] = useState<string[]>([]);
  let [revision, setRevision] = useState(spin.presentation.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wheelReady, setWheelReady] = useState(false);
  const cues = useRef(new Set<string>());
  const operationIds = useRef(new Map<string, string>());
  const acknowledgements = [...new Set([...spin.presentation.acknowledgements, ...localAcknowledgements])];
  const stage = spinPresentationStage(acknowledgements, spin.presentation.insured);
  const dialog = useModalIsolation<HTMLDivElement>(stage !== 'complete');

  useEffect(() => {
    setLocalAcknowledgements([]);
    setRevision(spin.presentation.revision);
    setError('');
    setWheelReady(false);
    operationIds.current = new Map();
  }, [spin.eventId]);

  useEffect(() => { setRevision((current) => Math.max(current, spin.presentation.revision)); }, [spin.presentation.revision]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (stage !== 'wheel' || reduced) { setWheelReady(true); return; }
    const timer = window.setTimeout(() => setWheelReady(true), 2400);
    return () => window.clearTimeout(timer);
  }, [stage, spin.eventId]);

  useEffect(() => {
    if (stage === 'complete') return;
    const key = `${spin.eventId}:${stage}`;
    if (cues.current.has(key) || sessionStorage.getItem(`ggpoker.spinCue:${key}`)) return;
    cues.current.add(key);
    sessionStorage.setItem(`ggpoker.spinCue:${key}`, '1');
    if (stage === 'wheel') sound.play('wheel');
    if (stage === 'insurance' && spin.multiplier === 2) sound.play('cheer', { volume: .7 });
  }, [stage, spin.eventId, spin.multiplier]);

  const acknowledge = async (completed: Exclude<SpinPresentationStage, 'complete'>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    if (!operationIds.current.has(completed)) operationIds.current.set(completed, crypto.randomUUID());
    const operationId = operationIds.current.get(completed)!;
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const result = await api.spinPresented(spin.eventId, { expectedRevision: revision, operationId, stage: completed });
          setRevision(result.revision);
          setLocalAcknowledgements((current) => [...new Set([...current, completed])]);
          return;
        } catch (reason: any) {
          if (reason.status !== 409 || attempt >= 7) throw reason;
          const latest = await api.spinPresentation(spin.eventId);
          setRevision(latest.state.revision);
          revision = latest.state.revision;
          setLocalAcknowledgements((current) => [...new Set([...current, ...latest.state.acknowledgements])]);
          if (latest.state.acknowledgements.includes(completed)) return;
        }
      }
    } catch (reason: any) {
      setError(reason.message || 'The acknowledgement was lost. Retry this stage.');
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'complete') return null;
  return (
    <div ref={dialog} className="spin-presentation" role="dialog" aria-modal="true" aria-labelledby="spin-presentation-title">
      <h2 id="spin-presentation-title">{stage === 'wheel' ? 'SPIN & GOLD' : stage === 'insurance' ? 'INSURANCE' : 'YOUR MATCH IS READY'}</h2>
      {stage === 'wheel' && <SpinWheel multiplier={spin.multiplier} prize={spin.prize} payouts={spin.payouts} multipliers={spin.multipliers} />}
      {stage === 'insurance' && <SpinInsurancePanel multiplier={spin.multiplier} payout={spin.presentation.insurancePayout || 0} insuredMultiplier={spin.presentation.insuranceMultiplier || 2} />}
      {stage === 'ready' && <p>The prize and any insurance result are committed. Join the other {spin.seats - 1} players when you are ready.</p>}
      {error && <p className="spin-presentation-error" role="alert">{error}</p>}
      <div className="spin-presentation-actions">
        {stage === 'wheel' && <button type="button" disabled={busy || !wheelReady} onClick={() => acknowledge('wheel')}>{busy ? 'Confirming…' : error ? 'Retry wheel' : wheelReady ? 'Confirm result' : 'Spinning…'}</button>}
        {stage === 'insurance' && <button type="button" disabled={busy} onClick={() => acknowledge('insurance')}>{busy ? 'Confirming…' : error ? 'Retry insurance' : 'Continue'}</button>}
        {stage === 'ready' && <button type="button" disabled={busy} onClick={() => acknowledge('ready')}>{busy ? 'Joining…' : error ? 'Retry ready' : 'Ready to play'}</button>}
      </div>
    </div>
  );
}
