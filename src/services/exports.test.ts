import { describe, expect, it } from 'vitest';
import { csvForTransactions } from './exports';
import type { Transaction } from '../domain/types';

describe('CSV export', () => {
  it('quotes commas, quotes, and linebreaks correctly', () => {
    const transaction: Transaction = { id: '1', type: 'expense', amountMinor: 1250, currency: 'INR', categoryId: 'food', paymentMethodId: 'upi', date: '2026-10-01', description: 'Lunch, "special"\nwith tea', createdAt: '', updatedAt: '' };
    expect(csvForTransactions([transaction], [{ id: 'food', name: 'Food', kind: 'expense', color: '', sticker: '', createdAt: '', updatedAt: '' }], [{ id: 'upi', name: 'UPI', kind: 'upi', createdAt: '', updatedAt: '' }])).toContain('"Lunch, ""special""\nwith tea"');
  });
});
