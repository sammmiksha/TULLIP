import { useMemo, useState } from 'react';
import { formatDate, formatMoney } from '../domain/finance';
import type { SavingsContribution, Transaction, TullipSnapshot } from '../domain/types';

export function TransactionRow({ transaction, data, onClick }: { transaction: Transaction; data: TullipSnapshot; onClick: () => void }) {
  const category = data.categories.find(item => item.id === transaction.categoryId);
  const method = data.paymentMethods.find(item => item.id === transaction.paymentMethodId);
  const account = data.accounts?.find(item => item.id === transaction.accountId);
  const destination = data.accounts?.find(item => item.id === transaction.transferAccountId);
  const purchase = data.savingsContributions.some(entry => entry.transactionId === transaction.id && entry.kind === 'purchase');
  const kind = transaction.refundOfTransactionId ? 'Refund' : transaction.type === 'transfer' ? 'Transfer' : purchase ? 'Jar purchase' : transaction.type === 'income' ? 'Income' : 'Expense';
  return <button className="transaction-row" onClick={onClick}>
    <span className="sticker" style={{ background: category?.color }} aria-hidden="true">{transaction.type === 'transfer' ? '↔' : category?.sticker ?? '✦'}</span>
    <span className="transaction-copy"><b>{transaction.description || transaction.merchant || category?.name || kind}</b><small>{kind} · {formatDate(transaction.date, data.settings.dateFormat)} · {account?.name ?? 'Legacy balance'}{destination ? ` → ${destination.name}` : ''}<br/>{method?.name ?? 'Unspecified method'}{transaction.attachmentId ? ' · receipt attached' : ''}</small></span>
    <strong className={transaction.refundOfTransactionId ? 'income' : transaction.type}>{transaction.type === 'expense' ? '−' : transaction.type === 'income' ? '+' : '↔'}{formatMoney(transaction.amountMinor, transaction.currency)}</strong>
  </button>;
}

type JournalType = 'all' | Transaction['type'] | 'allocation' | 'withdrawal' | 'reversal' | 'legacy' | 'refund';
type Row = { kind: 'transaction'; record: Transaction } | { kind: 'savings'; record: SavingsContribution };
export function TransactionsScreen({ data, onNew, onEdit, onDelete, onGoals }: {
  data: TullipSnapshot; onNew: (date?: string) => void; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void; onGoals: () => void;
}) {
  const [search, setSearch] = useState(''); const [type, setType] = useState<JournalType>('all');
  const [categoryId, setCategoryId] = useState(''); const [methodId, setMethodId] = useState(''); const [sort, setSort] = useState<'newest' | 'amount'>('newest');
  const shown = useMemo(() => {
    const term = search.toLocaleLowerCase();
    const financial: Row[] = data.transactions.filter(transaction => !transaction.voidedAt && (type === 'all' || (type === 'refund' ? !!transaction.refundOfTransactionId : transaction.type === type && !transaction.refundOfTransactionId)) && (!categoryId || transaction.categoryId === categoryId) && (!methodId || transaction.paymentMethodId === methodId) && `${transaction.description} ${transaction.merchant ?? ''}`.toLocaleLowerCase().includes(term)).map(record => ({ kind: 'transaction', record }));
    const savings: Row[] = categoryId ? [] : data.savingsContributions.filter(entry => entry.kind !== 'purchase' && (type === 'all' || type === (entry.kind ?? 'legacy')) && (!methodId || methodId === entry.paymentMethodId) && `${entry.note ?? ''} ${data.wishlistItems.find(item => item.id === entry.wishlistItemId)?.name ?? 'Original wish'}`.toLocaleLowerCase().includes(term)).map(record => ({ kind: 'savings', record }));
    return [...financial, ...savings].sort((a, b) => sort === 'amount' ? b.record.amountMinor - a.record.amountMinor : b.record.date.localeCompare(a.record.date) || b.record.createdAt.localeCompare(a.record.createdAt));
  }, [data, search, type, categoryId, methodId, sort]);
  return <>
    <section className="page-heading with-action"><div><p className="eyebrow">EVERYTHING RECORDED</p><h1>Journal <span>✦</span></h1></div><button className="primary-button" onClick={() => onNew()}>＋ Add</button></section>
    <section className="card filters"><input data-tour="journal-search" aria-label="Search descriptions, merchants or wishes" placeholder="Search notes, merchants or wishes" value={search} onChange={event => setSearch(event.target.value)} /><div>
      <select aria-label="Transaction type" value={type} onChange={event => setType(event.target.value as JournalType)}><option value="all">All activity</option><option value="expense">Expenses / purchases</option><option value="income">Income</option><option value="refund">Linked refunds</option><option value="transfer">Transfers</option><option value="allocation">Savings allocations</option><option value="withdrawal">Jar releases</option><option value="reversal">Savings corrections</option><option value="legacy">Legacy planning</option></select>
      <select aria-label="Category" value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">All categories</option>{data.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      <select aria-label="Payment method" value={methodId} onChange={event => setMethodId(event.target.value)}><option value="">All methods</option>{data.paymentMethods.map(method => <option key={method.id} value={method.id}>{method.name}</option>)}</select>
      <select aria-label="Sort transactions" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="newest">Newest first</option><option value="amount">Highest amount</option></select>
    </div></section>
    <section className="card transaction-list journal-list">{shown.length ? shown.map(row => row.kind === 'transaction' ? <div className="transaction-with-delete" key={`tx-${row.record.id}`}><TransactionRow transaction={row.record} data={data} onClick={() => onEdit(row.record)} /><button className="delete-mini" aria-label={`Delete ${row.record.description || 'transaction'}`} onClick={() => onDelete(row.record)}>×</button></div> : <button className="transaction-row savings-row" key={`saving-${row.record.id}`} onClick={onGoals}>
      <span className="sticker" aria-hidden="true">{row.record.kind === 'withdrawal' ? '←' : row.record.kind === 'reversal' ? '↩' : '♡'}</span><span className="transaction-copy"><b>{data.wishlistItems.find(item => item.id === row.record.wishlistItemId)?.name ?? 'Original wish'}</b><small>{row.record.kind === 'allocation' ? 'Savings allocation' : row.record.kind === 'withdrawal' ? 'Jar release' : row.record.kind === 'reversal' ? 'Savings correction' : 'Legacy planning'} · {formatDate(row.record.date, data.settings.dateFormat)}<br/>{data.accounts?.find(account => account.id === row.record.accountId)?.name ?? 'No original source account'}{row.record.note ? ` · ${row.record.note}` : ''}</small></span><strong className="transfer">{formatMoney(row.record.amountMinor, data.settings.currency)}</strong>
    </button>) : <div className="empty"><span aria-hidden="true">▣</span><p>{data.transactions.length || data.savingsContributions.length ? 'Nothing matches these filters.' : 'A fresh page for your money story.'}</p><button className="secondary-button" onClick={() => onNew()}>Record an entry</button></div>}</section>
  </>;
}
