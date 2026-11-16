import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { autoFoldMatrix, autoFoldRateSelection, autoFoldSelectedRate, editAutoFoldSelection } from '../../game/autoFoldData';

export function AutoFoldEditor({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<any>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    api.autoFoldPreferences().then((result) => {
      setConfig({ active: result.preferences.active, button: result.preferences.button, blinds: result.preferences.blinds, rate: result.preferences.rate, selected: result.preferences.selected });
      setRevision(result.preferences.revision);
      closeRef.current?.focus();
    }).catch((reason: any) => setError(reason.message || 'Could not load Auto Fold preferences'));
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [onClose]);

  const toggle = (index: number) => setConfig((current: any) => ({ ...current, selected: editAutoFoldSelection(current.selected, index, !current.selected.includes(index)) }));
  const applyRate = () => setConfig((current: any) => ({ ...current, selected: autoFoldRateSelection(current.rate) }));
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.saveAutoFoldPreferences({ expectedRevision: revision, operationId: crypto.randomUUID(), config });
      setRevision(result.revision);
      onClose();
    } catch (reason: any) { setError(reason.message || 'Could not save preferences'); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop auto-fold-backdrop" role="presentation" onClick={onClose}>
      <section className="auto-fold-editor" role="dialog" aria-modal="true" aria-labelledby="auto-fold-title" onClick={(event) => event.stopPropagation()}>
        <div className="auto-fold-heading"><div><small>RUSH & CASH HOLD’EM</small><h2 id="auto-fold-title">Auto Fold</h2></div><button ref={closeRef} className="btn btn-ghost" onClick={onClose}>Close</button></div>
        <p className="muted small">Choose hands to fold automatically. Keep at least one class selected. Button and blind exclusions are applied before the hand class.</p>
        {error && <p role="alert">{error}</p>}
        {!config ? <p role="status">Loading hand classes…</p> : <>
          <div className="auto-fold-options">
            <label><input type="checkbox" checked={config.active} onChange={(event) => setConfig({ ...config, active: event.target.checked })} />Enable Auto Fold</label>
            <label><input type="checkbox" checked={config.button} onChange={(event) => setConfig({ ...config, button: event.target.checked })} />Allow on Button</label>
            <label><input type="checkbox" checked={config.blinds} onChange={(event) => setConfig({ ...config, blinds: event.target.checked })} />Allow on SB / BB</label>
          </div>
          <div className="auto-fold-rate">
            <label htmlFor="auto-fold-rate">Fold classes rated {config.rate} or below</label>
            <input id="auto-fold-rate" type="range" min="1" max="95" step="1" value={config.rate} onChange={(event) => setConfig({ ...config, rate: Number(event.target.value) })} />
            <button className="btn btn-ghost" onClick={applyRate}>Select by rate</button>
            <span>{config.selected.length} classes · {autoFoldSelectedRate(config.selected).toFixed(1)}% weight</span>
          </div>
          <div className="auto-fold-grid-scroll" tabIndex={0} role="region" aria-label="Hand class matrix, scroll horizontally">
            <div className="auto-fold-grid">{autoFoldMatrix.map((item) => <button key={item.index} className={config.selected.includes(item.index) ? 'auto-fold-cell auto-fold-cell-selected' : 'auto-fold-cell'} aria-pressed={config.selected.includes(item.index)} aria-label={`${item.key}, rate ${item.gageRate}`} onClick={() => toggle(item.index)}>{item.key}</button>)}</div>
          </div>
          <div className="auto-fold-actions"><button className="btn btn-ghost" onClick={() => setInfo(!info)}>{info ? 'Hide info' : 'Info'}</button><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-red" disabled={busy || !config.selected.length} onClick={save}>{busy ? 'Saving…' : 'Apply'}</button></div>
          {info && <div className="auto-fold-info"><strong>How Auto Fold works</strong><p>After one second, eligible selected hands fold automatically. Manual actions, a new hand, a changed preference, or a directed Cash Drop cancel that decision.</p></div>}
        </>}
      </section>
    </div>
  );
}
