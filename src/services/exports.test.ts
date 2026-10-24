import { describe, expect, it } from 'vitest';
import { csvForTransactions } from './exports';
import type { Transaction } from '../domain/types';

describe('CSV export', () => {
  it('quotes commas, quotes, and linebreaks correctly', () => {
    const transaction: Transaction = { id: '1', type: 'expense', amountMinor: 1250, currency: 'INR', categoryId: 'food', paymentMethodId: 'upi', date: '2026-10-01', description: 'Lunch, "special"\nwith tea', createdAt: '', updatedAt: '' };
    expect(csvForTransactions([transaction], [{ id: 'food', name: 'Food', kind: 'expense', color: '', sticker: '', createdAt: '', updatedAt: '' }], [{ id: 'upi', name: 'UPI', kind: 'upi', createdAt: '', updatedAt: '' }])).toContain('"Lunch, ""special""\nwith tea"');
  });

  it('sorts an exported copy without changing the journal order in memory', () => {
    const newer: Transaction = { id: 'newer', type: 'expense', amountMinor: 100, currency: 'INR', categoryId: 'food', paymentMethodId: 'upi', date: '2026-10-02', description: '', createdAt: '', updatedAt: '' };
    const older: Transaction = { ...newer, id: 'older', date: '2026-10-01' };
    const journal = [newer, older];

    const csv = csvForTransactions(journal, [], []);

    expect(journal.map((transaction) => transaction.id)).toEqual(['newer', 'older']);
    expect(csv.indexOf('2026-10-01')).toBeLessThan(csv.indexOf('2026-10-02'));
  });
});
