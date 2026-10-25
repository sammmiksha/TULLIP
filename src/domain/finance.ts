import type { Budget, Category, PaymentMethod, SavingsContribution, Transaction, WishlistItem } from './types';
import { activeTransactions, savingsEffect } from './ledger';
export { accountBalances, financialSummary, allocatedByAccount, activeTransactions } from './ledger';

export interface PeriodTotals { incomeMinor: number; expenseMinor: number; netMinor: number; transactionCount: number; }

export const dateKey = (date = new Date()): string => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export const monthKey = (date = new Date()): string => dateKey(date).slice(0, 7);
export const isInMonth = (date: string, month: string) => date.startsWith(month);
export const includedTransactions = (transactions: Transaction[]) => activeTransactions(transactions).filter((t) => t.type !== 'transfer');

export function totalsFor(transactions: Transaction[]): PeriodTotals {
  const included = includedTransactions(transactions);
  const incomeMinor = included.filter((t) => t.type === 'income' && !t.refundOfTransactionId).reduce((total, t) => total + t.amountMinor, 0);
  const expenseMinor = included.reduce((total, t) => total + (t.type === 'expense' ? t.amountMinor : t.refundOfTransactionId ? -t.amountMinor : 0), 0);
  return { incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor, transactionCount: included.length };
}

export function monthlyTotals(transactions: Transaction[], month: string): PeriodTotals {
  return totalsFor(transactions.filter((transaction) => isInMonth(transaction.date, month)));
}

export function balanceThrough(transactions: Transaction[], openingBalanceMinor: number, through: string): number {
  return openingBalanceMinor + totalsFor(transactions.filter((transaction) => transaction.date <= through)).netMinor;
}

export function categorySpending(transactions: Transaction[], categories: Category[], month: string) {
  const names = new Map(categories.map((category) => [category.id, category]));
  const values = new Map<string, number>();
  activeTransactions(transactions).filter((t) => (t.type === 'expense' || t.refundOfTransactionId) && isInMonth(t.date, month)).forEach((t) => {
    values.set(t.categoryId, (values.get(t.categoryId) ?? 0) + (t.refundOfTransactionId ? -t.amountMinor : t.amountMinor));
  });
  return [...values.entries()].map(([categoryId, amountMinor]) => ({
    category: names.get(categoryId), categoryId, amountMinor
  })).sort((a, b) => b.amountMinor - a.amountMinor);
}

export function paymentBreakdown(transactions: Transaction[], methods: PaymentMethod[], month: string) {
  const names = new Map(methods.map((method) => [method.id, method.name]));
  const values = new Map<string, number>();
  activeTransactions(transactions).filter((t) => (t.type === 'expense' || t.refundOfTransactionId) && isInMonth(t.date, month)).forEach((t) => {
    values.set(t.paymentMethodId, (values.get(t.paymentMethodId) ?? 0) + (t.refundOfTransactionId ? -t.amountMinor : t.amountMinor));
  });
  return [...values.entries()].map(([id, amountMinor]) => ({ name: names.get(id) ?? 'Unknown', amountMinor })).sort((a, b) => b.amountMinor - a.amountMinor);
}

export function budgetProgress(budget: Budget, transactions: Transaction[], month: string) {
  const spentMinor = activeTransactions(transactions).filter((t) => (t.type === 'expense' || t.refundOfTransactionId) && isInMonth(t.date, month) && (!budget.categoryId || t.categoryId === budget.categoryId))
    .reduce((total, transaction) => total + (transaction.refundOfTransactionId ? -transaction.amountMinor : transaction.amountMinor), 0);
  return { spentMinor, remainingMinor: budget.amountMinor - spentMinor, percent: budget.amountMinor ? (spentMinor / budget.amountMinor) * 100 : 0 };
}

export function goalProgress(item: WishlistItem, contributions: SavingsContribution[]) {
  const entries = contributions.filter((contribution) => contribution.wishlistItemId === item.id);
  const savedMinor = entries.reduce((total, entry) => total + [...savingsEffect(entry, contributions).reserved.values()].reduce((sum, amount) => sum + amount, 0), 0);
  const legacyMinor = entries.filter((entry) => !entry.kind).reduce((sum, entry) => sum + entry.amountMinor, 0);
  return { savedMinor, legacyMinor, remainingMinor: Math.max(0, item.targetMinor - savedMinor), percent: item.targetMinor ? Math.max(0, Math.min(100, savedMinor / item.targetMinor * 100)) : 0 };
}

export function parseAmountToMinor(input: string, currency = 'INR'): number | null {
  const normalized = input.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function formatMoney(minor: number, currency = 'INR'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(minor / 100);
}

export function formatDate(iso: string, format: 'DD MMM YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' = 'DD MMM YYYY'): string {
  if (format === 'YYYY-MM-DD') return iso;
  const date = new Date(`${iso}T12:00:00`);
  if (format === 'MM/DD/YYYY') return new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' }).format(date);
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export interface CalendarDay { date: string; number: number; inMonth: boolean; isToday: boolean; }
export function calendarDays(month: string, weekStartsOn: 0 | 1): CalendarDay[] {
  const [year, numericMonth] = month.split('-').map(Number);
  const first = new Date(year, numericMonth - 1, 1);
  const last = new Date(year, numericMonth, 0);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const cells = Math.ceil((offset + last.getDate()) / 7) * 7;
  const start = new Date(year, numericMonth - 1, 1 - offset);
  const today = dateKey();
  return Array.from({ length: cells }, (_, index) => {
    const date = new Date(start); date.setDate(start.getDate() + index);
    const key = dateKey(date);
    return { date: key, number: date.getDate(), inMonth: date.getMonth() === numericMonth - 1, isToday: key === today };
  });
}

export function addMonths(month: string, amount: number): string {
  const [year, numericMonth] = month.split('-').map(Number);
  return dateKey(new Date(year, numericMonth - 1 + amount, 1)).slice(0, 7);
}
