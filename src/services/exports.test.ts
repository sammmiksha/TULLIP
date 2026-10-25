import { describe, expect, it } from 'vitest';
import { csvForSavingsHistory, csvForTransactions, pdfForMonth } from './exports';
import type { Transaction } from '../domain/types';
import { makeDefaultSettings } from '../domain/defaults';

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

  it('neutralizes spreadsheet formulas, keeps exact integer paise and omits removed entries', () => {
    const transaction: Transaction = { id: 'safe-csv', type: 'expense', amountMinor: Number.MAX_SAFE_INTEGER, currency: 'INR', categoryId: '', paymentMethodId: '', date: '2026-11-01', description: '=HYPERLINK("https://example.invalid")', createdAt: '', updatedAt: '' };
    const output = csvForTransactions([transaction, { ...transaction, id: 'removed', description: 'REMOVED_RECORD', voidedAt: '2026-11-02' }], [], []);
    expect(output).toContain('90071992547409.91'); expect(output).toContain("'=HYPERLINK"); expect(output).not.toContain('REMOVED_RECORD');
  });

  it('exports savings history separately from cash flow with sources and reversals', () => {
    const output = csvForSavingsHistory({ accounts: [], transactions: [], categories: [], paymentMethods: [], budgets: [], wishlistItems: [], attachments: [], settings: makeDefaultSettings(), savingsContributions: [
      { id: 'allocation', wishlistItemId: 'jar', kind: 'allocation', accountId: 'bank', amountMinor: 12345, date: '2026-11-01', createdAt: '', updatedAt: '' },
      { id: 'release', wishlistItemId: 'jar', kind: 'withdrawal', accountId: 'cash', amountMinor: 100, fundingSplits: [{ accountId: 'bank', amountMinor: 100 }], date: '2026-11-02', createdAt: '', updatedAt: '' },
      { id: 'outside', wishlistItemId: 'jar', amountMinor: 100, date: '2026-10-31', createdAt: '', updatedAt: '' },
    ] }, '2026-11');
    expect(output).toContain('123.45'); expect(output).toContain('withdrawal'); expect(output).toContain('bank: 1.00'); expect(output).not.toContain('outside');
  });
});

describe('PDF export', () => {
  it('generates a complete monthly PDF and excludes other months', async () => {
    const current: Transaction = { id: 'pdf-current', type: 'expense', amountMinor: 12345, currency: 'INR', categoryId: 'food', paymentMethodId: 'upi', date: '2026-10-24', description: 'CURRENT_MONTH_RECORD', createdAt: '', updatedAt: '' };
    const outside: Transaction = { ...current, id: 'pdf-outside', date: '2026-09-30', description: 'OUTSIDE_MONTH_RECORD' };

    const blob = pdfForMonth('2026-10', [current, outside], [], [], 'INR');
    const content = new TextDecoder().decode(await blob.arrayBuffer());

    expect(blob.type).toBe('application/pdf');
    expect(content.startsWith('%PDF-')).toBe(true);
    expect(content.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(content).toContain('2026-10');
    expect(content).toContain('CURRENT_MONTH_RECORD');
    expect(content).not.toContain('OUTSIDE_MONTH_RECORD');
  });
});
