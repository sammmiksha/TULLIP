import { describe, expect, it } from 'vitest';
import { addMonths, budgetProgress, calendarDays, formatDate, goalProgress, monthlyTotals, parseAmountToMinor, totalsFor } from './finance';
import type { Budget, SavingsContribution, Transaction, WishlistItem } from './types';

const transaction = (id: string, type: Transaction['type'], amountMinor: number, date: string): Transaction => ({
  id, type, amountMinor, date, currency: 'INR', categoryId: 'food', paymentMethodId: 'upi', description: '', createdAt: '', updatedAt: ''
});

describe('financial calculations', () => {
  const records = [transaction('income', 'income', 1025, '2026-02-01'), transaction('expense', 'expense', 250, '2026-02-28'), transaction('transfer', 'transfer', 9900, '2026-02-20')];
  it('uses minor units and excludes transfers from cash-flow totals', () => expect(totalsFor(records)).toMatchObject({ incomeMinor: 1025, expenseMinor: 250, netMinor: 775, transactionCount: 2 }));
  it('scopes monthly totals by ISO date boundaries', () => expect(monthlyTotals([...records, transaction('march', 'expense', 200, '2026-03-01')], '2026-02').netMinor).toBe(775));
  it('parses valid two-decimal money without float loss', () => { expect(parseAmountToMinor('12.05')).toBe(1205); expect(parseAmountToMinor('12.999')).toBeNull(); });
  it('calculates budget overspend', () => { const b: Budget = { id: 'b', month: '2026-02', amountMinor: 200, createdAt: '', updatedAt: '' }; expect(budgetProgress(b, records, '2026-02')).toMatchObject({ spentMinor: 250, remainingMinor: -50 }); });
  it('tracks funded contributions separately from expenses and legacy planning', () => { const goal: WishlistItem = { id: 'g', name: 'Camera', targetMinor: 1000, currency: 'INR', priority: 'high', status: 'saving', createdAt: '', updatedAt: '' }; const savings: SavingsContribution[] = [{ id: 's', wishlistItemId: 'g', kind: 'allocation', accountId: 'bank', amountMinor: 500, date: '2026-02-02', createdAt: '', updatedAt: '' }]; expect(goalProgress(goal, savings)).toMatchObject({ savedMinor: 500, remainingMinor: 500, percent: 50 }); expect(goalProgress(goal, [{ ...savings[0], kind: undefined }])).toMatchObject({ savedMinor: 0, legacyMinor: 500 }); });
  it('makes leap-year calendar days and crosses year boundaries', () => { expect(calendarDays('2028-02', 1).some((day) => day.date === '2028-02-29')).toBe(true); expect(addMonths('2026-12', 1)).toBe('2027-01'); });
  it('honors the chosen date order instead of replacing it with the OS locale order', () => {
    expect(formatDate('2026-02-01', 'MM/DD/YYYY')).toBe('02/01/2026');
    expect(formatDate('2026-12-31', 'MM/DD/YYYY')).toBe('12/31/2026');
    expect(formatDate('2026-02-01', 'DD MMM YYYY')).toMatch(/^01 .+ 2026$/);
    expect(formatDate('2028-02-29', 'YYYY-MM-DD')).toBe('2028-02-29');
  });
});
