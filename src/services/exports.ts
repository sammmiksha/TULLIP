import { jsPDF } from 'jspdf';
import { activeTransactions, categorySpending, formatDate, formatMoney, monthlyTotals, paymentBreakdown } from '../domain/finance';
import type { Account, Category, PaymentMethod, Transaction, TullipSnapshot } from '../domain/types';

const decimalMinor = (minor: number) => { const integer = BigInt(minor); const absolute = integer < 0n ? -integer : integer; return `${integer < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`; };
const quote = (value: unknown) => {
  const text = String(value ?? '');
  // CSV quoting alone does not stop a spreadsheet interpreting a note as a formula.
  const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
const csv = (rows: unknown[][]) => rows.map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';

export function csvForTransactions(transactions: Transaction[], categories: Category[], methods: PaymentMethod[], accounts: Account[] = []): string {
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const methodName = new Map(methods.map((method) => [method.id, method.name]));
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const header = ['Transaction date', 'Transaction type', 'Amount', 'Currency', 'Category', 'Payment method', 'Description', 'Merchant', 'Account', 'Destination account', 'Entry ID'];
  const rows = activeTransactions(transactions).sort((a, b) => a.date.localeCompare(b.date)).map((transaction) => [
    transaction.date, transaction.refundOfTransactionId ? 'refund (expense reversal)' : transaction.type, decimalMinor(transaction.amountMinor), transaction.currency,
    categoryName.get(transaction.categoryId) ?? 'Unknown', methodName.get(transaction.paymentMethodId) ?? 'Unknown', transaction.description, transaction.merchant ?? '',
    transaction.accountId ? accountName.get(transaction.accountId) ?? transaction.accountId : 'Historical / unassigned', transaction.transferAccountId ? accountName.get(transaction.transferAccountId) ?? transaction.transferAccountId : '', transaction.id,
  ]);
  return csv([header, ...rows]);
}

export function csvForSavingsHistory(data: TullipSnapshot, month: string): string {
  const accounts = new Map((data.accounts ?? []).map((account) => [account.id, account.name]));
  const jars = new Map(data.wishlistItems.map((goal) => [goal.id, goal.name]));
  return csv([['Date', 'Kind', 'Jar', 'Amount', 'Currency', 'Account', 'Funding sources', 'Note', 'Linked purchase ID', 'Reverses entry ID', 'Entry ID'],
    ...data.savingsContributions.filter((entry) => entry.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date)).map((entry) => [
      entry.date, entry.kind ?? 'legacy planning (not allocated)', jars.get(entry.wishlistItemId) ?? 'Historical missing jar', decimalMinor(entry.amountMinor),
      data.wishlistItems.find((goal) => goal.id === entry.wishlistItemId)?.currency ?? data.settings.currency,
      entry.accountId ? accounts.get(entry.accountId) ?? entry.accountId : 'Unassigned',
      (entry.fundingSplits ?? []).map((split) => `${accounts.get(split.accountId) ?? split.accountId}: ${decimalMinor(split.amountMinor)}`).join('; '),
      entry.note ?? '', entry.transactionId ?? '', entry.reversesId ?? '', entry.id,
    ])]);
}

export function pdfForMonth(month: string, transactions: Transaction[], categories: Category[], methods: PaymentMethod[], currency: string, accounts: Account[] = []): Blob {
  const reportTransactions = activeTransactions(transactions).filter((transaction) => transaction.date.startsWith(month));
  const totals = monthlyTotals(transactions, month);
  const spending = categorySpending(transactions, categories, month);
  const payments = paymentBreakdown(transactions, methods, month);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const methodName = new Map(methods.map((method) => [method.id, method.name]));
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 16; const width = 210 - margin * 2; let y = 20; let page = 1;
  const nextPage = () => { doc.setFontSize(9); doc.text(`TULLIP monthly statement • page ${page}`, margin, 288); doc.addPage(); page++; y = 20; };
  const line = (text: string, fontSize = 10, color: [number, number, number] = [48, 24, 70]) => {
    doc.setTextColor(...color); doc.setFontSize(fontSize); const split = doc.splitTextToSize(text, width);
    if (y + split.length * (fontSize * 0.48) > 275) nextPage(); doc.text(split, margin, y); y += split.length * (fontSize * 0.48) + 3;
  };
  doc.setFillColor(55, 19, 95); doc.rect(0, 0, 210, 15, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.text('TULLIP  •  money journal', margin, 10);
  y = 26; line(`MONTHLY FINANCIAL STATEMENT  |  ${month}`, 14); line(`Generated ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`, 8, [100, 85, 115]);
  y += 2; line(`Income: ${formatMoney(totals.incomeMinor, currency)}     Expenses: ${formatMoney(totals.expenseMinor, currency)}     Net cash flow: ${formatMoney(totals.netMinor, currency)}`, 10);
  line(`Transactions included: ${totals.transactionCount}. Transfers are excluded from income and expense totals.`, 8, [100, 85, 115]);
  y += 3; line('SPENDING BY CATEGORY', 11); spending.length ? spending.forEach((entry) => line(`${entry.category?.name ?? 'Unknown'} — ${formatMoney(entry.amountMinor, currency)}`, 9)) : line('No expense transactions recorded.', 9, [100, 85, 115]);
  y += 2; line('PAYMENT METHOD BREAKDOWN', 11); payments.length ? payments.forEach((entry) => line(`${entry.name} — ${formatMoney(entry.amountMinor, currency)}`, 9)) : line('No expense transactions recorded.', 9, [100, 85, 115]);
  y += 2; line('TRANSACTIONS', 11);
  reportTransactions.sort((a, b) => a.date.localeCompare(b.date)).forEach((transaction) => {
    const description = transaction.description || transaction.merchant || 'Untitled entry';
    const prefix = `${formatDate(transaction.date)} • ${transaction.refundOfTransactionId ? 'REFUND' : transaction.type.toUpperCase()} • ${formatMoney(transaction.amountMinor, transaction.currency)}`;
    line(`${prefix}\n${description} — ${categoryName.get(transaction.categoryId) ?? 'Unknown'} • ${methodName.get(transaction.paymentMethodId) ?? 'Unknown'} • ${transaction.accountId ? accountName.get(transaction.accountId) ?? transaction.accountId : 'Historical / unassigned'}${transaction.transferAccountId ? ` to ${accountName.get(transaction.transferAccountId) ?? transaction.transferAccountId}` : ''}`, 8);
  });
  if (!reportTransactions.length) line('No transactions were recorded for this month.', 9, [100, 85, 115]);
  doc.setFontSize(9); doc.setTextColor(100, 85, 115); doc.text(`TULLIP monthly statement • page ${page}`, margin, 288);
  return doc.output('blob');
}

export { downloadBlob } from './download';
