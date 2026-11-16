import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { organizerChipsApi, cashChips } from '../lib/organizer-chips-api';
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
      {!account.tables.some(table => table.game !== 'spingold') ? <p>Nu ai încă mese private.</p> : <ul className="mp-account-list">
        {account.tables.filter(table => table.game !== 'spingold').map((table) => { const rake = rakes[table.id] || { rakePercent: table.rakePercent, rakeCap: String(table.rakeCap) }; const paid = !table.session?.active && Date.parse(table.session?.paid_until || '') > Date.now(); return <li key={table.id}><div><strong>{table.name}</strong><p>Cash · {table.session?.active ? `activă, achitată până la ${when(table.session.paid_until)}` : paid ? `oprită, achitată până la ${when(table.session?.paid_until)}` : 'oprită'}</p></div><button type="button" className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => table.session?.active ? void run(`cash-stop:${table.id}`, `Oprești masa „${table.name}”? Nu se fac rambursări; timpul deja achitat rămâne disponibil până la ${when(table.session.paid_until)}.`, () => organizerBillingApi.stopCash(table.id), 'Masa a fost oprită.') : void run(`cash-start:${table.id}`, paid ? `Reiei gratuit masa „${table.name}” în perioada deja achitată, până la ${when(table.session?.paid_until)}?` : `Confirmi pornirea mesei „${table.name}” și debitarea anticipată a ${usd(hourPrice)} pentru următoarea oră?`, (key) => organizerBillingApi.startCash(table.id, key), 'Masa a fost pornită.')}>{table.session?.active ? 'Oprește' : paid ? 'Reia gratuit' : `Pornește (${usd(hourPrice)})`}</button>
          {Boolean(table.chip_economy) && <form aria-label={`Rake pentru ${table.name}`} className="mp-rake-form" onSubmit={(event) => {
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
      <section className="mp-tournament-manager" aria-label="Spin & Go Manager">
        <h3>Spin &amp; Go Manager</h3>
        <p>Three players, one random prize pool. Setup costs {usd(tariffs?.spin_setup ?? 300)}; changing an unstarted schedule costs {usd(tariffs?.reschedule ?? 100)}. There is no hourly charge.</p>
        <p>Before players can enter, reserve 20,000× the stake from your own Cash Chips to cover the maximum jackpot. For a 5,000-chip entry this is 100,000,000 Cash Chips. Unused reserve returns after settlement. Entry money above the drawn prize pool leaves circulation; larger prizes use your reserve.</p>
        <p>Buy and transfer prepaid entry tickets in this workspace. Each ticket works only at its named table and organiser. It does not reserve a seat. The oldest matching ticket is used before wallet chips; leaving before play refunds Cash Chips. Unused tickets can be refunded by their current holder.</p>
        {!account.tables.some(table => table.game === 'spingold') ? <p>No hosted Spin &amp; Go tables yet.</p> : <ul className="mp-account-list">{account.tables.filter(table => table.game === 'spingold').map(table => {
          const round = table.spinRound, active = round && ['waiting', 'committed', 'disputed'].includes(round.state);
          const start = starts[`spin:${table.id}`] || (table.schedule?.start_at ? localDateTime(table.schedule.start_at) : '');
          const canReschedule = enforced && !table.occupied && !table.schedule?.started_at && Date.parse(table.schedule?.start_at || '') > Date.now();
          const outcome = round?.outcome ? JSON.parse(round.outcome) as { multiplier: number; prizePool: number; prizes: number[] } : null;
          const link = `#/table/${encodeURIComponent(table.id)}?observe=1`;
          return <li key={table.id} aria-label={`Manage ${table.name}`}>
            <div><strong>{table.name}</strong><p>{table.seats} seats · Entry {cashChips(table.min_buyin)} · {table.occupied} seated · Launch {when(table.schedule?.start_at)}</p></div>
            <p>Latest round: <strong>{round?.state || 'not funded'}</strong>. Required reserve: {cashChips(table.min_buyin * 20000)}. Launch is the earliest start; play begins when all three funded seats are filled.</p>
            {outcome && <p>Committed draw: {outcome.multiplier}× · Pool {cashChips(outcome.prizePool)} · Places 1–3: {outcome.prizes.map(cashChips).join(' / ')}.</p>}
            <a className="mp-button mp-button-secondary" href={link}>Open Spin table</a>
            <label>Invite link<input className="admin-input" aria-label={`Invite for ${table.name}`} readOnly value={`${location.origin}/${link}`} onFocus={event => event.target.select()} /></label>
            <form onSubmit={event => { event.preventDefault(); const time = Date.parse(start); if (!Number.isFinite(time) || time <= Date.now()) { setError('Choose a future Spin launch time.'); return; } const startAt = new Date(time).toISOString(); void run(`spin:${table.id}:${startAt}`, `Reschedule “${table.name}” for ${usd(tariffs?.reschedule ?? 100)}?`, key => organizerBillingApi.reschedule('spin', table.id, startAt, key), 'Spin launch rescheduled.'); }}>
              <input className="admin-input" type="datetime-local" aria-label={`New start for ${table.name}`} required value={start} disabled={!canReschedule || Boolean(busy)} onChange={event => setStarts(current => ({ ...current, [`spin:${table.id}`]: event.target.value }))} />
              <button className="mp-button mp-button-secondary" disabled={!canReschedule || Boolean(busy)}>Reschedule ({usd(tariffs?.reschedule ?? 100)})</button>
            </form>
            <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || Boolean(active)} onClick={() => void run(`reserve:${table.id}`, `Reserve ${cashChips(table.min_buyin * 20000)} for “${table.name}”?`, () => organizerChipsApi.startSpin(table.id), 'Prize reserve funded. Refresh Cash Chips to see the balance.')}>Fund prize reserve</button>
            <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || round?.state !== 'waiting' || Boolean(table.occupied)} onClick={() => void run(`cancel-spin:${table.id}`, 'Cancel the empty waiting round and return its reserve? Unused entry tickets remain refundable.', () => organizerChipsApi.cancelSpin(table.id), 'Waiting reserve returned.')}>Cancel waiting reserve</button>
            <button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => void run(`spin-ticket:${table.id}`, `Buy one entry ticket for ${cashChips(table.min_buyin)}? It does not reserve a seat.`, key => organizerChipsApi.buySpinTicket(table.id, key), 'Ticket issued. Refresh Cash Chips below to transfer or use it.')}>Buy entry ticket</button>
            <button className="mp-button mp-button-secondary" disabled={Boolean(busy) || Boolean(table.occupied) || Boolean(round && ['committed', 'disputed'].includes(round.state))} onClick={() => void run(`close-spin:${table.id}`, `Close “${table.name}”? Unused tickets refund to their current holders and any waiting reserve returns. Service fees are not refunded.`, () => api.deleteHostTable(table.id), 'Spin table closed; unused tickets refunded.')}>Close empty table</button>
          </li>;
        })}</ul>}
      </section>
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
