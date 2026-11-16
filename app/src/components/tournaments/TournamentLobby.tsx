import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, money, type TournamentDetail } from '../../lib/api';
import { Countdown } from '../PageShell';
import { explainers, gameName, lobbyTheme, modeName, statusLabel } from '../../lib/tournamentLobby';
import {
  InfoPanel, InfoTip, PlayersPanel, PrizePanel, PropBetPanel, RulesPanel, SatellitesPanel, StructurePanel, TablesPanel,
} from './TournamentLobbyPanels';

const REFRESH_MS = 10_000;
type LeftTab = 'rules' | 'satellites' | 'propbet';
type CentreTab = 'info' | 'structure' | 'prizes';
type RightTab = 'players' | 'tables';

type Props = {
  tournament: any;
  all: readonly any[];
  registered: boolean;
  busy: boolean;
  balance: number;
  meId?: number;
  onClose: () => void;
  onRegister: () => void;
  onUnregister: () => void;
  onPlay: () => void;
  onWatch: (tableId?: string) => void;
  onOpen: (t: any) => void;
  onPropBet: () => void;
  onError: (message: string) => void;
};

function Tabs<K extends string>({ tabs, value, onChange, label }: { tabs: [K, string][]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <div className="tl-tabs" role="tablist" aria-label={label}>
      {tabs.map(([k, text]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{text}</button>
      ))}
    </div>
  );
}

function ClockRing({ t, d }: { t: any; d: TournamentDetail | null }) {
  const clock = d?.clock;
  if (clock) {
    return (
      <div className="tl-ring" aria-label={`Level ${clock.level}`}>
        <small>{d?.lateReg.open ? 'Late Reg.' : 'Level'}</small>
        <b>{clock.level}</b>
        <span>{clock.sb.toLocaleString()}/{clock.bb.toLocaleString()}</span>
        {clock.levelEndsAt && <em>Next <Countdown to={new Date(clock.levelEndsAt).toISOString()} /></em>}
      </div>
    );
  }
  return (
    <div className="tl-ring idle">
      <small>{t.status === 'completed' ? 'Finished' : 'Starts in'}</small>
      {t.status !== 'completed' && <b className="tl-ring-time"><Countdown to={t.start_at} /></b>}
      {d && <span>Level 1 · {d.structure[0].sb}/{d.structure[0].bb}</span>}
    </div>
  );
}

function ActionButton({ t, d, registered, busy, onRegister, onUnregister, onPlay, onWatch }: Pick<Props, 'registered' | 'busy' | 'onRegister' | 'onUnregister' | 'onPlay' | 'onWatch'> & { t: any; d: TournamentDetail | null }) {
  if (t.status === 'completed') return <button type="button" className="tl-btn" disabled>Finished</button>;
  if (registered) {
    return (
      <div className="tl-actions">
        {t.status === 'registering' && <button type="button" className="tl-btn ghost" disabled={busy} onClick={onUnregister}>Unregister</button>}
        <button type="button" className="tl-btn go" disabled={busy} onClick={onPlay}>{t.status === 'running' ? 'Go to Table' : 'Open Table'}</button>
      </div>
    );
  }
  const open = d ? d.lateReg.open : t.status === 'registering';
  const full = Number(t.entrants) >= Number(t.max_players);
  return (
    <div className="tl-actions">
      {t.status === 'running' && <button type="button" className="tl-btn ghost" disabled={busy} onClick={() => onWatch()}>Watch</button>}
      <button type="button" className="tl-btn reg" disabled={busy || !open || full} onClick={onRegister}>
        {!open ? 'Reg. Closed' : full ? 'Full' : `Register · ${t.buyin + t.fee ? money(t.buyin + t.fee) : 'Free'}`}
      </button>
    </div>
  );
}

