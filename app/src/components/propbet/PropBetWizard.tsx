import { useState } from 'react';
import { money, type PropBetBoard, type PropBetDraft, type PropBetType } from '../../lib/api';
import { PROP_TYPES, PropBetBadge } from './PropBetBadge';

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const AMOUNTS = [100, 500, 1_000, 5_000, 10_000];

/** `datetime-local` value for a timestamp, in the viewer's own time zone. */
const toLocalInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

function Stepper({ value, min, max, step = 1, onChange, label, format = String }: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="pb-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <output aria-live="polite">{format(value)}</output>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  );
}

function Steps({ step, total }: { step: number; total: number }) {
  return (
    <ol className="pb-steps" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <li key={i} className={i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}>{i + 1 < step ? '✓' : i + 1}</li>
      ))}
    </ol>
  );
}

export function PropBetWizard({ board, onClose, onCreate }: {
  board: PropBetBoard; onClose: () => void; onCreate: (draft: PropBetDraft) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<PropBetType>('last_longer');
  const [tournamentId, setTournamentId] = useState(board.eligibleTournaments[0]?.id ?? '');
  const [amount, setAmount] = useState(500);
  const [players, setPlayers] = useState(4);
  const [bettors, setBettors] = useState(0);
  const [startAt, setStartAt] = useState(() => Math.ceil((Date.now() + HOUR) / HOUR) * HOUR);
  const [days, setDays] = useState(1);
  const [eloGoal, setEloGoal] = useState(300);
  const [bankGoal, setBankGoal] = useState(10_000);
  const [busy, setBusy] = useState(false);
  const rules = board.rules[type];
  const meta = PROP_TYPES.find((t) => t.key === type)!;
  const lastLonger = type === 'last_longer';
  const blocked = lastLonger && !board.eligibleTournaments.length;
  const total = 3;

  const submit = async () => {
    setBusy(true);
    try {
      await onCreate(lastLonger
        ? { type, tournamentId, amount, maxBettors: players }
        : { type, amount, maxBettors: bettors, goal: type === 'elo' ? eloGoal : bankGoal, startAt, endAt: startAt + days * DAY });
    } finally { setBusy(false); }
  };

  const elo = board.elo ?? 1000;
  return (
    <div className="modal-backdrop pb-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pb-wizard" role="dialog" aria-modal="true" aria-label="Create a prop bet">
        <button type="button" className="pb-x" aria-label="Close" onClick={onClose}>✕</button>
        <Steps step={step} total={total} />

        {step === 1 && (
          <section className="pb-step">
            <h3>Prop Bet Type</h3>
            <div className="pb-types" role="radiogroup" aria-label="Prop bet type">
              {PROP_TYPES.map((t) => (
                <button key={t.key} type="button" role="radio" aria-checked={type === t.key} className={type === t.key ? 'on' : ''} onClick={() => setType(t.key)}>
                  <PropBetBadge type={t.key} size={68} glow={type === t.key} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="pb-blurb"><b>{meta.label}</b><p>{meta.blurb}</p></div>
            {blocked && <p className="pb-warn">Register to a tournament with at least 3 minutes left to start to create a Last Longer prop bet.</p>}
            {type === 'bankroll' && <p className="pb-note">🔍 Your bankroll tracker will be shown publicly. Only settled game results count — cashier top-ups do not.</p>}
          </section>
        )}

        {step === 2 && lastLonger && (
          <section className="pb-step">
            <label className="pb-field">Tournament
              <select value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
                {board.eligibleTournaments.map((t) => <option key={t.id} value={t.id}>{t.name} · {new Date(t.startAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</option>)}
              </select>
            </label>
            <div className="pb-row"><span>Bet amount</span>
              <div className="pb-chips">{AMOUNTS.map((a) => <button key={a} type="button" className={amount === a ? 'on' : ''} onClick={() => setAmount(a)}>{money(a, true)}</button>)}</div>
            </div>
            <div className="pb-row"><span>Players who can join</span><Stepper label="players" value={players} min={rules.minBettors} max={rules.maxBettors} onChange={setPlayers} /></div>
            <p className="pb-note">Everyone stakes {money(amount)}. The player who busts last takes the pot of up to {money(amount * (players + 1))}.</p>
          </section>
        )}

        {step === 2 && !lastLonger && (
          <section className="pb-step">
            <label className="pb-field">Start Time
              <input type="datetime-local" value={toLocalInput(startAt)} min={toLocalInput(Date.now())} onChange={(e) => { const v = Date.parse(e.target.value); if (Number.isFinite(v)) setStartAt(v); }} />
            </label>
            <div className="pb-row"><span>Length</span><Stepper label="days" value={days} min={1} max={100} onChange={setDays} format={(v) => `${v} day${v === 1 ? '' : 's'}`} /></div>
            <p className="pb-hint">Challenge can last for 1 day to 100 days · ends {new Date(startAt + days * DAY).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
            {type === 'elo' ? (
              <>
                <div className="pb-row"><span>ELO Challenge Rating</span><Stepper label="ELO goal" value={eloGoal} min={rules.minGoal!} max={rules.maxGoal!} step={50} onChange={setEloGoal} /></div>
                <p className="pb-hint">Challenge goal can range from +{rules.minGoal} to +{rules.maxGoal}.</p>
                <div className="pb-goal"><div><small>Current</small><b>{elo.toLocaleString()}</b></div><span>»</span><div><small>Goal</small><b className="gold">{(elo + eloGoal).toLocaleString()}</b></div></div>
                <p className="pb-hint">Your goal is set from your rating when the challenge starts.</p>
              </>
            ) : (
              <>
                <div className="pb-row"><span>Bankroll goal</span><Stepper label="bankroll goal" value={bankGoal} min={rules.minGoal!} max={rules.maxGoal!} step={5_000} onChange={setBankGoal} format={(v) => `+${money(v, true)}`} /></div>
                <p className="pb-hint">Win {money(bankGoal)} in settled game results before the end time.</p>
              </>
            )}
          </section>
        )}

        {step === 3 && (
          <section className="pb-step">
            {lastLonger ? (
              <div className="pb-review">
                <div><span>Type</span><b>Last Longer</b></div>
                <div><span>Tournament</span><b>{board.eligibleTournaments.find((t) => t.id === tournamentId)?.name}</b></div>
                <div><span>Your stake</span><b className="gold">{money(amount)}</b></div>
                <div><span>Seats for others</span><b>{players}</b></div>
              </div>
            ) : (
              <>
                <div className="pb-row"><span>Bettors against you</span><Stepper label="bettors" value={bettors} min={0} max={rules.maxBettors} onChange={setBettors} /></div>
                <p className="pb-box">You can choose how many people can bet against you. If you set it to 0, it will be a single mode challenge.</p>
                {bettors > 0 && (
                  <div className="pb-row"><span>Stake per bettor</span>
                    <div className="pb-chips">{AMOUNTS.map((a) => <button key={a} type="button" className={amount === a ? 'on' : ''} onClick={() => setAmount(a)}>{money(a, true)}</button>)}</div>
                  </div>
                )}
                {bettors > 0 && <p className="pb-note">You escrow {money(amount * bettors)} now; unfilled seats come back when the challenge starts.</p>}
              </>
            )}
          </section>
        )}

        <footer className="pb-actions">
          {step === 1
            ? <button type="button" className="pb-btn ghost" onClick={onClose}>Cancel</button>
            : <button type="button" className="pb-btn ghost" onClick={() => setStep(step - 1)}>Previous</button>}
          {step < total
            ? <button type="button" className="pb-btn go" disabled={blocked} onClick={() => setStep(step + 1)}>Next</button>
            : <button type="button" className="pb-btn go" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create'}</button>}
        </footer>
      </div>
    </div>
  );
}
