import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Props {
  tableId: string;
  handId: string;
  phase: 'propose' | 'decide' | 'complete';
  revision: number;
  proposer: number;
  decider: number;
  proposal: 1 | 2 | 3 | null;
  mySeat: number | null;
  onState: (state: any) => void;
}

export function RimtPanel({ tableId, handId, phase, revision: roomRevision, proposer, decider, proposal, mySeat, onState }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [handId]);
  if (phase === 'complete' || (mySeat !== proposer && mySeat !== decider)) return null;

  const command = async (choice: number | 'accept' | 'decline') => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.rimt(tableId, { handId, expectedRevision: roomRevision, operationId: crypto.randomUUID(), choice });
      onState(response.state);
    } catch (cause: any) {
      setError(cause?.message || 'RIMT command failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rimt-panel" role="group" aria-label="Run It Multiple Times">
      {mySeat === proposer && phase === 'propose' && (
        <>
          <span>Choose run count</span>
          {[1, 2, 3].map((runs) => <button key={runs} className="btn btn-green" disabled={busy} onClick={() => { void command(runs as 1 | 2 | 3); }}>Run it {runs === 1 ? 'once' : runs === 2 ? 'twice' : 'three times'}</button>)}
        </>
      )}
      {mySeat === decider && phase === 'decide' && (
        <>
          <span>Accept {proposal === 2 ? 'two' : 'three'} runs?</span>
          <button className="btn btn-green" disabled={busy} onClick={() => { void command('accept'); }}>Accept</button>
          <button className="btn btn-dark" disabled={busy} onClick={() => { void command('decline'); }}>Decline</button>
        </>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
