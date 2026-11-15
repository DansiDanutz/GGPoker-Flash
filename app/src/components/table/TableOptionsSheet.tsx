import React from 'react';
import { autoPostBlinds, RUN_SETTINGS, runSetting, runSettingMessage, straddleSetting } from '../../game/tableOptions';
import { betLabel, PRESET_CHOICES, withPreset, type BetPrefs, type BetValue, type PresetRow } from '../../lib/tablePrefs';

type MyOptions = { autoStraddle?: boolean; waitForBlinds?: boolean; runItAsk?: boolean; runPref?: number | null };
type OptionMessage = Record<string, unknown>;

type Props = {
  open: boolean;
  onClose: () => void;
  me: MyOptions | undefined;
  tableStraddle: boolean;
  /** Hides the Run it choice where it never applies. */
  runItOffered: boolean;
  onOption: (msg: OptionMessage) => void;
  betPrefs: BetPrefs;
  onBetPrefs: (next: BetPrefs) => void;
  confirmBets: boolean;
  onConfirmBets: (on: boolean) => void;
  /** Remembered Auto-post choice, used for the next join while not seated. */
  joinWaitForBlinds: boolean;
  onJoinWaitForBlinds: (wait: boolean) => void;
};

const PRESET_ROWS: readonly { row: PresetRow; label: string; opening: boolean }[] = [
  { row: 'opening', label: 'Preflop', opening: true },
  { row: 'normal', label: 'After the flop', opening: false },
];

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`topt-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span className="topt-knob" />
      <span className="topt-switch-text">{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}

/** Phone-first bottom sheet for the options players change mid-session (reference: mobile mockup). */
export function TableOptionsSheet({ open, onClose, me, tableStraddle, runItOffered, onOption, betPrefs, onBetPrefs, confirmBets, onConfirmBets, joinWaitForBlinds, onJoinWaitForBlinds }: Props) {
  if (!open) return null;
  const seated = !!me;
  const straddle = straddleSetting({ straddle: tableStraddle }, me);
  const run = runSetting(me);
  const editPreset = (row: PresetRow, index: number, raw: string) => {
    const value: BetValue = raw === 'pot' || raw === 'max' ? raw : Number(raw);
    const next = withPreset(betPrefs, row, index, value);
    if (next !== betPrefs) onBetPrefs(next);
  };

  return (
    <div className="topt-scrim" onClick={onClose}>
      <div className="topt-sheet" role="dialog" aria-modal="true" aria-label="Table options" onClick={(e) => e.stopPropagation()}>
        <div className="topt-grab" aria-hidden="true" />
        <header className="topt-head">
          <b>Table options</b>
          <button type="button" className="topt-close" aria-label="Close table options" onClick={onClose}>✕</button>
        </header>
        {!seated && <p className="topt-note">Take a seat to change your table options. Auto-post blinds applies when you sit.</p>}

        <div className="topt-row">
          <span><b>Straddle</b><small>{tableStraddle ? 'Post a straddle whenever you are under the gun' : 'Straddles are off at this table'}</small></span>
          <Switch label="Straddle" on={straddle.on} disabled={!straddle.allowed} onChange={(v) => onOption({ autoStraddle: v })} />
        </div>
        <div className="topt-row">
          <span><b>Auto-post blinds</b><small>Off waits for the big blind to reach you</small></span>
          <Switch
            label="Auto-post blinds"
            on={seated ? autoPostBlinds(me) : !joinWaitForBlinds}
            onChange={(v) => { onJoinWaitForBlinds(!v); if (seated) onOption({ waitForBlinds: !v }); }}
          />
        </div>

        <div className="topt-row">
          <span><b>Confirm bets</b><small>Ask before every bet and raise</small></span>
          <Switch label="Confirm bets" on={confirmBets} onChange={onConfirmBets} />
        </div>

        {runItOffered && <div className="topt-block">
          <span className="topt-label"><b>Run it</b><small>When you are all-in with cards to come</small></span>
          <div className="topt-seg" role="radiogroup" aria-label="Run it">
            {RUN_SETTINGS.map((r) => (
              <button key={String(r.value)} type="button" role="radio" aria-checked={run === r.value} disabled={!seated} className={run === r.value ? 'on' : ''} onClick={() => onOption(runSettingMessage(r.value))}>{r.label}</button>
            ))}
          </div>
        </div>}

        <div className="topt-block">
          <span className="topt-label"><b>Bet presets</b><small>Tap a chip to change it</small></span>
          {PRESET_ROWS.map(({ row, label, opening }) => (
            <div key={row} className="topt-presets">
              <small>{label}</small>
              <div className="topt-chips">
                {betPrefs[row].map((v, i) => (
                  <label key={i} className="topt-chip">
                    <span>{betLabel(v, opening)}</span>
                    <i aria-hidden="true">✎</i>
                    <select aria-label={`${label} preset ${i + 1}`} value={String(v)} onChange={(e) => editPreset(row, i, e.target.value)}>
                      {PRESET_CHOICES[row].map((c) => <option key={String(c)} value={String(c)}>{betLabel(c, opening)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
