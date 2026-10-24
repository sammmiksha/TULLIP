import { jsPDF } from 'jspdf';
import { categorySpending, formatDate, formatMoney, monthlyTotals, paymentBreakdown } from '../domain/finance';
import type { Category, PaymentMethod, Transaction } from '../domain/types';

export function csvForTransactions(transactions: Transaction[], categories: Category[], methods: PaymentMethod[]): string {
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const methodName = new Map(methods.map((method) => [method.id, method.name]));
  const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ['Transaction date', 'Transaction type', 'Amount', 'Currency', 'Category', 'Payment method', 'Description', 'Merchant'];
  const rows = [...transactions].sort((a, b) => a.date.localeCompare(b.date)).map((transaction) => [
    transaction.date, transaction.type, (transaction.amountMinor / 100).toFixed(2), transaction.currency,
    categoryName.get(transaction.categoryId) ?? 'Unknown', methodName.get(transaction.paymentMethodId) ?? 'Unknown', transaction.description, transaction.merchant ?? ''
  ]);
  return [header, ...rows].map((row) => row.map(quote).join(',')).join('\r\n') + '\r\n';
}

export function pdfForMonth(month: string, transactions: Transaction[], categories: Category[], methods: PaymentMethod[], currency: string): Blob {
  const reportTransactions = transactions.filter((transaction) => transaction.date.startsWith(month));
  const totals = monthlyTotals(transactions, month);
  const spending = categorySpending(transactions, categories, month);
  const payments = paymentBreakdown(transactions, methods, month);
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const methodName = new Map(methods.map((method) => [method.id, method.name]));
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
    const prefix = `${formatDate(transaction.date)} • ${transaction.type.toUpperCase()} • ${formatMoney(transaction.amountMinor, transaction.currency)}`;
    line(`${prefix}\n${description} — ${categoryName.get(transaction.categoryId) ?? 'Unknown'} • ${methodName.get(transaction.paymentMethodId) ?? 'Unknown'}`, 8);
  });
  if (!reportTransactions.length) line('No transactions were recorded for this month.', 9, [100, 85, 115]);
  doc.setFontSize(9); doc.setTextColor(100, 85, 115); doc.text(`TULLIP monthly statement • page ${page}`, margin, 288);
  return doc.output('blob');
}

export function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fileName; link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}
