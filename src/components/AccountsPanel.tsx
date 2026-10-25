import { useRef, useState } from 'react';
import type { Account, TullipSnapshot } from '../domain/types';
import { accountBalances, dateKey, formatMoney, parseAmountToMinor } from '../domain/finance';
import { repository } from '../storage/repository';

export function AccountsPanel({ data, onChanged }: { data: TullipSnapshot; onChanged: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Account['kind']>('bank');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignAmount, setAssignAmount] = useState(''); const [assignDate, setAssignDate] = useState(dateKey());
  const [destination, setDestination] = useState(data.accounts?.find(account => account.kind === 'bank')?.id ?? '');
  const requestId = useRef(crypto.randomUUID());
  const balances = accountBalances(data);
  const legacyAvailable = balances.find(({ account }) => account.kind === 'legacy')?.availableMinor ?? 0;
  return <section className="card settings-form accounts-panel"><h2>Your accounts</h2>
    <p className="muted">Accounts hold money; UPI and cards describe how you pay. Nothing connects to your bank.</p>
    {accountBalances(data).map(({ account, balanceMinor, availableMinor, allocatedMinor, liabilityMinor }) => <div className="account-row" key={account.id}>
      <div><b>{account.name}</b><small>{account.kind === 'credit_card' ? 'Card liability' : 'Unallocated'} · {formatMoney(account.kind === 'credit_card' ? liabilityMinor : availableMinor, account.currency)}</small></div>
      <small>{account.kind !== 'credit_card' && <>Total {formatMoney(balanceMinor, account.currency)}<br/>Reserved {formatMoney(allocatedMinor, account.currency)}</>}</small>
    </div>)}
    <form className="inline-form wrap" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setError('');
      if (!name.trim() || [...name.trim()].length > 50) return setError('Use an account name between 1 and 50 characters.');
      try {
        setBusy(true); const stamp = new Date().toISOString();
        await repository().saveAccount({ id: crypto.randomUUID(), name: name.trim(), kind, currency: data.settings.currency, openingBalanceMinor: 0, createdAt: stamp, updatedAt: stamp });
        await onChanged(); setName('');
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this account.'); } finally { setBusy(false); }
    }}>
      <label>Account name<input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="e.g. Savings bank" /></label>
      <label>Account type<select value={kind} onChange={event => setKind(event.target.value as Account['kind'])}><option value="bank">Bank</option><option value="cash">Cash wallet</option><option value="credit_card">Credit card</option></select></label>
      <button className="secondary-button" disabled={busy}>Add account</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {legacyAvailable > 0 && <details className="legacy-assignment"><summary>Assign historical funds to an account</summary><p className="muted">{formatMoney(legacyAvailable, data.settings.currency)} belongs to older records without a source account. Explicitly assign some or all to a bank or cash account before using it for savings or new spending. The original records stay unchanged; this adds a reconciliation transfer with no income or expense.</p><form className="settings-form" onSubmit={async event => {
      event.preventDefault(); if (busy) return; const amountMinor = parseAmountToMinor(assignAmount);
      if (!amountMinor) return setError('Enter a positive amount of historical funds to assign.');
      try { setBusy(true); setError(''); await repository().reconcileLegacyFunds(destination, amountMinor, assignDate, 'Explicit historical account assignment', requestId.current); requestId.current = crypto.randomUUID(); await onChanged(); setAssignAmount(''); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not reconcile historical funds.'); } finally { setBusy(false); }
    }}><label>Amount to assign<input inputMode="decimal" value={assignAmount} onChange={event => setAssignAmount(event.target.value)} /></label><label>Account holding these funds<select value={destination} onChange={event => setDestination(event.target.value)}>{balances.filter(({ account }) => account.kind === 'bank' || account.kind === 'cash').map(({ account }) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Assignment date<input type="date" value={assignDate} required onChange={event => setAssignDate(event.target.value)} /></label><button className="secondary-button" disabled={busy}>Confirm account assignment</button></form></details>}
    <p className="muted">New accounts start at zero. Transfer money from another account, or record income. Paying a card bill is a transfer to the card, never a second expense.</p>
  </section>;
}
