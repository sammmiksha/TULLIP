import { useEffect, useRef, useState } from 'react';
import { accountBalances, dateKey, formatMoney, goalProgress, parseAmountToMinor } from '../domain/finance';
import type { Attachment, Transaction, TransactionType, TullipSnapshot } from '../domain/types';
import { eraseNativeReceipt, pickNativeReceipt, receiptDataUrl, storeReceipt } from '../services/attachments';
import { useDialog } from './useDialog';

export function TransactionModal({ data, transaction, date, jarId: initialJar, onClose, onSave, onRefund }: {
  data: TullipSnapshot; transaction?: Transaction; date?: string; jarId?: string; onClose: () => void;
  onSave: (transaction: Transaction, attachment?: Attachment, jarId?: string, fundedMinor?: number) => Promise<void>;
  onRefund?: (amountMinor: number, date: string, note: string, requestId: string) => Promise<void>;
}) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [amount, setAmount] = useState(transaction ? (transaction.amountMinor / 100).toFixed(2) : '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [accountId, setAccountId] = useState(transaction?.accountId ?? data.accounts?.find(account => account.kind === 'bank')?.id ?? '');
  const [transferAccountId, setTransferAccountId] = useState(transaction?.transferAccountId ?? '');
  const [paymentMethodId, setPaymentMethodId] = useState(transaction?.paymentMethodId ?? 'upi');
  const [day, setDay] = useState(transaction?.date ?? date ?? dateKey());
  const [description, setDescription] = useState(transaction?.description ?? ''); const [merchant, setMerchant] = useState(transaction?.merchant ?? '');
  const [file, setFile] = useState<File | Blob | null>(null); const [fileName, setFileName] = useState('');
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const submitting = useRef(false);
  const [jarId, setJarId] = useState(initialJar ?? ''); const [funded, setFunded] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | undefined>();
  const [refunding, setRefunding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialog<HTMLElement>(onClose, saving, refunding ? '[data-no-parent-modal]' : undefined);
  const accounts = accountBalances(data).filter(({ account }) => account.kind !== 'legacy' || transaction?.accountId === account.id);
  const source = accounts.find(entry => entry.account.id === accountId);
  const categories = data.categories.filter(category => category.kind === (type === 'income' ? 'income' : 'expense'));
  const jar = data.wishlistItems.find(item => item.id === jarId);
  const jarSaved = jar ? goalProgress(jar, data.savingsContributions).savedMinor : 0;
  const linkedPurchase = !!transaction && data.savingsContributions.some(entry => entry.transactionId === transaction.id && entry.kind === 'purchase');
  useEffect(() => { if (!categories.some(category => category.id === categoryId)) setCategoryId(categories[0]?.id ?? ''); }, [type, data.categories, categoryId]);
  const setAccount = (id: string) => {
    setAccountId(id); const kind = accounts.find(entry => entry.account.id === id)?.account.kind;
    setPaymentMethodId(kind === 'credit_card' ? 'credit-card' : kind === 'cash' ? 'cash' : 'upi');
  };
  if (transaction?.refundOfTransactionId) return <div className="modal-backdrop"><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="refund-view-title"><h2 id="refund-view-title">Linked refund</h2><p>{formatMoney(transaction.amountMinor, transaction.currency)} returned to its original account on {transaction.date}.</p><p className="page-note">This reduces expenses without creating income. To correct it, reverse the refund from the journal, then record a replacement.</p><button className="primary-button" onClick={onClose}>Close</button></section></div>;
  if (refunding && transaction && onRefund) return <RefundForm data={data} transaction={transaction} onBack={() => setRefunding(false)} onSave={onRefund} />;
  return <div className="modal-backdrop"><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="transaction-title">
    <div className="modal-head"><div><p className="eyebrow">{transaction ? 'EDIT ENTRY' : 'NEW ENTRY'}</p><h2 id="transaction-title">{type === 'income' ? 'A little win ✦' : type === 'transfer' ? 'Move your money' : 'Money moment'}</h2></div><button className="close" onClick={onClose} disabled={saving} aria-label="Close">×</button></div>
    <form onSubmit={async event => {
      event.preventDefault(); if (submitting.current) return; setError('');
      const amountMinor = parseAmountToMinor(amount);
      if (!amountMinor || !accountId || !paymentMethodId || !day || (type !== 'transfer' && !categoryId)) return setError('Choose a positive amount, account, date, category, and payment method.');
      if (type === 'transfer' && (!transferAccountId || transferAccountId === accountId)) return setError('Choose a different destination account.');
      const fundedMinor = jarId && type === 'expense' ? parseAmountToMinor(funded) : undefined;
      if (jarId && type === 'expense' && (!fundedMinor || fundedMinor > amountMinor || fundedMinor > jarSaved)) return setError(`Choose jar funding up to ${formatMoney(Math.min(jarSaved, amountMinor), jar?.currency ?? data.settings.currency)}. Pay any shortfall from unallocated funds, or clear the jar selection.`);
      let attachment: Attachment | undefined;
      try {
        submitting.current = true; setSaving(true);
        attachment = file ? await storeReceipt(file, fileName || 'receipt.jpg') : undefined;
        const time = new Date().toISOString();
        await onSave({ ...transaction, id: transaction?.id ?? crypto.randomUUID(), type, amountMinor, currency: transaction?.currency ?? source?.account.currency ?? data.settings.currency, categoryId: type === 'transfer' ? '' : categoryId, paymentMethodId, accountId, transferAccountId: type === 'transfer' ? transferAccountId : undefined, date: day, description: description.trim(), merchant: merchant.trim() || undefined, isRefund: type === 'income' && categoryId === 'inc-refund', attachmentId: attachment?.id ?? transaction?.attachmentId, createdAt: transaction?.createdAt ?? time, updatedAt: time }, attachment, type === 'expense' ? jarId || undefined : undefined, fundedMinor ?? undefined);
      } catch (caught) {
        if (attachment) await eraseNativeReceipt(attachment).catch(() => {});
        setError(caught instanceof Error ? caught.message : 'Could not save this transaction.');
      } finally { submitting.current = false; setSaving(false); }
    }}>
      <div className="type-toggle"><button type="button" className={type === 'expense' ? 'active expense' : ''} onClick={() => { setType('expense'); }}>− Expense</button><button type="button" className={type === 'income' ? 'active income' : ''} onClick={() => { setType('income'); setJarId(''); }}>＋ Income</button><button type="button" className={type === 'transfer' ? 'active' : ''} onClick={() => { setType('transfer'); setJarId(''); setPaymentMethodId('bank-transfer'); }}>↔ Transfer</button></div>
      <label className="amount-field">Amount<input autoFocus inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
      <label>{type === 'income' ? 'Receiving account' : 'Source account'}<select value={accountId} onChange={event => setAccount(event.target.value)}>{accounts.map(({ account }) => <option key={account.id} value={account.id}>{account.name}{account.kind === 'credit_card' ? ' (credit card)' : ''}</option>)}</select></label>
      {source && <p className="money-hint">{source.account.kind === 'credit_card' ? `Card liability: ${formatMoney(source.liabilityMinor, source.account.currency)}. Purchases increase this debt.` : `Available unallocated: ${formatMoney(source.availableMinor, source.account.currency)}`}</p>}
      {type === 'transfer' && <><label>Destination account<select value={transferAccountId} onChange={event => setTransferAccountId(event.target.value)}><option value="">Choose an account</option>{accounts.filter(({ account }) => account.id !== accountId).map(({ account }) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><p className="muted">Transfers and card bill payments change balances without creating income or a second expense.</p></>}
      <div className="form-two">{type !== 'transfer' && <label>Category<select value={categoryId} onChange={event => setCategoryId(event.target.value)}>{categories.map(category => <option key={category.id} value={category.id}>{category.sticker} {category.name}</option>)}</select></label>}<label>Payment<select value={paymentMethodId} onChange={event => setPaymentMethodId(event.target.value)}>{data.paymentMethods.map(method => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label></div>
      {type === 'expense' && !transaction && <><label>Fund from a wish jar (optional)<select value={jarId} onChange={event => { setJarId(event.target.value); setFunded(''); }}><option value="">Use unallocated money</option>{data.wishlistItems.filter(item => item.status !== 'cancelled').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{jar && <><label>Amount funded by {jar.name}<input inputMode="decimal" value={funded} onChange={event => setFunded(event.target.value)} placeholder="0.00" /></label><p className="money-hint">{formatMoney(jarSaved, jar.currency)} reserved in this jar. The remainder uses available funds. Jar funds must belong to the purchase's source account.</p></>}</>}
      {linkedPurchase && <p className="muted">This purchase uses jar funds. Financial changes are checked against its original funding. To change funding, delete the purchase to reverse it, then record a replacement. History is kept.</p>}
      {transaction?.type === 'expense' && onRefund && <button type="button" className="secondary-button" onClick={() => setRefunding(true)}>Record a linked refund</button>}
      <label>Date<input type="date" value={day} onChange={event => setDay(event.target.value)} required /></label>
      <label>Note<input value={description} onChange={event => setDescription(event.target.value)} maxLength={500} placeholder="What was this for?" /></label>
      <label>Merchant or payee <small>(optional)</small><input value={merchant} onChange={event => setMerchant(event.target.value)} maxLength={100} placeholder="Optional" /></label>
      <div className="attachment-row"><div><b>Receipt photo</b><small>{fileName || (transaction?.attachmentId ? 'Saved attachment' : 'Optional')}</small>{transaction?.attachmentId && <button type="button" className="text-button" onClick={async () => {
        try { const attachment = data.attachments.find(item => item.id === transaction.attachmentId); if (attachment) setReceiptPreview(await receiptDataUrl(attachment)); }
        catch { setError('The receipt file is not available on this device.'); }
      }}>View receipt</button>}</div><div><input ref={inputRef} type="file" accept="image/*" hidden onChange={event => { const selected = event.target.files?.[0]; if (selected) { setFile(selected); setFileName(selected.name); } }} /><button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>Choose</button><button type="button" className="icon-button" onClick={async () => {
        try { const result = await pickNativeReceipt(); if (result) { setFile(result.blob); setFileName(result.name); } } catch { setError('The photo picker was cancelled or could not open.'); }
      }} aria-label="Use Android photo picker">▣</button></div></div>
      {receiptPreview && <div className="receipt-preview"><img src={receiptPreview} alt="Attached receipt" /><button type="button" className="text-button" onClick={() => setReceiptPreview(undefined)}>Hide receipt</button></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="text-button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save entry'}</button></div>
    </form>
  </section></div>;
}

function RefundForm({ data, transaction, onBack, onSave }: { data: TullipSnapshot; transaction: Transaction; onBack: () => void; onSave: (amountMinor: number, date: string, note: string, requestId: string) => Promise<void> }) {
  const refunded = data.transactions.filter(entry => !entry.voidedAt && entry.refundOfTransactionId === transaction.id).reduce((sum, entry) => sum + entry.amountMinor, 0);
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(dateKey()); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const pending = useRef(false);
  const requestId = useRef(crypto.randomUUID()); const dialogRef = useDialog<HTMLElement>(onBack, busy);
  return <div className="modal-backdrop"><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="refund-title"><div className="modal-head"><h2 id="refund-title">A little money back</h2><button className="close" aria-label="Back to expense" disabled={busy} onClick={onBack}>×</button></div><p className="page-note">Up to {formatMoney(transaction.amountMinor - refunded, transaction.currency)} can return to the original account. This reduces expenses; it is not new income. Jar savings are not reallocated automatically.</p><form onSubmit={async event => {
    event.preventDefault(); if (pending.current) return; const amountMinor = parseAmountToMinor(amount);
    if (!amountMinor) return setError('Enter a positive refund amount with up to two decimals.');
    try { pending.current = true; setBusy(true); setError(''); await onSave(amountMinor, date, note.trim(), requestId.current); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not record this refund.'); } finally { pending.current = false; setBusy(false); }
  }}><label>Refund amount<input autoFocus inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label><label>Refund date<input type="date" value={date} min={transaction.date} required onChange={event => setDate(event.target.value)} /></label><label>Note (optional)<input value={note} maxLength={300} onChange={event => setNote(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="text-button" disabled={busy} onClick={onBack}>Back</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save refund'}</button></div></form></section></div>;
}
