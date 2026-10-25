import { expect, it } from 'vitest';
import { calendarActivity } from './calendarActivity';
import type { Transaction } from '../domain/types';
const row: Transaction = { id: '1', type: 'expense', amountMinor: 100, currency: 'INR', categoryId: 'exp-food', paymentMethodId: 'upi', date: '2026-12-31', description: '', createdAt: '', updatedAt: '' };
it('keeps high-volume mixed dates to two markers and retains every selected-day entry', () => {
  const entries = Array.from({ length: 200 }, (_, index) => ({ ...row, id: String(index), type: index % 2 ? 'expense' as const : 'income' as const }));
  const day = calendarActivity(entries).get(row.date)!;
  expect(day).toMatchObject({ income: true, expense: true }); expect(day.entries).toHaveLength(200);
  expect(calendarActivity(entries).has('2027-01-01')).toBe(false);
});
it('updates after a deletion and treats a linked refund as an expense adjustment', () => {
  expect(calendarActivity([{ ...row, voidedAt: 'removed' }]).size).toBe(0);
  expect(calendarActivity([{ ...row, type: 'income', refundOfTransactionId: 'purchase' }]).get(row.date)).toMatchObject({ income: false, expense: true });
});
