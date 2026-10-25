import { useRef, useState } from 'react';
import { accountBalances, dateKey, formatDate, formatMoney, goalProgress, parseAmountToMinor } from '../domain/finance';
import type { SavingsContribution, TullipSnapshot, WishlistItem } from '../domain/types';
import { repository } from '../storage/repository';
import { AnimatedJar } from './AnimatedJar';
import { useDialog } from './useDialog';

const stamp = () => new Date().toISOString();
type MoneyAction = { item: WishlistItem; kind: 'allocation' | 'withdrawal'; editing?: SavingsContribution };

export function GoalsScreen({ data, onChanged, notice, onPurchase }: {
  data: TullipSnapshot; onChanged: () => Promise<void>; notice: (message: string) => void; onPurchase: (jarId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingGoal, setEditingGoal] = useState<WishlistItem | undefined>();
  const [name, setName] = useState(''); const [target, setTarget] = useState('');
  const [priority, setPriority] = useState<WishlistItem['priority']>('medium'); const [url, setUrl] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<MoneyAction | undefined>();
  const [showArchived, setShowArchived] = useState(false);
  const [historyId, setHistoryId] = useState<string | undefined>();
  const repo = repository();
  const goals = data.wishlistItems.filter(item => showArchived || item.status !== 'cancelled');
  const editGoal = (item?: WishlistItem) => {
    setEditingGoal(item); setCreating(true); setName(item?.name ?? ''); setTarget(item ? (item.targetMinor / 100).toFixed(2) : '');
    setPriority(item?.priority ?? 'medium'); setUrl(item?.url ?? ''); setError('');
  };
  return <>
    <section className="page-heading with-action"><div><p className="eyebrow">A LITTLE ROOM FOR YOUR WISHES</p><h1>Wish jar <span>♡</span></h1></div><button className="primary-button" data-tour="jar-create" onClick={() => editGoal()}>＋ Wish</button></section>
    <p className="page-note">Set money aside from an account. Release it when plans change, or link a real purchase. Savings allocations never increase your expenses.</p>
    {creating && <form className="card form-card" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setError(''); const targetMinor = parseAmountToMinor(target);
      if (!name.trim() || [...name.trim()].length > 60 || !targetMinor) return setError('Use a wish name up to 60 characters and a positive target amount.');
      try {
        setBusy(true); const time = stamp();
        const item: WishlistItem = { ...editingGoal, id: editingGoal?.id ?? crypto.randomUUID(), name: name.trim(), targetMinor, currency: editingGoal?.currency ?? data.settings.currency, priority, url: url.trim() || undefined, status: editingGoal?.status ?? 'saving', createdAt: editingGoal?.createdAt ?? time, updatedAt: time };
        await repo.put('wishlistItems', item); await onChanged(); setCreating(false); notice(editingGoal ? 'Wish updated. Your savings history stays intact.' : 'A new wish, ready when you are.');
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this wish.'); } finally { setBusy(false); }
    }}>
      <label>Wish name<input autoFocus value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="e.g. A comfy sofa" /></label>
      <label>Target price<input inputMode="decimal" value={target} onChange={event => setTarget(event.target.value)} placeholder="0.00" /></label>
      <label>Priority<select value={priority} onChange={event => setPriority(event.target.value as WishlistItem['priority'])}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label>Link (optional)<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" /></label>
      <div className="button-row"><button className="primary-button" disabled={busy}>{editingGoal ? 'Save wish' : 'Put in jar'}</button><button type="button" className="text-button" disabled={busy} onClick={() => setCreating(false)}>Cancel</button></div>
    </form>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <section className="goal-grid" aria-label="Savings goals">{goals.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority])).map((item, index) => {
      const progress = goalProgress(item, data.savingsContributions);
      const history = data.savingsContributions.filter(entry => entry.wishlistItemId === item.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
      const milestone = progress.percent >= 100 ? 'Wish fully funded' : progress.percent >= 75 ? 'Three quarters of the way' : progress.percent >= 50 ? 'Halfway to your wish' : progress.percent >= 25 ? 'A quarter of the way' : progress.savedMinor > 0 ? 'Your first little steps' : 'A wish waiting to grow';
      return <article className={`goal-card ${progress.percent >= 100 ? 'goal-achieved' : ''}`} key={item.id}>
        <div className="goal-card-heading"><span className={`priority ${item.priority}`}>{item.priority}</span><button className="text-button" onClick={() => editGoal(item)} aria-label={`Edit ${item.name}`}>Edit</button></div>
        <AnimatedJar name={item.name} savedMinor={progress.savedMinor} targetMinor={item.targetMinor} reducedMotion={data.settings.reducedMotion} />
        <h2>{item.name}</h2><p className="goal-milestone">{milestone} {progress.percent >= 100 ? '✦' : ''}</p>
        <p><b>{formatMoney(progress.savedMinor, item.currency)}</b> reserved <span>of {formatMoney(item.targetMinor, item.currency)}</span></p>
        <small>{formatMoney(progress.remainingMinor, item.currency)} remaining · {Math.round(progress.percent)}%</small>
        {progress.legacyMinor > 0 && <p className="legacy-note">Older planning history: {formatMoney(progress.legacyMinor, item.currency)}. This was never linked to an account and is separate from reserved savings.</p>}
        {item.status !== 'cancelled' && <>
          <button className="secondary-button full" data-tour={index === 0 ? 'jar-add' : undefined} onClick={() => setAction({ item, kind: 'allocation' })}>＋ Add saved amount</button>
          <div className="button-row goal-actions"><button className="secondary-button" data-tour={index === 0 ? 'jar-withdraw' : undefined} disabled={progress.savedMinor <= 0} onClick={() => setAction({ item, kind: 'withdrawal' })}>Remove money</button><button className="text-button" onClick={() => onPurchase(item.id)}>Record purchase</button></div>
        </>}
        <button className="text-button full" aria-expanded={historyId === item.id} onClick={() => setHistoryId(historyId === item.id ? undefined : item.id)}>{historyId === item.id ? 'Hide' : 'View'} savings history ({history.length})</button>
        {historyId === item.id && <div className="jar-history">{history.length ? history.map(entry => {
          const reversed = data.savingsContributions.some(other => other.reversesId === entry.id);
          const account = data.accounts?.find(account => account.id === entry.accountId);
          const reversible = entry.kind === 'allocation' || entry.kind === 'withdrawal';
          return <div className="history-entry" key={entry.id}><b>{entry.kind === 'allocation' ? 'Set aside' : entry.kind === 'withdrawal' ? 'Released' : entry.kind === 'purchase' ? 'Used for purchase' : entry.kind === 'reversal' ? 'Correction' : 'Legacy planning'} · {formatMoney(entry.amountMinor, item.currency)}</b><small>{formatDate(entry.date, data.settings.dateFormat)} · {account?.name ?? 'No original source account'}{entry.paymentMethodId ? ` · ${data.paymentMethods.find(method => method.id === entry.paymentMethodId)?.name ?? 'Payment method'}` : ''}</small>{entry.note && <p>{entry.note}</p>}{reversed && <small>Reversed — history retained</small>}{reversible && !reversed && <div className="button-row"><button className="text-button" onClick={() => setAction({ item, kind: entry.kind as 'allocation' | 'withdrawal', editing: entry })}>Correct</button><button className="text-button" onClick={async () => {
            if (!window.confirm('Reverse this savings entry? Its history stays visible. Later spending may prevent reversal.')) return;
            try { await repo.reverseSavingsEntry(entry.id, dateKey(), 'Reversed from wish history'); await onChanged(); notice('Savings entry reversed; balances reconciled.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not reverse this entry.'); }
          }}>Reverse</button></div>}</div>;
        }) : <p className="muted">No savings entries yet. Add a little when you are ready.</p>}</div>}
        <button className="text-button full" disabled={busy || progress.savedMinor > 0} onClick={async () => {
          const archive = item.status !== 'cancelled';
          if (archive && !window.confirm('Archive this empty jar? All history is kept, and you can restore it later.')) return;
          try { await repo.put('wishlistItems', { ...item, status: archive ? 'cancelled' : 'saving', updatedAt: stamp() }); await onChanged(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update this jar.'); }
        }}>{item.status === 'cancelled' ? 'Restore wish' : progress.savedMinor > 0 ? 'Release savings before archiving' : 'Archive wish'}</button>
      </article>;
    })}</section>
    {!goals.length && <div className="empty pixel-panel"><AnimatedJar savedMinor={0} targetMinor={1} decorative reducedMotion /><h2>Every wish starts somewhere</h2><p>Create a jar for something you love. Start with any amount, from money you have.</p><button className="secondary-button" onClick={() => editGoal()}>Add a wish</button></div>}
    {data.wishlistItems.some(item => item.status === 'cancelled') && <button className="text-button full" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide' : 'Show'} archived wishes</button>}
    {action && <SavingsModal data={data} action={action} onClose={() => setAction(undefined)} onSaved={async () => { await onChanged(); setAction(undefined); notice(action.kind === 'withdrawal' ? 'Money released back to your account.' : 'Money set aside for your wish.'); }} />}
  </>;
}

function SavingsModal({ data, action, onClose, onSaved }: { data: TullipSnapshot; action: MoneyAction; onClose: () => void; onSaved: () => Promise<void> }) {
  const { item, kind, editing } = action;
  const accounts = accountBalances(data).filter(({ account }) => account.kind !== 'credit_card' && account.kind !== 'legacy' && account.currency === item.currency);
  const [amount, setAmount] = useState(editing ? (editing.amountMinor / 100).toFixed(2) : '');
  const [accountId, setAccountId] = useState(editing?.accountId ?? accounts.find(entry => entry.availableMinor > 0)?.account.id ?? accounts[0]?.account.id ?? '');
  const [method, setMethod] = useState(editing?.paymentMethodId ?? 'bank-transfer');
  const [date, setDate] = useState(editing?.date ?? dateKey()); const [note, setNote] = useState(editing?.note ?? '');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const submitting = useRef(false);
  const dialogRef = useDialog<HTMLElement>(onClose, busy);
  const available = accounts.find(entry => entry.account.id === accountId)?.availableMinor ?? 0;
  const progress = goalProgress(item, data.savingsContributions);
  return <div className="modal-backdrop"><section ref={dialogRef} className="modal savings-modal" role="dialog" aria-modal="true" aria-labelledby="savings-title">
    <div className="modal-head"><div><p className="eyebrow">{item.name}</p><h2 id="savings-title">{editing ? 'Correct savings entry' : kind === 'allocation' ? 'A little more for your wish' : 'Release savings'}</h2></div><button className="close" aria-label="Close savings form" onClick={onClose} disabled={busy}>×</button></div>
    <p className="page-note">{kind === 'allocation' ? 'An allocation reserves your money. It is not an expense.' : 'A release returns reserved money to an account. It is not income.'}</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (submitting.current) return; setError(''); const amountMinor = parseAmountToMinor(amount);
      if (!amountMinor || !accountId || !date) return setError('Enter a positive amount, an account, and a valid date.');
      try {
        submitting.current = true; setBusy(true); const time = stamp();
        const entry: SavingsContribution = { id: crypto.randomUUID(), wishlistItemId: item.id, kind, amountMinor, accountId, paymentMethodId: method || undefined, date, note: note.trim(), createdAt: time, updatedAt: time };
        if (editing) await repository().editSavingsEntry(editing.id, entry); else await repository().saveSavingsEntry(entry);
        await onSaved();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save this savings entry.'); }
      finally { submitting.current = false; setBusy(false); }
    }}>
      <label className="amount-field">Amount<input autoFocus inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
      <label>{kind === 'allocation' ? 'Source account' : 'Destination account'}<select value={accountId} onChange={event => setAccountId(event.target.value)}>{accounts.map(({ account }) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <p className="money-hint">{kind === 'allocation' ? `Available unallocated: ${formatMoney(available, item.currency)}` : `Jar available: ${formatMoney(progress.savedMinor, item.currency)}`}</p>
      <label>Payment method (optional)<select value={method} onChange={event => setMethod(event.target.value)}><option value="">No method</option>{data.paymentMethods.filter(method => method.kind !== 'credit_card').map(method => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label>
      <label>Date<input type="date" value={date} onChange={event => setDate(event.target.value)} required /></label>
      <label>Note (optional)<input value={note} maxLength={300} onChange={event => setNote(event.target.value)} /></label>
      {editing && <p className="muted">Balances above show the current state. This correction reverses the original before checking the replacement. Both stay in history.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="text-button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save correction' : kind === 'allocation' ? 'Confirm allocation' : 'Confirm release'}</button></div>
    </form>
  </section></div>;
}
