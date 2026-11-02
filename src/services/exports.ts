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

interface StatementLine {
  date: string;
  accountId: string;
  account: string;
  description: string;
  reference: string;
  paymentMethod: string;
  debitMinor: number;
  creditMinor: number;
}

interface StatementEntry extends StatementLine { balanceMinor: number; }
interface Statement { entries: StatementEntry[]; opening: Map<string, number>; closing: Map<string, number>; accountNames: Map<string, string>; }

const HISTORICAL_ACCOUNT_ID = 'statement-historical-account';
const addTo = (amounts: Map<string, number>, key: string, value: number) => amounts.set(key, (amounts.get(key) ?? 0) + value);
const statementPeriod = (month?: string) => month ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`)) : 'All recorded entries';
const accountIdFor = (transaction: Transaction) => transaction.accountId ?? HISTORICAL_ACCOUNT_ID;

function statementFor(transactions: Transaction[], methods: PaymentMethod[], accounts: Account[] = [], month?: string, openingBalanceMinor = 0, openingBalanceAccountId?: string): Statement {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  accountNames.set(HISTORICAL_ACCOUNT_ID, 'Historical / unassigned');
  const methodNames = new Map(methods.map((method) => [method.id, method.name]));
  const lines: StatementLine[] = [];
  const nameFor = (id: string) => accountNames.get(id) ?? id;
  const addLine = (line: StatementLine) => { accountNames.set(line.accountId, line.account); lines.push(line); };
  activeTransactions(transactions).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).forEach((transaction) => {
    const sourceId = accountIdFor(transaction); const sourceName = nameFor(sourceId);
    const method = transaction.type === 'transfer' ? 'Internal transfer' : methodNames.get(transaction.paymentMethodId) ?? 'Unknown';
    const baseDescription = transaction.description || transaction.merchant || (transaction.type === 'income' ? 'Income received' : transaction.type === 'expense' ? 'Expense' : 'Transfer');
    const reference = transaction.id;
    if (transaction.type === 'transfer' && transaction.transferAccountId) {
      const destinationId = transaction.transferAccountId; const destinationName = nameFor(destinationId);
      addLine({ date: transaction.date, accountId: sourceId, account: sourceName, description: `Transfer to ${destinationName}${transaction.description ? ` - ${transaction.description}` : ''}`, reference, paymentMethod: method, debitMinor: transaction.amountMinor, creditMinor: 0 });
      addLine({ date: transaction.date, accountId: destinationId, account: destinationName, description: `Transfer from ${sourceName}${transaction.description ? ` - ${transaction.description}` : ''}`, reference, paymentMethod: method, debitMinor: 0, creditMinor: transaction.amountMinor });
      return;
    }
    if (transaction.type === 'transfer') {
      addLine({ date: transaction.date, accountId: sourceId, account: sourceName, description: `${baseDescription} (no balance movement)`, reference, paymentMethod: method, debitMinor: 0, creditMinor: 0 });
      return;
    }
    addLine({ date: transaction.date, accountId: sourceId, account: sourceName, description: `${transaction.refundOfTransactionId ? 'Refund - ' : ''}${baseDescription}`, reference, paymentMethod: method, debitMinor: transaction.type === 'expense' ? transaction.amountMinor : 0, creditMinor: transaction.type === 'income' ? transaction.amountMinor : 0 });
  });

  const initial = new Map(accounts.map((account) => [account.id, account.openingBalanceMinor]));
  if (openingBalanceMinor) addTo(initial, openingBalanceAccountId ?? accounts.find((account) => account.kind === 'bank')?.id ?? HISTORICAL_ACCOUNT_ID, openingBalanceMinor);
  const running = new Map(initial); const opening = new Map(initial); const entries: StatementEntry[] = [];
  const start = month ? `${month}-01` : '0000-01-01'; const end = month ? `${month}-31` : '9999-12-31';
  lines.forEach((line) => {
    if (line.date > end) return;
    const nextBalance = (running.get(line.accountId) ?? 0) + line.creditMinor - line.debitMinor;
    running.set(line.accountId, nextBalance);
    if (line.date < start) { opening.set(line.accountId, nextBalance); return; }
    entries.push({ ...line, balanceMinor: nextBalance });
  });
  return { entries, opening, closing: running, accountNames };
}

const statementAccountIds = (statement: Statement) => [...new Set([...statement.accountNames.keys(), ...statement.opening.keys(), ...statement.closing.keys()])]
  .filter((id) => statement.entries.some((entry) => entry.accountId === id) || (statement.opening.get(id) ?? 0) !== 0 || (statement.closing.get(id) ?? 0) !== 0);

export function csvForTransactions(transactions: Transaction[], categories: Category[], methods: PaymentMethod[], accounts: Account[] = [], month?: string, openingBalanceMinor = 0, openingBalanceAccountId?: string): string {
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const categoryFor = new Map(activeTransactions(transactions).filter((transaction) => transaction.type !== 'transfer').map((transaction) => [transaction.id, categoryName.get(transaction.categoryId) ?? 'Uncategorised']));
  const statement = statementFor(transactions, methods, accounts, month, openingBalanceMinor, openingBalanceAccountId);
  const currency = transactions[0]?.currency ?? accounts[0]?.currency ?? 'INR';
  const summaryRows = statementAccountIds(statement).map((id) => [statement.accountNames.get(id) ?? id, decimalMinor(statement.opening.get(id) ?? 0), decimalMinor(statement.closing.get(id) ?? 0), currency]);
  return csv([
    ['TULLIP CONSOLIDATED ACCOUNT STATEMENT'],
    ['Statement period', statementPeriod(month)],
    ['Generated at', new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())],
    [],
    ['ACCOUNT SUMMARY'],
    ['Account', 'Opening balance', 'Closing balance', 'Currency'],
    ...summaryRows,
    [],
    ['Date', 'Description', 'Reference', 'Account', 'Payment method', 'Category', 'Debit', 'Credit', 'Running balance', 'Currency'],
    ...statement.entries.map((entry) => [entry.date, entry.description, entry.reference, entry.account, entry.paymentMethod, categoryFor.get(entry.reference) ?? 'Transfer / unallocated', entry.debitMinor ? decimalMinor(entry.debitMinor) : '', entry.creditMinor ? decimalMinor(entry.creditMinor) : '', decimalMinor(entry.balanceMinor), currency]),
  ]);
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

function legacyPdfForMonth(month: string, transactions: Transaction[], categories: Category[], methods: PaymentMethod[], currency: string, accounts: Account[] = []): Blob {
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

export function pdfForMonth(month: string, transactions: Transaction[], categories: Category[], methods: PaymentMethod[], currency: string, accounts: Account[] = [], openingBalanceMinor = 0, openingBalanceAccountId?: string): Blob {
  const totals = monthlyTotals(transactions, month);
  const spending = categorySpending(transactions, categories, month);
  const statement = statementFor(transactions, methods, accounts, month, openingBalanceMinor, openingBalanceAccountId);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 12; const pageWidth = 210; const right = pageWidth - margin; let y = 29; let page = 1;
  const generatedAt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  const footer = () => { doc.setDrawColor(222, 210, 228); doc.line(margin, 286, right, 286); doc.setTextColor(110, 91, 122); doc.setFontSize(7); doc.text('TULLIP private money journal - consolidated account statement', margin, 291); doc.text(`Page ${page}`, right, 291, { align: 'right' }); };
  const header = () => {
    doc.setFillColor(58, 24, 84); doc.rect(0, 0, pageWidth, 20, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(15); doc.text('TULLIP', margin, 9);
    doc.setFontSize(7); doc.text('PRIVATE MONEY JOURNAL', margin, 14); doc.setTextColor(65, 39, 78); doc.setFontSize(13); doc.text('CONSOLIDATED ACCOUNT STATEMENT', margin, 26);
    doc.setTextColor(113, 92, 123); doc.setFontSize(7.5); doc.text(`Period: ${statementPeriod(month)}  |  Generated: ${generatedAt}`, margin, 30); y = 37;
  };
  const newPage = () => { footer(); doc.addPage(); page += 1; header(); };
  const ensure = (height: number) => { if (y + height > 281) { newPage(); return true; } return false; };
  const sectionTitle = (title: string) => { ensure(12); doc.setTextColor(65, 39, 78); doc.setFontSize(9); doc.text(title.toUpperCase(), margin, y); doc.setDrawColor(208, 187, 218); doc.line(margin, y + 2.5, right, y + 2.5); y += 8; };
  const amount = (value: number) => value ? formatMoney(value, currency) : '-';
  const accountIds = statementAccountIds(statement);
  const totalOpening = accountIds.reduce((sum, id) => sum + (statement.opening.get(id) ?? 0), 0);
  const totalClosing = accountIds.reduce((sum, id) => sum + (statement.closing.get(id) ?? 0), 0);
  const summaryCell = (x: number, label: string, value: string) => {
    doc.setFillColor(248, 243, 250); doc.setDrawColor(222, 210, 228); doc.roundedRect(x, y, 42, 17, 2, 2, 'FD');
    doc.setTextColor(111, 89, 123); doc.setFontSize(6.5); doc.text(label.toUpperCase(), x + 3, y + 5); doc.setTextColor(65, 39, 78); doc.setFontSize(9); doc.text(value, x + 3, y + 12);
  };
  const ledgerHeader = () => {
    ensure(8); doc.setFillColor(77, 45, 99); doc.rect(margin, y, right - margin, 6, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(6.4);
    doc.text('DATE', 14, y + 4); doc.text('DESCRIPTION', 36, y + 4); doc.text('REFERENCE', 96, y + 4); doc.text('DEBIT', 128, y + 4, { align: 'right' }); doc.text('CREDIT', 151, y + 4, { align: 'right' }); doc.text('BALANCE', right - 1, y + 4, { align: 'right' }); y += 9;
  };
  const accountRows = (accountId: string) => statement.entries.filter((entry) => entry.accountId === accountId);
  let activeAccountName = '';
  const ledgerRow = (entry: StatementEntry) => {
    const description = doc.splitTextToSize(entry.description, 56) as string[]; const rowHeight = Math.max(5.5, description.length * 3.1 + 1.5);
    if (ensure(rowHeight + 5)) { doc.setTextColor(111, 89, 123); doc.setFontSize(7); doc.text(`${activeAccountName} (continued)`, margin, y); y += 4; ledgerHeader(); } doc.setDrawColor(232, 224, 236); doc.line(margin, y + rowHeight, right, y + rowHeight); doc.setTextColor(72, 53, 81); doc.setFontSize(6.8);
    doc.text(entry.date, 14, y + 3.5); doc.text(description, 36, y + 3.5); doc.setTextColor(119, 97, 128); doc.setFontSize(6.3); doc.text(entry.reference.slice(-10), 96, y + 3.5);
    doc.setTextColor(72, 53, 81); doc.setFontSize(6.8); if (entry.debitMinor) doc.text(amount(entry.debitMinor), 128, y + 3.5, { align: 'right' }); if (entry.creditMinor) doc.text(amount(entry.creditMinor), 151, y + 3.5, { align: 'right' }); doc.text(amount(entry.balanceMinor), right - 1, y + 3.5, { align: 'right' }); y += rowHeight + 1;
  };

  header();
  sectionTitle('Monthly movement');
  summaryCell(margin, 'Income', amount(totals.incomeMinor)); summaryCell(margin + 46, 'Expenses', amount(totals.expenseMinor)); summaryCell(margin + 92, 'Net cash flow', amount(totals.netMinor)); summaryCell(margin + 138, 'Closing balance', amount(totalClosing)); y += 23;
  doc.setTextColor(111, 89, 123); doc.setFontSize(7); doc.text(`Opening balance: ${amount(totalOpening)}. ${totals.transactionCount} financial entries. Transfers appear in both affected accounts and are excluded from income and expenses.`, margin, y); y += 9;
  if (!accountIds.length) { sectionTitle('Account activity'); doc.setTextColor(111, 89, 123); doc.setFontSize(8); doc.text('No account movements were recorded for this period.', margin, y); y += 8; }
  accountIds.forEach((accountId) => {
    const rows = accountRows(accountId); ensure(20); sectionTitle(`Account: ${statement.accountNames.get(accountId) ?? accountId}`);
    activeAccountName = statement.accountNames.get(accountId) ?? accountId;
    doc.setTextColor(111, 89, 123); doc.setFontSize(7); doc.text(`Opening balance ${amount(statement.opening.get(accountId) ?? 0)}   |   Closing balance ${amount(statement.closing.get(accountId) ?? 0)}`, margin, y); y += 5; ledgerHeader();
    if (rows.length) rows.forEach(ledgerRow); else { doc.setTextColor(111, 89, 123); doc.setFontSize(7); doc.text('No movements in this account for the statement period.', margin, y); y += 7; }
    y += 4;
  });
  if (spending.length) {
    sectionTitle('Expense category summary');
    spending.forEach((entry) => { ensure(5); doc.setTextColor(72, 53, 81); doc.setFontSize(7.5); doc.text(entry.category?.name ?? 'Uncategorised', margin, y); doc.text(amount(entry.amountMinor), right, y, { align: 'right' }); y += 5; });
  }
  ensure(14); doc.setFillColor(248, 243, 250); doc.roundedRect(margin, y, right - margin, 11, 2, 2, 'F'); doc.setTextColor(92, 70, 103); doc.setFontSize(6.5); doc.text('Bank-style ledger for your own records. Jar allocations reserve money but do not move cash, so they are not ledger transactions.', margin + 4, y + 4.5); doc.text('TULLIP is local-only and does not connect to any bank.', margin + 4, y + 8);
  footer();
  return doc.output('blob');
}

export { downloadBlob } from './download';