export function TournamentLobby(props: Props) {
  const { tournament: t, onClose, onError } = props;
  const [d, setD] = useState<TournamentDetail | null>(null);
  const [left, setLeft] = useState<LeftTab>('rules');
  const [centre, setCentre] = useState<CentreTab>('info');
  const [right, setRight] = useState<RightTab>('players');
  const [query, setQuery] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    const load = () => api.tournament(t.id)
      .then((r) => { if (!cancelled) setD(r); })
      .catch((e) => { if (!cancelled) errorRef.current(e.message || 'Could not load the tournament'); });
    setD(null);
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [t.id, t.status, t.entrants, props.registered]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ex = explainers(t, d);
  const modeTip = t.mode === 'BOUNTY' ? ex.bounty : t.mode === 'MYSTERY' ? ex.mystery : t.mode === 'FLIP' ? ex.flip : t.mode === 'SATELLITE' ? ex.satellite : null;
  const live = d?.tournament ?? t;
  const left_ = live.status === 'running' && d?.playersLeft ? `${d.playersLeft.toLocaleString()} / ${Number(live.entrants).toLocaleString()}` : Number(live.entrants).toLocaleString();

  // Portalled to <body> so it sits above the desktop page shell and the phone shell alike.
  return createPortal(
    <div className="modal-backdrop tl-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`tl-window tl-${lobbyTheme(t)}`} role="dialog" aria-modal="true" aria-label={`${t.name} lobby`}>
        <header className="tl-head">
          <div className="tl-title">
            <span className="tl-status">{statusLabel(live, d)}</span>
            <h2>{t.name}</h2>
            <p>{gameName(t)} · {modeName(t)}{modeTip && <InfoTip explain={modeTip} />}</p>
            <ActionButton {...props} t={live} d={d} />
          </div>
          <div className="tl-pool">
            <small>Prize Pool</small>
            <b>{live.mode === 'SATELLITE' ? `${live.ticket || 'Seat'} ticket` : money(d?.prizePool ?? Math.max(live.gtd || 0, 0))}</b>
            <dl>
              <div><dt>Buy-in</dt><dd>{live.buyin + live.fee ? money(live.buyin + live.fee) : 'Freeroll'}</dd></div>
              <div><dt>Guaranteed</dt><dd>{live.gtd ? money(live.gtd) : '—'}</dd></div>
            </dl>
          </div>
          <ClockRing t={live} d={d} />
          <dl className="tl-stats">
            <div><dt>Players</dt><dd>{left_}</dd></div>
            <div><dt>Starting Stack</dt><dd>{Number(live.starting_stack).toLocaleString()}</dd></div>
            <div><dt>Largest Stack</dt><dd>{d?.stacks ? d.stacks.largest.toLocaleString() : '—'}</dd></div>
            <div><dt>Average Stack</dt><dd>{d?.stacks ? d.stacks.average.toLocaleString() : '—'}</dd></div>
          </dl>
          <button ref={closeRef} type="button" className="tl-x" aria-label="Close lobby" onClick={onClose}>✕</button>
        </header>

        <div className="tl-body">
          <section className="tl-col tl-left">
            <Tabs label="Tournament extras" value={left} onChange={setLeft} tabs={[['rules', 'Rules'], ['satellites', 'Satellites'], ['propbet', 'Prop Bet']]} />
            <div className="tl-pane">
              {left === 'rules' && <RulesPanel t={t} />}
              {left === 'satellites' && <SatellitesPanel t={t} all={props.all} onOpen={props.onOpen} />}
              {left === 'propbet' && <PropBetPanel registered={props.registered} startsAt={Date.parse(t.start_at)} onCreate={props.onPropBet} />}
            </div>
          </section>
          <section className="tl-col tl-centre">
            <Tabs label="Tournament details" value={centre} onChange={setCentre} tabs={[['info', 'Info'], ['structure', 'Structure'], ['prizes', 'Prize Pool']]} />
            <div className="tl-pane">
              {centre === 'info' && <InfoPanel t={live} d={d} />}
              {centre === 'structure' && <StructurePanel d={d} />}
              {centre === 'prizes' && <PrizePanel d={d} />}
            </div>
          </section>
          <section className="tl-col tl-right">
            <Tabs label="Field" value={right} onChange={setRight} tabs={[['players', 'Players'], ['tables', 'Tables']]} />
            {right === 'players' && <input className="tl-search" type="search" placeholder="Search players" aria-label="Search players" value={query} onChange={(e) => setQuery(e.target.value)} />}
            <div className="tl-pane">
              {right === 'players' && <PlayersPanel t={live} d={d} meId={props.meId} query={query} />}
              {right === 'tables' && <TablesPanel d={d} onWatch={(id) => props.onWatch(id)} />}
            </div>
          </section>
        </div>
        <footer className="tl-foot"><span>Balance: <b>{money(props.balance)}</b></span><span>Play money only · no cash value</span></footer>
      </div>
    </div>,
    document.body,
  );
}
