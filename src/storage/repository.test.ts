import { describe, expect, it } from 'vitest';
import { validateBackup } from './repository';

describe('backup validation', () => {
  it('accepts the local TULLIP v1 envelope when every entity list is present', () => {
    const backup = {
      app: 'TULLIP',
      schemaVersion: 1,
      exportedAt: '2026-10-24T00:00:00.000Z',
      data: {
        transactions: [], categories: [], paymentMethods: [], budgets: [],
        wishlistItems: [], savingsContributions: [], attachments: [],
      },
    };

    expect(() => validateBackup(backup)).not.toThrow();
  });

  it('rejects foreign, malformed, and incomplete files before a restore can start', () => {
    expect(() => validateBackup({ app: 'OTHER', schemaVersion: 1, data: {} })).toThrow('not a supported TULLIP backup');
    expect(() => validateBackup({ app: 'TULLIP', schemaVersion: 1, data: { transactions: [] } })).toThrow('Backup is missing categories');
  });
});
