import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { organizerChipsApi, cashChips } from '../lib/organizer-chips-api';
import { organizerBillingApi, type OrganizerBillingAccount, type OrganizerBillingConfig } from '../lib/organizer-billing-api';

const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-US') : '—';
const localDateTime = (value: string) => {
  const date = new Date(value), offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request failed.';

export function OrganizerBilling({ userId, role }: { userId?: number; role?: 'organizer' | 'contributor' }) {
  const contributorOnly = role === 'contributor';
  const [config, setConfig] = useState<OrganizerBillingConfig | null>(null);
  const [account, setAccount] = useState<OrganizerBillingAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [rakes, setRakes] = useState<Record<string, { rakePercent: number; rakeCap: string }>>({});
  const [spinRakes, setSpinRakes] = useState<Record<string, number>>({});
  const keys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const nextConfig = await organizerBillingApi.config();
      setConfig(nextConfig);
      setAccount(userId ? await organizerBillingApi.mine() : null);
    } catch (failure) { setError(errorText(failure)); }
    finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (identity: string, confirmation: string, action: (key: string) => Promise<unknown>, success: string) => {
    if (busy || !window.confirm(confirmation)) return;
    const key = keys.current.get(identity) || crypto.randomUUID();
    keys.current.set(identity, key); setBusy(identity); setError(''); setNotice('');
    try { await action(key); keys.current.delete(identity); setNotice(success); try { await load(); } catch { setError('The action succeeded, but the data did not reload. Select Refresh.'); } }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  };
  const enforced = config?.mode === 'enforce';
  const tariffs = config?.tariffs;
  const hourPrice = account?.cash_usage?.next_hour_cents ?? tariffs?.cash_hour ?? 500;
  const fundingReference = userId ? `openpoker:user:${userId}` : '';
  const openFunding = (url: string, amountCents: number) => {
    if (!userId || !config?.manual_funding.enabled) return;
    const checkout = new URL(url);
    checkout.searchParams.set('ref', fundingReference);
    window.open(checkout.toString(), '_blank', 'noopener,noreferrer');
    setNotice(`Checkout opened for ${usd(amountCents)}. After payment, the operator verifies the receipt before adding credits. Opening, returning from, or closing NervixPay does not confirm payment or credit the account automatically.`);
  };

  if (loading && !config) return <section className="mp-account-panel" aria-busy="true"><p>Loading membership and service credits…</p></section>;
  return <section className="mp-account-panel" aria-label={contributorOnly ? "Contributor membership and credits" : "Organizer credits and services"}>
    <div className="mp-section-heading"><div><span className="mp-eyebrow">{contributorOnly ? 'CONTRIBUTOR MEMBERSHIP' : 'ORGANIZER SERVICES'}</span><h2>{contributorOnly ? 'Membership and service credits' : 'Credits, memberships, and resources'}</h2></div><button type="button" className="mp-button mp-button-secondary" disabled={loading || Boolean(busy)} onClick={() => void load()}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {contributorOnly && config && <p>Contributor membership costs {usd(config.tariffs.membership)} for one calendar month, renewed manually. Build and test locally for free; membership and an approved publisher profile are required for marketplace submission. Publisher commission credits are managed separately below.</p>}
    {!contributorOnly && config && <p>Rates: Cash {usd(config.tariffs.cash_setup)} setup + $5–$1/hour while the table is active; tournament {usd(config.tariffs.tournament_setup)} setup + {usd(config.tariffs.reschedule)} rescheduling; Spin &amp; Go {usd(config.tariffs.spin_setup)} setup + {usd(config.tariffs.reschedule)} rescheduling. Membership costs {usd(config.tariffs.membership)} per calendar month.</p>}
    {!enforced && <div className="mp-notice" role="status">Credit billing is not active on this installation. Debit controls are disabled and existing hosting continues in legacy mode.</div>}
    {error && <div className="mp-notice mp-notice-error" role="alert">{error}</div>}
    {notice && <div className="mp-notice mp-notice-success" role="status">{notice}</div>}
    {!userId ? <p>Sign in to view your balance and resources.</p> : account && <>
      <div className="mp-account-grid"><article><strong>{usd(account.balance_cents)}</strong><p>service credit balance</p></article>{(role ? [role] : ['organizer', 'contributor'] as const).map((role) => <article key={role}><strong>{role === 'organizer' ? 'Organizer' : 'Contributor'}</strong><p>{account.memberships[role].active ? `Active until ${when(account.memberships[role].expires_at)}` : 'Inactive'}</p><button type="button" className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => void run(`subscribe:${role}`, `Charge ${usd(tariffs?.membership || 900)} for one month of ${role} membership?`, (key) => organizerBillingApi.subscribe(role, key), 'Membership updated.')}>{busy === `subscribe:${role}` ? 'Processing…' : account.memberships[role].active ? 'Renew' : 'Activate'}</button></article>)}</div>
      {config?.manual_funding.enabled && <section aria-label="Manual service credit funding">
        <h3>Add service credits through NervixPay</h3>
        <p>The operator verifies payment manually; the account is not credited automatically. Service credits are not player deposits or Cash Chips. After verification, activate the membership separately; there is no automatic renewal.</p>
        <p>Displayed merchant: <strong>{config.manual_funding.merchant_display}</strong> (shared account {config.manual_funding.settlement_account_display}). Accepted assets: {config.manual_funding.assets?.join(' or ')}. Reference sent to NervixPay: <code>{fundingReference}</code>. Your email address is not sent.</p>
        <div className="mp-account-grid">{config.manual_funding.links.map((link) => <article key={link.amount_cents}><strong>{usd(link.amount_cents)}</strong><p>service credits after receipt reconciliation</p><button type="button" className="mp-button mp-button-secondary" onClick={() => openFunding(link.url, link.amount_cents)}>Open {usd(link.amount_cents)} payment</button></article>)}</div>
        <p>Keep the receipt and order reference. If a verified payment is missing from the balance, contact platform <a href="#/support">Support</a> and include the receipt and <code>{fundingReference}</code>.</p>
      </section>}
      {!contributorOnly && <>
      <p>The Cash rate decreases with lifetime paid hours across all your tables: {config?.tariffs.cash_hour_tiers.map((tier, index, tiers) => `${index === 0 ? 1 : (tiers[index - 1].through || 0) + 1}${tier.through === null ? '+' : `–${tier.through}`} hours: ${usd(tier.cents)}/hour`).join('; ')}. Each active table uses one hour. Each hour is prepaid with no retroactive discounts.</p>
      {account.cash_usage && <p aria-label="Cash hourly rate">Paid hours: <strong>{account.cash_usage.paid_hours}</strong> · Next hour (#{account.cash_usage.next_hour}): <strong>{usd(hourPrice)}</strong>. Resuming within an already-paid period is free.</p>}
      <h3>Hosted resources</h3>
      {!account.tables.some(table => table.game !== 'spingold') ? <p>You do not have any private tables yet.</p> : <ul className="mp-account-list">
        {account.tables.filter(table => table.game !== 'spingold').map((table) => { const rake = rakes[table.id] || { rakePercent: table.rakePercent, rakeCap: String(table.rakeCap) }; const paid = !table.session?.active && Date.parse(table.session?.paid_until || '') > Date.now(); return <li key={table.id}><div><strong>{table.name}</strong><p>Cash · {table.session?.active ? `active, paid until ${when(table.session.paid_until)}` : paid ? `stopped, paid until ${when(table.session?.paid_until)}` : 'stopped'}</p></div><button type="button" className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => table.session?.active ? void run(`cash-stop:${table.id}`, `Stop “${table.name}”? There are no refunds; paid time remains available until ${when(table.session.paid_until)}.`, () => organizerBillingApi.stopCash(table.id), 'Table stopped.') : void run(`cash-start:${table.id}`, paid ? `Resume “${table.name}” free within the paid period ending ${when(table.session?.paid_until)}?` : `Start “${table.name}” and prepay ${usd(hourPrice)} for the next hour?`, (key) => organizerBillingApi.startCash(table.id, key), 'Table started.')}>{table.session?.active ? 'Stop' : paid ? 'Resume free' : `Start (${usd(hourPrice)})`}</button>
          {Boolean(table.chip_economy) && <form aria-label={`Rake for ${table.name}`} className="mp-rake-form" onSubmit={(event) => {
            event.preventDefault();
            void run(`rake:${table.id}:${rake.rakePercent}:${rake.rakeCap}`, `Save ${rake.rakePercent}% rake with a ${rake.rakeCap} Cash Chip cap per hand for “${table.name}”?`, () => organizerBillingApi.setCashRake(table.id, rake.rakePercent, Number(rake.rakeCap)), 'Rake saved.');
          }}>
            <p>Current rake: <strong>{table.rakePercent}%</strong> · Cap: <strong>{table.rakeCap.toLocaleString()} Cash Chips/hand</strong>. Change it only while the table is stopped and empty.</p>
            <label>Rake (%)<select aria-label={`Rake (%) for ${table.name}`} className="admin-select" value={rake.rakePercent} disabled={!enforced || Boolean(busy) || Boolean(table.session?.active)} onChange={(event) => setRakes((current) => ({ ...current, [table.id]: { ...rake, rakePercent: Number(event.target.value) } }))}>{[2, 3, 4, 5].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
            <label>Per-hand cap (Cash Chips)<input aria-label={`Rake cap for ${table.name}`} className="admin-input" type="number" min={1} max={9000000000} step={1} required value={rake.rakeCap} disabled={!enforced || Boolean(busy) || Boolean(table.session?.active)} onChange={(event) => setRakes((current) => ({ ...current, [table.id]: { ...rake, rakeCap: event.target.value } }))} /></label>
            <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || Boolean(table.session?.active)}>Save rake</button>
          </form>}
        </li>; })}
      </ul>}
      <section className="mp-tournament-manager" aria-label="Spin & Go Manager">
        <h3>Spin &amp; Go Manager</h3>
        <p>Three players fund one winner-takes-all Cash Chip pool. Setup costs {usd(tariffs?.spin_setup ?? 300)}; changing an unstarted schedule costs {usd(tariffs?.reschedule ?? 100)}. There is no hourly charge or jackpot reserve.</p>
        <p>Buy and transfer prepaid entry tickets in this workspace. Each ticket works only at its named table and organizer. It does not reserve a seat. The oldest matching ticket is used before wallet chips; leaving before play refunds Cash Chips. Unused tickets can be refunded by their current holder.</p>
        {!account.tables.some(table => table.game === 'spingold') ? <p>No hosted Spin &amp; Go tables yet.</p> : <ul className="mp-account-list">{account.tables.filter(table => table.game === 'spingold').map(table => {
          const round = table.spinRound, active = round && ['waiting', 'committed', 'disputed'].includes(round.state);
          const start = starts[`spin:${table.id}`] || (table.schedule?.start_at ? localDateTime(table.schedule.start_at) : '');
          const canReschedule = enforced && !table.occupied && !table.schedule?.started_at && Date.parse(table.schedule?.start_at || '') > Date.now();
          const outcome = round?.outcome ? JSON.parse(round.outcome) as { payoutModel?: string; multiplier?: number; prizePool: number; prizes: number[]; rakePercent?: number; rakeAmount?: number; entryTotal?: number } : null;
          const savedRakePercent = table.rakePercent ?? 5, rakePercent = spinRakes[table.id] ?? savedRakePercent;
          const entryTotal = table.min_buyin * 3, savedRakeAmount = entryTotal * savedRakePercent / 100, savedPrize = entryTotal - savedRakeAmount;
          const draftRakeAmount = entryTotal * rakePercent / 100;
          const link = `#/table/${encodeURIComponent(table.id)}?observe=1`;
          return <li key={table.id} aria-label={`Manage ${table.name}`}>
            <div><strong>{table.name}</strong><p>{table.seats} seats · Entry {cashChips(table.min_buyin)} · {table.occupied} seated · Launch {when(table.schedule?.start_at)}</p></div>
            <p>Latest round: <strong>{round?.state || 'entries closed'}</strong>. Current terms: Pool {cashChips(entryTotal)} · Rake {cashChips(savedRakeAmount)} ({savedRakePercent}%) · Winner prize {cashChips(savedPrize)}. Launch is the earliest start; play begins when all three funded seats are filled.</p>
            {rakePercent !== savedRakePercent && <p>Draft preview: Rake {cashChips(draftRakeAmount)} ({rakePercent}%) · Winner prize {cashChips(entryTotal - draftRakeAmount)}.</p>}
            {outcome && (outcome.payoutModel === 'pooled'
              ? <p>Stored pooled outcome: Pool {cashChips(outcome.entryTotal ?? entryTotal)} · Rake {cashChips(outcome.rakeAmount ?? savedRakeAmount)} · Winner {cashChips(outcome.prizes?.[0] ?? outcome.prizePool)}.</p>
              : <p>Stored legacy draw: {outcome.multiplier}× · Pool {cashChips(outcome.prizePool)} · Places 1–3: {outcome.prizes.map(cashChips).join(' / ')}.</p>)}
            <form aria-label={`Spin rake for ${table.name}`} className="mp-rake-form" onSubmit={(event) => { event.preventDefault(); void run(`spin-rake:${table.id}:${rakePercent}`, `Save ${rakePercent}% rake for “${table.name}”?`, () => organizerBillingApi.setSpinRake(table.id, rakePercent), 'Spin rake saved.'); }}>
              <label>Rake (%)<select className="admin-select" value={rakePercent} disabled={!enforced || Boolean(busy) || Boolean(active) || Boolean(table.occupied)} onChange={(event) => setSpinRakes((current) => ({ ...current, [table.id]: Number(event.target.value) }))}>{[2, 3, 4, 5].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
              <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || Boolean(active) || Boolean(table.occupied)}>Save rake</button>
            </form>
            <a className="mp-button mp-button-secondary" href={link}>Open Spin table</a>
            <label>Invite link<input className="admin-input" aria-label={`Invite for ${table.name}`} readOnly value={`${location.origin}/${link}`} onFocus={event => event.target.select()} /></label>
            <form onSubmit={event => { event.preventDefault(); const time = Date.parse(start); if (!Number.isFinite(time) || time <= Date.now()) { setError('Choose a future Spin launch time.'); return; } const startAt = new Date(time).toISOString(); void run(`spin:${table.id}:${startAt}`, `Reschedule “${table.name}” for ${usd(tariffs?.reschedule ?? 100)}?`, key => organizerBillingApi.reschedule('spin', table.id, startAt, key), 'Spin launch rescheduled.'); }}>
              <input className="admin-input" type="datetime-local" aria-label={`New start for ${table.name}`} required value={start} disabled={!canReschedule || Boolean(busy)} onChange={event => setStarts(current => ({ ...current, [`spin:${table.id}`]: event.target.value }))} />
              <button className="mp-button mp-button-secondary" disabled={!canReschedule || Boolean(busy)}>Reschedule ({usd(tariffs?.reschedule ?? 100)})</button>
            </form>
            <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || Boolean(active)} onClick={() => void run(`entries:${table.id}`, `Open entries for “${table.name}”?`, () => organizerChipsApi.startSpin(table.id), 'Entries opened.')}>Open entries</button>
            <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || round?.state !== 'waiting' || Boolean(table.occupied)} onClick={() => void run(`cancel-spin:${table.id}`, 'Close the empty waiting round? Unused entry tickets remain refundable.', () => organizerChipsApi.cancelSpin(table.id), 'Waiting entries closed.')}>Close waiting entries</button>
            <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => void run(`spin-ticket:${table.id}`, `Buy one entry ticket for ${cashChips(table.min_buyin)}? It does not reserve a seat.`, key => organizerChipsApi.buySpinTicket(table.id, key), 'Ticket issued. Refresh Cash Chips below to transfer or use it.')}>Buy entry ticket</button>
            <button className="mp-button mp-button-secondary" disabled={Boolean(busy) || Boolean(table.occupied) || Boolean(round && ['committed', 'disputed'].includes(round.state))} onClick={() => void run(`close-spin:${table.id}`, `Close “${table.name}”? Unused tickets refund to their current holders. Service fees are not refunded.`, () => api.deleteHostTable(table.id), 'Spin table closed; unused tickets refunded.')}>Close empty table</button>
          </li>;
        })}</ul>}
      </section>
      <section className="mp-tournament-manager" aria-label="Tournament Manager">
        <h3>Tournament Manager</h3>
        <p>Configure a private event for {usd(tariffs?.tournament_setup ?? 500)}. Rescheduling costs {usd(tariffs?.reschedule ?? 100)}; there is no hourly tournament charge.</p>
        <p>Cash Chip events are freezeouts: registration closes at the scheduled start, with at least two entrants required. Buy or transfer tournament-specific tickets in the Cash Chips panel below. Each ticket grants the configured starting stack; tournament stacks are not wallet balances.</p>
        <p>The buy-in funds prizes; the entry fee is removed from circulation when play starts. Standard payouts: 50% / 30% / 20% for three or more entrants; 62.5% / 37.5% for two. The lobby shows exact prizes, including rounding. Bounty prizes require an additional reserve from the organizer.</p>
        {!account.tournaments.length ? <p>No hosted tournaments yet.</p> : <ul className="mp-account-list">{account.tournaments.map((tournament) => {
          const start = starts[`tournament:${tournament.id}`] || localDateTime(tournament.start_at);
          const canReschedule = enforced && tournament.status === 'registering' && Date.parse(tournament.start_at) > Date.now();
          const unit = tournament.chip_economy ? 'Cash Chips' : 'play-money cents';
          const link = `#/tournaments?id=${encodeURIComponent(tournament.id)}`;
          return <li key={tournament.id} aria-label={`Manage ${tournament.name}`}>
            <div><strong>{tournament.name}</strong><p>{tournament.format} · {tournament.mode} · {tournament.status} · {when(tournament.start_at)}</p></div>
            <p>{tournament.entrants} / {tournament.max_players} entrants · Ticket: {(tournament.buyin + tournament.fee).toLocaleString()} {unit} ({tournament.buyin.toLocaleString()} buy-in + {tournament.fee.toLocaleString()} fee) · Starting stack: {tournament.starting_stack.toLocaleString()} tournament chips · Blind levels: {tournament.blind_speed} minutes.</p>
            {tournament.bounty > 0 && <p>Bounty: {tournament.bounty.toLocaleString()} {unit} per entrant, reserved separately at the start.</p>}
            <a className="mp-button mp-button-secondary" href={link}>Open tournament lobby</a>
            <label>Invite link<input className="admin-input" aria-label={`Invite for ${tournament.name}`} readOnly value={`${location.origin}/${link}`} onFocus={event => event.target.select()} /></label>
            <form onSubmit={(event: FormEvent) => {
              event.preventDefault(); const time = Date.parse(start);
              if (!Number.isFinite(time) || time <= Date.now()) { setError('Choose a future tournament start time.'); return; }
              const startAt = new Date(time).toISOString();
              void run(`tournament:${tournament.id}:${startAt}`, `Confirm ${usd(tariffs?.reschedule ?? 100)} to reschedule “${tournament.name}” to ${when(startAt)}?`, key => organizerBillingApi.reschedule('tournament', tournament.id, startAt, key), 'Tournament rescheduled.');
            }}><input aria-label={`New start for ${tournament.name}`} className="admin-input" type="datetime-local" required value={start} disabled={!canReschedule || Boolean(busy)} onChange={event => setStarts(current => ({ ...current, [`tournament:${tournament.id}`]: event.target.value }))} /><button className="mp-button mp-button-secondary" disabled={!canReschedule || Boolean(busy)}>Reschedule ({usd(tariffs?.reschedule ?? 100)})</button></form>
            <button type="button" className="mp-button mp-button-secondary" disabled={Boolean(busy) || tournament.status !== 'registering'} onClick={() => void run(`cancel-tournament:${tournament.id}`, `Cancel “${tournament.name}”? Issued and registered Cash Chip tickets are refunded to their current holders. Setup and rescheduling service fees are not automatically refunded.`, () => api.deleteHostTournament(tournament.id), 'Tournament cancelled. Refresh the Cash Chips panel to see ticket refunds.')}>Cancel tournament</button>
          </li>;
        })}</ul>}
      </section>
      </>}
      <h3>Credit history</h3>
      {!account.ledger?.length ? <p>No recorded transactions.</p> : <ul className="mp-account-list">{account.ledger.map((entry) => <li key={entry.id}><div className="mp-account-row"><strong>{entry.kind}</strong><strong>{entry.amount_cents > 0 ? '+' : ''}{usd(entry.amount_cents)}</strong></div><time>{when(entry.created_at)}{entry.resource_id ? ` · ${entry.resource_id}` : ''}</time></li>)}</ul>}
    </>}
  </section>;
}
