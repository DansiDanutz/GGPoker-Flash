import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { organizerBillingApi, type OrganizerBillingAccount, type OrganizerBillingConfig } from '../lib/organizer-billing-api';

const usd = (cents: number) => new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'USD' }).format(cents / 100);
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ro-RO') : '—';
const localDateTime = (value: string) => {
  const date = new Date(value), offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Cererea nu a reușit.';

export function OrganizerBilling({ userId }: { userId?: number }) {
  const [config, setConfig] = useState<OrganizerBillingConfig | null>(null);
  const [account, setAccount] = useState<OrganizerBillingAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [starts, setStarts] = useState<Record<string, string>>({});
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
  const fundingReference = userId ? `openpoker:user:${userId}` : '';
  const openFunding = (url: string, amountCents: number) => {
    if (!userId || !config?.manual_funding.enabled) return;
    const checkout = new URL(url);
    checkout.searchParams.set('ref', fundingReference);
    window.open(checkout.toString(), '_blank', 'noopener,noreferrer');
    setNotice(`Checkout deschis pentru ${usd(amountCents)}. După plată, operatorul verifică chitanța înainte de creditare. Deschiderea, revenirea sau închiderea paginii NervixPay nu confirmă o plată și nu creditează automat contul.`);
  };

  if (loading && !config) return <section className="mp-account-panel" aria-busy="true"><p>Se încarcă serviciile organizatorului…</p></section>;
  return <section className="mp-account-panel" aria-label="Credite și servicii pentru organizatori">
    <div className="mp-section-heading"><div><span className="mp-eyebrow">SERVICII PENTRU ORGANIZATORI</span><h2>Credite, abonamente și resurse</h2></div><button type="button" className="mp-button mp-button-secondary" disabled={loading || Boolean(busy)} onClick={() => void load()}>{loading ? 'Se actualizează…' : 'Actualizează'}</button></div>
    {config && <p>Tarife: Cash {usd(config.tariffs.cash_setup)} configurare + {usd(config.tariffs.cash_hour)}/oră cât timp masa este activă; turneu {usd(config.tariffs.tournament_setup)} configurare + {usd(config.tariffs.reschedule)} reprogramare; Spin &amp; Go {usd(config.tariffs.spin_setup)} configurare + {usd(config.tariffs.reschedule)} reprogramare. Abonamentele costă {usd(config.tariffs.membership)} pentru o lună calendaristică.</p>}
    {!enforced && <div className="mp-notice" role="status">Facturarea prin credite nu este activă pe această instalare. Controalele de debit sunt dezactivate, iar găzduirea existentă continuă în modul legacy.</div>}
    {error && <div className="mp-notice mp-notice-error" role="alert">{error}</div>}
    {notice && <div className="mp-notice mp-notice-success" role="status">{notice}</div>}
    {!userId ? <p>Intră în cont pentru a vedea soldul și resursele tale.</p> : account && <>
      <div className="mp-account-grid"><article><strong>{usd(account.balance_cents)}</strong><p>sold credite servicii</p></article>{(['organizer', 'contributor'] as const).map((role) => <article key={role}><strong>{role === 'organizer' ? 'Organizator' : 'Contributor'}</strong><p>{account.memberships[role].active ? `Activ până la ${when(account.memberships[role].expires_at)}` : 'Inactiv'}</p><button type="button" className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => void run(`subscribe:${role}`, `Confirmi debitarea a ${usd(tariffs?.membership || 900)} pentru o lună de abonament ${role}?`, (key) => organizerBillingApi.subscribe(role, key), 'Abonamentul a fost actualizat.')}>{busy === `subscribe:${role}` ? 'Se procesează…' : account.memberships[role].active ? 'Reînnoiește' : 'Activează'}</button></article>)}</div>
      {config?.manual_funding.enabled && <section aria-label="Finanțare manuală credite servicii">
        <h3>Adaugă credite servicii prin NervixPay</h3>
        <p>Plata este verificată manual de operator și nu creditează automat contul. Creditele servicii nu sunt depozite ale jucătorilor și nu reprezintă Cash Chips. După verificare, activezi separat abonamentul; nu există reînnoire automată.</p>
        <p>Comerciant afișat: <strong>{config.manual_funding.merchant_display}</strong> (cont comun {config.manual_funding.settlement_account_display}). Active acceptate: {config.manual_funding.assets?.join(' sau ')}. Referința trimisă către NervixPay la click: <code>{fundingReference}</code>. Nu transmitem adresa ta de email.</p>
        <div className="mp-account-grid">{config.manual_funding.links.map((link) => <article key={link.amount_cents}><strong>{usd(link.amount_cents)}</strong><p>credite servicii, după reconcilierea chitanței</p><button type="button" className="mp-button mp-button-secondary" onClick={() => openFunding(link.url, link.amount_cents)}>Deschide plata {usd(link.amount_cents)}</button></article>)}</div>
        <p>După plată, păstrează chitanța și referința comenzii. Dacă soldul nu reflectă o plată verificată, contactează suportul platformei din pagina <a href="#/support">Suport</a> și include chitanța plus <code>{fundingReference}</code>.</p>
      </section>}
      <h3>Resurse găzduite</h3>
      {!account.tables.length && !account.tournaments.length ? <p>Nu ai încă mese sau turnee private.</p> : <ul className="mp-account-list">
        {account.tables.map((table) => { const spin = table.game === 'spingold'; const paid = !table.session?.active && Date.parse(table.session?.paid_until || '') > Date.now(); const start = starts[`spin:${table.id}`] || (table.schedule?.start_at ? localDateTime(table.schedule.start_at) : ''); return <li key={table.id}><div><strong>{table.name}</strong><p>{spin ? `Spin & Go · start ${when(table.schedule?.start_at)}` : `Cash · ${table.session?.active ? `activă, achitată până la ${when(table.session.paid_until)}` : paid ? `oprită, achitată până la ${when(table.session?.paid_until)}` : 'oprită'}`}</p></div>{spin ? <form onSubmit={(event: FormEvent) => { event.preventDefault(); const startAt = new Date(start).toISOString(); void run(`spin:${table.id}:${startAt}`, `Confirmi debitarea a ${usd(tariffs?.reschedule || 100)} pentru reprogramarea „${table.name}” la ${when(startAt)}?`, (key) => organizerBillingApi.reschedule('spin', table.id, startAt, key), 'Spin & Go a fost reprogramat.'); }}><input aria-label={`Start nou pentru ${table.name}`} className="admin-input" type="datetime-local" required value={start} disabled={!enforced || Boolean(table.schedule?.started_at)} onChange={(event) => setStarts((current) => ({ ...current, [`spin:${table.id}`]: event.target.value }))} /><button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || Boolean(table.schedule?.started_at)}>Reprogramează ({usd(tariffs?.reschedule || 100)})</button></form> : <button type="button" className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy)} onClick={() => table.session?.active ? void run(`cash-stop:${table.id}`, `Oprești masa „${table.name}”? Nu se fac rambursări; timpul deja achitat rămâne disponibil până la ${when(table.session.paid_until)}.`, () => organizerBillingApi.stopCash(table.id), 'Masa a fost oprită.') : void run(`cash-start:${table.id}`, paid ? `Reiei gratuit masa „${table.name}” în perioada deja achitată, până la ${when(table.session?.paid_until)}?` : `Confirmi pornirea mesei „${table.name}” și debitarea anticipată a ${usd(tariffs?.cash_start || tariffs?.cash_hour || 500)} pentru prima oră?`, (key) => organizerBillingApi.startCash(table.id, key), 'Masa a fost pornită.')}>{table.session?.active ? 'Oprește' : paid ? 'Reia gratuit' : `Pornește (${usd(tariffs?.cash_start || tariffs?.cash_hour || 500)})`}</button>}</li>; })}
        {account.tournaments.map((tournament) => { const start = starts[`tournament:${tournament.id}`] || localDateTime(tournament.start_at); return <li key={tournament.id}><div><strong>{tournament.name}</strong><p>Turneu · {tournament.status} · {when(tournament.start_at)}</p></div><form onSubmit={(event: FormEvent) => { event.preventDefault(); const startAt = new Date(start).toISOString(); void run(`tournament:${tournament.id}:${startAt}`, `Confirmi debitarea a ${usd(tariffs?.reschedule || 100)} pentru reprogramarea „${tournament.name}” la ${when(startAt)}?`, (key) => organizerBillingApi.reschedule('tournament', tournament.id, startAt, key), 'Turneul a fost reprogramat.'); }}><input aria-label={`Start nou pentru ${tournament.name}`} className="admin-input" type="datetime-local" required value={start} disabled={!enforced || tournament.status !== 'registering'} onChange={(event) => setStarts((current) => ({ ...current, [`tournament:${tournament.id}`]: event.target.value }))} /><button className="mp-button mp-button-secondary" disabled={!enforced || Boolean(busy) || tournament.status !== 'registering'}>Reprogramează ({usd(tariffs?.reschedule || 100)})</button></form></li>; })}
      </ul>}
      <h3>Istoric credite</h3>
      {!account.ledger?.length ? <p>Nicio operațiune înregistrată.</p> : <ul className="mp-account-list">{account.ledger.map((entry) => <li key={entry.id}><div className="mp-account-row"><strong>{entry.kind}</strong><strong>{entry.amount_cents > 0 ? '+' : ''}{usd(entry.amount_cents)}</strong></div><time>{when(entry.created_at)}{entry.resource_id ? ` · ${entry.resource_id}` : ''}</time></li>)}</ul>}
    </>}
  </section>;
}
