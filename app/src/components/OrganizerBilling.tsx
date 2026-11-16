import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { organizerBillingApi, type OrganizerBillingAccount, type OrganizerBillingConfig } from '../lib/organizer-billing-api';

const usd = (cents: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'USD' }).format(cents / 100);
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ro-RO') : '—';
const localDateTime = (value: string) => {
  const date = new Date(value), offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Cererea nu a reușit.';

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
    try { await action(key); keys.current.delete(identity); setNotice(success); try { await load(); } catch { setError('Operațiunea a reușit, dar datele nu s-au reîncărcat. Apasă „Actualizează”.'); } }
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
    setNotice(`Checkout deschis pentru ${usd(amountCents)}. După plată, operatorul verifică chitanța înainte de creditare. Deschiderea, revenirea sau închiderea paginii NervixPay nu confirmă o plată și nu creditează automat contul.`);
  };

  if (loading && !config) return <section className="mp-account-panel" aria-busy="true"><p>Loading membership and service credits…</p></section>;
  return <section className="mp-account-panel" aria-label={contributorOnly ? "Contributor membership and credits" : "Credite și servicii pentru organizatori"}>
    <div className="mp-section-heading"><div><span className="mp-eyebrow">{contributorOnly ? 'CONTRIBUTOR MEMBERSHIP' : 'SERVICII PENTRU ORGANIZATORI'}</span><h2>{contributorOnly ? 'Membership and service credits' : 'Credite, abonamente și resurse'}</h2></div><button type="button" className="mp-button mp-button-secondary" disabled={loading || Boolean(busy)} onClick={() => void load()}>{loading ? 'Se actualizează…' : 'Actualizează'}</button></div>
    {contributorOnly && config && <p>Contributor membership costs {usd(config.tariffs.membership)} for one calendar month, renewed manually. Build and test locally for free; membership and an approved publisher profile are required for marketplace submission. Publisher commission credits are managed separately below.</p>}
    {!contributorOnly && config && <p>Tarife: Cash {usd(config.tariffs.cash_setup)} configurare + $5–$1/oră cât timp masa este activă; turneu {usd(config.tariffs.tournament_setup)} configurare + {usd(config.tariffs.reschedule)} reprogramare; Spin &amp; Go {usd(config.tariffs.spin_setup)} configurare + {usd(config.tariffs.reschedule)} reprogramare. Abonamentele costă {usd(config.tariffs.membership)} pentru o lună calendaristică.</p>}
    {!enforced && <div className="mp-notice" role="status">Facturarea prin credite nu este activă pe această instalare. Controalele de debit sunt dezactivate, iar găzduirea existentă continuă în modul legacy.</div>}
    {error && <div className="mp-notice mp-notice-error" role="alert">{error}</div>}
    {notice && <div className="mp-notice mp-notice-success" role="status">{notice}</div>}
    {!userId ? <p>Intră în cont pentru a vedea soldul și resursele tale.</p> : account && <>
      <div className="mp-account-grid"><article><strong>{usd(account.balance_cents)}</strong><p>sold credite servicii</p></article>{(role ? [role] : ['organizer', 'contributor'] as const).map((role) => <article key={role}><strong>{role === 'organizer' ? 'Organizator' : 'Contributor'}</strong><p>{account.memberships[role].active ? `Activ până la ${when(account.memberships[role].expires_at)}` : 'Inactiv'}</p><button type="button" className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => void run(`subscribe:${role}`, `Confirmi debitarea a ${usd(tariffs?.membership || 900)} pentru o lună de abonament ${role}?`, (key) => organizerBillingApi.subscribe(role, key), 'Abonamentul a fost actualizat.')}>{busy === `subscribe:${role}` ? 'Se procesează…' : account.memberships[role].active ? 'Reînnoiește' : 'Activează'}</button></article>)}</div>
      {config?.manual_funding.enabled && <section aria-label="Finanțare manuală credite servicii">
        <h3>Adaugă credite servicii prin NervixPay</h3>
        <p>Plata este verificată manual de operator și nu creditează automat contul. Creditele servicii nu sunt depozite ale jucătorilor și nu reprezintă Cash Chips. După verificare, activezi separat abonamentul; nu există reînnoire automată.</p>
        <p>Comerciant afișat: <strong>{config.manual_funding.merchant_display}</strong> (cont comun {config.manual_funding.settlement_account_display}). Active acceptate: {config.manual_funding.assets?.join(' sau ')}. Referința trimisă către NervixPay la click: <code>{fundingReference}</code>. Nu transmitem adresa ta de email.</p>
        <div className="mp-account-grid">{config.manual_funding.links.map((link) => <article key={link.amount_cents}><strong>{usd(link.amount_cents)}</strong><p>credite servicii, după reconcilierea chitanței</p><button type="button" className="mp-button mp-button-secondary" onClick={() => openFunding(link.url, link.amount_cents)}>Deschide plata {usd(link.amount_cents)}</button></article>)}</div>
        <p>După plată, păstrează chitanța și referința comenzii. Dacă soldul nu reflectă o plată verificată, contactează suportul platformei din pagina <a href="#/support">Suport</a> și include chitanța plus <code>{fundingReference}</code>.</p>
      </section>}
      {!contributorOnly && <>
      <p>Tariful Cash scade după totalul orelor plătite pe toate mesele tale, pe viață: {config?.tariffs.cash_hour_tiers.map((tier, index, tiers) => `${index === 0 ? 1 : (tiers[index - 1].through || 0) + 1}${tier.through === null ? '+' : `–${tier.through}`} ore: ${usd(tier.cents)}/oră`).join('; ')}. Fiecare masă activă consumă câte o oră. Fiecare oră se achită în avans, fără reduceri retroactive.</p>
      {account.cash_usage && <p aria-label="Tarif orar Cash">Ore plătite: <strong>{account.cash_usage.paid_hours}</strong> · Următoarea oră (#{account.cash_usage.next_hour}): <strong>{usd(hourPrice)}</strong>. Reluarea în perioada deja achitată este gratuită.</p>}
      <h3>Resurse găzduite</h3>
      {!account.tables.length ? <p>Nu ai încă mese private.</p> : <ul className="mp-account-list">
        {account.tables.map((table) => { const spin = table.game === 'spingold'; const rake = rakes[table.id] || { rakePercent: table.rakePercent, rakeCap: String(table.rakeCap) }; const paid = !table.session?.active && Date.parse(table.session?.paid_until || '') > Date.now(); const start = starts[`spin:${table.id}`] || (table.schedule?.start_at ? localDateTime(table.schedule.start_at) : ''); return <li key={table.id}><div><strong>{table.name}</strong><p>{spin ? `Spin & Go · start ${when(table.schedule?.start_at)}` : `Cash · ${table.session?.active ? `activă, achitată până la ${when(table.session.paid_until)}` : paid ? `oprită, achitată până la ${when(table.session?.paid_until)}` : 'oprită'}`}</p></div>{spin ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); const startAt = new Date(start).toISOString(); void run(`spin:${table.id}:${startAt}`, `Confirmi debitarea a ${usd(tariffs?.reschedule || 100)} pentru reprogramarea „${table.name}” la ${when(startAt)}?`, (key) => organizerBillingApi.reschedule('spin', table.id, startAt, key), 'Spin & Go a fost reprogramat.'); }}><input aria-label={`Start nou pentru ${table.name}`} className="admin-input" type="datetime-local" required value={start} disabled={!enforced || Boolean(table.schedule?.started_at)} onChange={(event) => setStarts((current) => ({ ...current, [`spin:${table.id}`]: event.target.value }))} /><button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || Boolean(table.schedule?.started_at)}>Reprogramează ({usd(tariffs?.reschedule || 100)})</button></form> : <button type="button" className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => table.session?.active ? void run(`cash-stop:${table.id}`, `Oprești masa „${table.name}”? Nu se fac rambursări; timpul deja achitat rămâne disponibil până la ${when(table.session.paid_until)}.`, () => organizerBillingApi.stopCash(table.id), 'Masa a fost oprită.') : void run(`cash-start:${table.id}`, paid ? `Reiei gratuit masa „${table.name}” în perioada deja achitată, până la ${when(table.session?.paid_until)}?` : `Confirmi pornirea mesei „${table.name}” și debitarea anticipată a ${usd(hourPrice)} pentru următoarea oră?`, (key) => organizerBillingApi.startCash(table.id, key), 'Masa a fost pornită.')}>{table.session?.active ? 'Oprește' : paid ? 'Reia gratuit' : `Pornește (${usd(hourPrice)})`}</button>}
          {!spin && Boolean(table.chip_economy) && <form aria-label={`Rake pentru ${table.name}`} className="mp-rake-form" onSubmit={(event) => {
            event.preventDefault();
            void run(`rake:${table.id}:${rake.rakePercent}:${rake.rakeCap}`, `Salvezi rake ${rake.rakePercent}% cu plafon ${rake.rakeCap} Cash Chips pe mână pentru „${table.name}”?`, () => organizerBillingApi.setCashRake(table.id, rake.rakePercent, Number(rake.rakeCap)), 'Rake-ul a fost salvat.');
          }}>
            <p>Rake actual: <strong>{table.rakePercent}%</strong> · Plafon: <strong>{table.rakeCap.toLocaleString()} Cash Chips/mână</strong>. Modifică doar când masa este oprită și fără jucători.</p>
            <label>Rake (%)<select aria-label={`Rake (%) pentru ${table.name}`} className="admin-select" value={rake.rakePercent} disabled={!enforced || Boolean(busy) || Boolean(table.session?.active)} onChange={(event) => setRakes((current) => ({ ...current, [table.id]: { ...rake, rakePercent: Number(event.target.value) } }))}>{[2, 3, 4, 5].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
            <label>Plafon per mână (Cash Chips)<input aria-label={`Plafon rake pentru ${table.name}`} className="admin-input" type="number" min={1} max={9000000000} step={1} required value={rake.rakeCap} disabled={!enforced || Boolean(busy) || Boolean(table.session?.active)} onChange={(event) => setRakes((current) => ({ ...current, [table.id]: { ...rake, rakeCap: event.target.value } }))} /></label>
            <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || Boolean(table.session?.active)}>Salvează rake</button>
          </form>}
        </li>; })}
      </ul>}
      <section className="mp-tournament-manager" aria-label="Tournament Manager">
        <h3>Tournament Manager</h3>
        <p>Configure a private event for {usd(tariffs?.tournament_setup ?? 500)}. Rescheduling costs {usd(tariffs?.reschedule ?? 100)}; there is no hourly tournament charge.</p>
        <p>Cash Chip events are freezeouts: registration closes at the scheduled start, with at least two entrants required. Buy or transfer tournament-specific tickets in the Cash Chips panel below. Each ticket grants the configured starting stack; tournament stacks are not wallet balances.</p>
        <p>The buy-in funds prizes; the entry fee is removed from circulation when play starts. Standard payouts: 50% / 30% / 20% for three or more entrants; 62.5% / 37.5% for two. The lobby shows exact prizes, including rounding. Bounty prizes require an additional reserve from the organiser.</p>
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
      <h3>Istoric credite</h3>
      {!account.ledger?.length ? <p>Nicio operațiune înregistrată.</p> : <ul className="mp-account-list">{account.ledger.map((entry) => <li key={entry.id}><div className="mp-account-row"><strong>{entry.kind}</strong><strong>{entry.amount_cents > 0 ? '+' : ''}{usd(entry.amount_cents)}</strong></div><time>{when(entry.created_at)}{entry.resource_id ? ` · ${entry.resource_id}` : ''}</time></li>)}</ul>}
    </>}
  </section>;
}
