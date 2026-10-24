import { describe, expect, it } from 'vitest';
import type { BackupFile, EntityMap, EntityName, Transaction } from '../domain/types';
import { mergeInto, type Repository, validateBackup } from './repository';

const transaction = (id: string, amountMinor: number): Transaction => ({
  id, amountMinor, type: 'expense', currency: 'INR', categoryId: 'food', paymentMethodId: 'upi',
  date: '2026-10-24', description: '', createdAt: '', updatedAt: '',
});

const emptyBackup = (): BackupFile => ({
  app: 'TULLIP',
  schemaVersion: 1,
  exportedAt: '2026-10-24T00:00:00.000Z',
  data: {
    transactions: [], categories: [], paymentMethods: [], budgets: [],
    wishlistItems: [], savingsContributions: [], attachments: [],
    settings: {
      id: 'app', currency: 'INR', dateFormat: 'DD MMM YYYY', weekStartsOn: 1,
      openingBalanceMinor: 0, budgetWarningPercent: 80, reducedDecorations: false,
      reducedMotion: false, createdAt: '', updatedAt: '',
    },
  },
});

describe('backup validation', () => {
  it('accepts the local TULLIP v1 envelope when every entity list is present', () => {
    expect(() => validateBackup(emptyBackup())).not.toThrow();
  });

  it('rejects foreign, malformed, and incomplete files before a restore can start', () => {
    expect(() => validateBackup({ app: 'OTHER', schemaVersion: 1, data: {} })).toThrow('not a supported TULLIP backup');
    expect(() => validateBackup({ app: 'TULLIP', schemaVersion: 1, data: { transactions: [] } })).toThrow('Backup is missing categories');
    const withFractionalPaise = emptyBackup();
    withFractionalPaise.data.transactions.push(transaction('bad', 12.5));
    expect(() => validateBackup(withFractionalPaise)).toThrow('non-integer amountMinor');
  });

  it('does not import duplicate records contained in one backup', async () => {
    const backup = emptyBackup();
    backup.data.transactions.push(transaction('once', 100), transaction('once', 100));
    const savedIds: string[] = [];
    const repository: Repository = {
      init: async () => {},
      list: async <K extends EntityName>(_name: K) => [] as EntityMap[K][],
      put: async <K extends EntityName>(_name: K, item: EntityMap[K]) => { savedIds.push(item.id); },
      remove: async () => {},
      getSettings: async () => backup.data.settings,
      saveSettings: async () => {},
      snapshot: async () => backup.data,
      mergeBackup: async () => ({ imported: 0, skipped: 0 }),
    };

    await expect(mergeInto(repository, backup)).resolves.toEqual({ imported: 1, skipped: 1 });
    expect(savedIds).toEqual(['once']);
  });
});
