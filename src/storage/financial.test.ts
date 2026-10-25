import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { BANK_ACCOUNT_ID as BANK, CASH_ACCOUNT_ID as CASH, LEGACY_ACCOUNT_ID as LEGACY, makeDefaultSettings } from '../domain/defaults';
import { accountBalances, budgetProgress, categorySpending, financialSummary, goalProgress, monthlyTotals, paymentBreakdown } from '../domain/finance';
import type { Account, Attachment, BackupFile, SavingsContribution, Transaction, WishlistItem } from '../domain/types';
import { BrowserRepository, V1_STORES } from './repository';

const opened: BrowserRepository[] = []; const names: string[] = [];
const stamp = '2026-11-01T00:00:00.000Z';
const goal = (id = 'phone', targetMinor = 4_000_000): WishlistItem => ({ id, name: id, targetMinor, currency: 'INR', priority: 'medium', status: 'saving', createdAt: stamp, updatedAt: stamp });
const tx = (id: string, type: Transaction['type'], amountMinor: number, accountId = BANK, date = '2026-11-01'): Transaction => ({
  id, type, amountMinor, accountId, date, currency: 'INR', categoryId: type === 'income' ? 'inc-salary' : 'exp-food',
  paymentMethodId: accountId === CASH ? 'cash' : accountId === 'card' ? 'credit-card' : 'upi', description: id, createdAt: stamp, updatedAt: stamp,
});
const entry = (id: string, amountMinor: number, kind: SavingsContribution['kind'] = 'allocation', accountId = BANK, date = '2026-11-02', jarId = 'phone'): SavingsContribution => ({
  id, wishlistItemId: jarId, amountMinor, kind, accountId, date, paymentMethodId: accountId === CASH ? 'cash' : 'upi', createdAt: stamp, updatedAt: stamp,
});
async function createRepository(name = `tullip-test-${crypto.randomUUID()}`) {
  names.push(name); const repo = new BrowserRepository(name); opened.push(repo); await repo.init(); return repo;
}
async function funded() {
  const repo = await createRepository(); await repo.put('wishlistItems', goal()); await repo.saveFinancialTransaction(tx('salary', 'income', 2_000_000)); return repo;
}
afterEach(async () => { opened.splice(0).forEach((repo) => repo.close()); for (const name of names.splice(0)) await Dexie.delete(name); });

describe('account-aware financial repository', () => {
  it('records salary once and reserves money for multiple jars without creating expenses or money', async () => {
    const repo = await funded(); await repo.put('wishlistItems', goal('sofa'));
    await repo.saveSavingsEntry(entry('phone-funding', 100_000)); await repo.saveSavingsEntry(entry('sofa-funding', 500_000, 'allocation', BANK, '2026-11-02', 'sofa'));
    const data = await repo.snapshot();
    expect(monthlyTotals(data.transactions, '2026-11')).toMatchObject({ incomeMinor: 2_000_000, expenseMinor: 0 });
    expect(accountBalances(data).find((row) => row.account.id === BANK)).toMatchObject({ balanceMinor: 2_000_000, availableMinor: 1_400_000, allocatedMinor: 600_000 });
    expect(financialSummary(data)).toMatchObject({ availableMinor: 1_400_000, allocatedMinor: 600_000, assetsMinor: 2_000_000, netWorthMinor: 2_000_000 });
  });
  it('withdraws partially to a different account, moves actual funds and never reports income', async () => {
    const repo = await funded(); await repo.saveSavingsEntry(entry('add', 100_000));
    await repo.saveSavingsEntry(entry('withdraw', 40_000, 'withdrawal', CASH, '2026-11-03'));
    const data = await repo.snapshot();
    expect(goalProgress(goal(), data.savingsContributions)).toMatchObject({ savedMinor: 60_000 });
    expect(accountBalances(data).find((row) => row.account.id === BANK)).toMatchObject({ balanceMinor: 1_960_000, allocatedMinor: 60_000, availableMinor: 1_900_000 });
    expect(accountBalances(data).find((row) => row.account.id === CASH)).toMatchObject({ balanceMinor: 40_000, availableMinor: 40_000 });
    expect(monthlyTotals(data.transactions, '2026-11').incomeMinor).toBe(2_000_000);
    expect(data.savingsContributions.find((row) => row.id === 'withdraw')?.fundingSplits).toEqual([{ accountId: BANK, amountMinor: 40_000 }]);
  });
  it('supports full withdrawal, later contribution, and persistence after closing and reopening', async () => {
    const name = `tullip-test-${crypto.randomUUID()}`; const repo = await createRepository(name);
    await repo.put('wishlistItems', goal()); await repo.saveFinancialTransaction(tx('salary', 'income', 200_000));
    await repo.saveSavingsEntry(entry('add', 100_000)); await repo.saveSavingsEntry(entry('all-out', 100_000, 'withdrawal', BANK, '2026-11-03'));
    expect(goalProgress(goal(), (await repo.snapshot()).savingsContributions).savedMinor).toBe(0);
    await repo.saveSavingsEntry(entry('again', 50_000, 'allocation', BANK, '2026-11-04')); repo.close();
    const reopened = await createRepository(name); const data = await reopened.snapshot();
    expect(goalProgress(goal(), data.savingsContributions).savedMinor).toBe(50_000); expect(data.savingsContributions).toHaveLength(3);
    expect(financialSummary(data).availableMinor).toBe(150_000);
  });
  it('keeps cash payments and UPI on their actual source accounts', async () => {
    const repo = await funded(); await repo.saveFinancialTransaction(tx('cash-income', 'income', 10_000, CASH));
    await repo.saveFinancialTransaction(tx('tea', 'expense', 2_000, CASH)); await repo.saveFinancialTransaction(tx('upi-shop', 'expense', 5_000));
    const data = await repo.snapshot(); expect(accountBalances(data).find((row) => row.account.id === CASH)?.availableMinor).toBe(8_000);
    expect(accountBalances(data).find((row) => row.account.id === BANK)?.availableMinor).toBe(1_995_000);
    await expect(repo.saveFinancialTransaction({ ...tx('bad-source', 'expense', 100), paymentMethodId: 'cash' })).rejects.toThrow('bank account');
  });
  it('rejects invalid paise, duplicate submissions, overdrafts and spending reserved funds', async () => {
    const repo = await funded(); for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) await expect(repo.saveSavingsEntry(entry(`bad-${invalid}`, invalid))).rejects.toThrow('integer paise');
    await repo.saveSavingsEntry(entry('reserve', 1_900_000)); await expect(repo.saveSavingsEntry(entry('reserve', 1_900_000))).rejects.toThrow('already saved');
    await expect(repo.saveFinancialTransaction(tx('overspend', 'expense', 100_001))).rejects.toThrow('insufficient');
    await expect(repo.saveSavingsEntry(entry('too-much', 1_900_001, 'withdrawal'))).rejects.toThrow('enough');
    expect((await repo.snapshot()).transactions).toHaveLength(1);
  });
  it('revalidates chronology for backdated allocations and income edits', async () => {
    const repo = await funded(); await expect(repo.saveSavingsEntry(entry('before-income', 1_000, 'allocation', BANK, '2026-10-31'))).rejects.toThrow('insufficient');
    await repo.saveSavingsEntry(entry('funded', 100_000));
    await expect(repo.saveFinancialTransaction(tx('salary', 'income', 2_000_000, BANK, '2026-11-03'))).rejects.toThrow('insufficient');
    await expect(repo.remove('transactions', 'salary')).rejects.toThrow('insufficient');
    expect((await repo.snapshot()).transactions[0].date).toBe('2026-11-01');
  });
  it('funds a purchase once, keeps unused allocation and reverses purchase funding atomically when removed', async () => {
    const repo = await funded(); await repo.saveSavingsEntry(entry('add', 100_000));
    await repo.saveJarPurchase(tx('phone-purchase', 'expense', 80_000, BANK, '2026-11-03'), 'phone', 60_000);
    let data = await repo.snapshot(); expect(goalProgress(goal(), data.savingsContributions).savedMinor).toBe(40_000);
    expect(monthlyTotals(data.transactions, '2026-11').expenseMinor).toBe(80_000);
    expect(accountBalances(data).find((row) => row.account.id === BANK)).toMatchObject({ balanceMinor: 1_920_000, allocatedMinor: 40_000, availableMinor: 1_880_000 });
    await repo.remove('transactions', 'phone-purchase'); data = await repo.snapshot();
    expect(monthlyTotals(data.transactions, '2026-11').expenseMinor).toBe(0); expect(goalProgress(goal(), data.savingsContributions).savedMinor).toBe(100_000);
    expect(data.transactions.find((row) => row.id === 'phone-purchase')?.voidedAt).toBeTruthy(); expect(data.savingsContributions.map((row) => row.kind).sort()).toEqual(['allocation', 'purchase', 'reversal']);
  });
  it('rejects jar purchases funded from a different account and rolls back invalid purchase metadata', async () => {
    const repo = await funded(); await repo.saveSavingsEntry(entry('add', 100_000));
    await expect(repo.saveJarPurchase(tx('cash-purchase', 'expense', 10_000, CASH, '2026-11-03'), 'phone', 10_000)).rejects.toThrow('does not hold enough');
    const invalidAttachment: Attachment = { id: 'invalid-clone', name: 'synthetic.png', mimeType: 'image/png', size: 1, dataUrl: (() => {}) as unknown as string, createdAt: stamp, updatedAt: stamp };
    await expect(repo.saveJarPurchase({ ...tx('rollback-purchase', 'expense', 10_000, BANK, '2026-11-03'), attachmentId: invalidAttachment.id }, 'phone', 10_000, invalidAttachment)).rejects.toBeTruthy();
    const data = await repo.snapshot(); expect(data.transactions).toHaveLength(1); expect(data.savingsContributions).toHaveLength(1); expect(data.attachments).toHaveLength(0);
  });
  it('edits allocations with append-only correction history and rolls back an invalid replacement', async () => {
    const repo = await funded(); const original = entry('original', 100_000); await repo.saveSavingsEntry(original);
    await repo.editSavingsEntry('original', entry('corrected', 80_000)); let data = await repo.snapshot();
    expect(data.savingsContributions.find((row) => row.id === 'original')).toEqual(original);
    expect(data.savingsContributions).toHaveLength(3); expect(goalProgress(goal(), data.savingsContributions).savedMinor).toBe(80_000);
    await expect(repo.editSavingsEntry('corrected', entry('too-large', 2_000_001))).rejects.toThrow('insufficient');
    expect((await repo.snapshot()).savingsContributions).toEqual(data.savingsContributions);
    await repo.reverseSavingsEntry('corrected', '2026-11-03', 'No longer needed'); data = await repo.snapshot(); expect(goalProgress(goal(), data.savingsContributions).savedMinor).toBe(0);
    await expect(repo.reverseSavingsEntry('corrected', '2026-11-03')).rejects.toThrow('already been reversed');
  });
  it('does not reverse a withdrawal after its destination funds were spent', async () => {
    const repo = await funded(); await repo.saveSavingsEntry(entry('add', 100_000)); await repo.saveSavingsEntry(entry('out', 50_000, 'withdrawal', CASH, '2026-11-03'));
    await repo.saveFinancialTransaction(tx('spent-cash', 'expense', 50_000, CASH, '2026-11-04'));
    await expect(repo.reverseSavingsEntry('out', '2026-11-05')).rejects.toThrow('insufficient'); expect((await repo.snapshot()).savingsContributions).toHaveLength(2);
  });
  it('counts a credit-card purchase once and bill payment as a transfer reducing cash and liability', async () => {
    const repo = await funded(); const card: Account = { id: 'card', name: 'Credit card', kind: 'credit_card', currency: 'INR', openingBalanceMinor: 0, createdAt: stamp, updatedAt: stamp }; await repo.saveAccount(card);
    await repo.saveFinancialTransaction(tx('card-purchase', 'expense', 50_000, 'card'));
    let data = await repo.snapshot(); expect(financialSummary(data)).toMatchObject({ availableMinor: 2_000_000, liabilitiesMinor: 50_000, netWorthMinor: 1_950_000 });
    await repo.saveFinancialTransaction({ ...tx('bill', 'transfer', 50_000), transferAccountId: 'card', paymentMethodId: 'bank-transfer' }); data = await repo.snapshot();
    expect(financialSummary(data)).toMatchObject({ availableMinor: 1_950_000, liabilitiesMinor: 0, netWorthMinor: 1_950_000 }); expect(monthlyTotals(data.transactions, '2026-11').expenseMinor).toBe(50_000);
  });
  it('serializes racing allocations so two screens cannot reserve the same money', async () => {
    const repo = await funded(); const results = await Promise.allSettled([repo.saveSavingsEntry(entry('one', 1_500_000)), repo.saveSavingsEntry(entry('two', 1_500_000))]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1); expect((await repo.snapshot()).savingsContributions).toHaveLength(1);
  });
  it('records cash and credit-card refunds as expense reversals, leaving salary income unchanged', async () => {
    const repo = await funded(); await repo.saveFinancialTransaction(tx('purchase', 'expense', 20_000, BANK));
    await repo.refundTransaction('purchase', 5_000, '2026-11-02', 'Partial return', 'refund-request');
    let data = await repo.snapshot(); expect(monthlyTotals(data.transactions, '2026-11')).toMatchObject({ incomeMinor: 2_000_000, expenseMinor: 15_000, netMinor: 1_985_000 });
    expect(categorySpending(data.transactions, data.categories, '2026-11')[0].amountMinor).toBe(15_000);
    expect(paymentBreakdown(data.transactions, data.paymentMethods, '2026-11')[0].amountMinor).toBe(15_000);
    expect(budgetProgress({ id: 'budget', month: '2026-11', amountMinor: 10_000, createdAt: stamp, updatedAt: stamp }, data.transactions, '2026-11').spentMinor).toBe(15_000);
    await expect(repo.refundTransaction('purchase', 1_000, '2026-11-02', '', 'refund-request')).rejects.toThrow('already saved');
    await expect(repo.refundTransaction('purchase', 15_001, '2026-11-02')).rejects.toThrow('cannot exceed');
    await expect(repo.refundTransaction('purchase', 1_000, '2026-10-31')).rejects.toThrow('on or after');
    await expect(repo.remove('transactions', 'purchase')).rejects.toThrow('linked refunds');
    await repo.saveAccount({ id: 'card', name: 'Card', kind: 'credit_card', currency: 'INR', openingBalanceMinor: 0, createdAt: stamp, updatedAt: stamp });
    await repo.saveFinancialTransaction(tx('card-buy', 'expense', 30_000, 'card')); await repo.refundTransaction('card-buy', 10_000, '2026-11-02');
    data = await repo.snapshot(); expect(financialSummary(data).liabilitiesMinor).toBe(20_000); expect(monthlyTotals(data.transactions, '2026-11').expenseMinor).toBe(35_000);
    await repo.remove('transactions', 'refund-request'); expect(monthlyTotals((await repo.snapshot()).transactions, '2026-11').expenseMinor).toBe(40_000);
  });
  it('keeps unlinked historical refund income as recorded and allows explicit later-month refunds', async () => {
    const repo = await funded(); await repo.saveFinancialTransaction(tx('purchase', 'expense', 20_000));
    await repo.saveFinancialTransaction({ ...tx('legacy-refund-income', 'income', 1_000), categoryId: 'inc-refund' });
    await repo.refundTransaction('purchase', 20_000, '2026-12-01'); const data = await repo.snapshot();
    expect(monthlyTotals(data.transactions, '2026-11').incomeMinor).toBe(2_001_000);
    expect(monthlyTotals(data.transactions, '2026-12')).toMatchObject({ incomeMinor: 0, expenseMinor: -20_000, netMinor: 20_000 });
  });
  it('assigns historical funds only by an explicit new transfer without altering historical records or cash flow', async () => {
    const repo = await funded(); const backup: BackupFile = { app: 'TULLIP', schemaVersion: 2, exportedAt: stamp, data: await repo.snapshot() };
    const oldIncome = { ...tx('old-salary', 'income', 50_000), accountId: undefined }; backup.data.transactions.push(oldIncome); await repo.mergeBackup(backup);
    const before = await repo.snapshot(); await repo.reconcileLegacyFunds(BANK, 30_000, '2026-11-02', 'Checked against bank balance', 'reconcile-once');
    const data = await repo.snapshot(); expect(data.transactions.find((row) => row.id === 'old-salary')).toEqual(oldIncome);
    expect(financialSummary(data).assetsMinor).toBe(financialSummary(before).assetsMinor); expect(monthlyTotals(data.transactions, '2026-11').incomeMinor).toBe(2_050_000);
    expect(accountBalances(data).find((row) => row.account.id === LEGACY)?.availableMinor).toBe(20_000); expect(accountBalances(data).find((row) => row.account.id === BANK)?.availableMinor).toBe(2_030_000);
    await expect(repo.reconcileLegacyFunds(BANK, 30_000, '2026-11-02')).rejects.toThrow('Historical funds are insufficient');
    await expect(repo.reconcileLegacyFunds(BANK, 1_000, '2026-11-02', '', 'reconcile-once')).rejects.toThrow('already saved');
  });
  it('retains goal history and prevents an orphaned funded jar', async () => {
    const repo = await funded(); await repo.saveSavingsEntry(entry('add', 10_000)); await expect(repo.remove('wishlistItems', 'phone')).rejects.toThrow('Withdraw all');
    await repo.saveSavingsEntry(entry('out', 10_000, 'withdrawal', BANK, '2026-11-03')); await repo.remove('wishlistItems', 'phone');
    const data = await repo.snapshot(); expect(data.wishlistItems[0].status).toBe('cancelled'); expect(data.savingsContributions).toHaveLength(2);
    await expect(repo.remove('savingsContributions', 'add')).rejects.toThrow('cannot be deleted');
  });
  it('validates opening-balance edits and prevents currency relabeling of existing money', async () => {
    const repo = await createRepository(); let settings = await repo.getSettings(); await repo.saveSettings({ ...settings, openingBalanceMinor: 10_000, displayName: '  Sam ✨  ' });
    await repo.put('wishlistItems', goal()); await repo.saveSavingsEntry(entry('add', 10_000)); settings = await repo.getSettings();
    expect(settings.displayName).toBe('Sam ✨'); await expect(repo.saveSettings({ ...settings, openingBalanceMinor: 5_000 })).rejects.toThrow('insufficient');
    await expect(repo.saveSettings({ ...settings, currency: 'USD' })).rejects.toThrow('cannot relabel');
  });
  it('accepts forty Unicode code points in a nickname and rejects controls and overlong names', async () => {
    const repo = await createRepository(); const settings = await repo.getSettings();
    await repo.saveSettings({ ...settings, displayName: '🌷'.repeat(40) }); expect((await repo.getSettings()).displayName).toBe('🌷'.repeat(40));
    await expect(repo.saveSettings({ ...settings, displayName: '🌷'.repeat(41) })).rejects.toThrow('40 characters');
    await expect(repo.saveSettings({ ...settings, displayName: 'One\nTwo' })).rejects.toThrow('one line');
  });
});

describe('versioned data migration and backup safety', () => {
  it('upgrades the actual v1 database without modifying records or reassigning historical money', async () => {
    const name = `tullip-v1-${crypto.randomUUID()}`; names.push(name); const old = new Dexie(name); old.version(1).stores(V1_STORES);
    const settings = makeDefaultSettings(); delete settings.onboardingCompleted; delete settings.walkthroughCompleted; delete settings.openingBalanceAccountId; settings.openingBalanceMinor = 25_000;
    const historical = { ...tx('historical-income', 'income', 100_000), accountId: undefined }; const oldContribution = { ...entry('old-planning', 50_000), kind: undefined, accountId: undefined };
    const orphan = { ...oldContribution, id: 'old-orphan', wishlistItemId: 'missing-old-jar' };
    await old.table('settings').put(settings); await old.table('transactions').put(historical); await old.table('wishlistItems').put(goal()); await old.table('savingsContributions').bulkPut([oldContribution, orphan]); old.close();
    const repo = await createRepository(name); const data = await repo.snapshot(); expect(data.transactions).toEqual([historical]); expect(data.savingsContributions).toEqual(expect.arrayContaining([oldContribution, orphan])); expect(data.savingsContributions).toHaveLength(2);
    expect(data.settings).toMatchObject({ onboardingCompleted: true, walkthroughCompleted: true, openingBalanceAccountId: LEGACY });
    expect(accountBalances(data).find((row) => row.account.id === LEGACY)?.availableMinor).toBe(125_000);
    expect(goalProgress(goal(), data.savingsContributions)).toMatchObject({ savedMinor: 0, legacyMinor: 50_000, percent: 0 });
    repo.close(); const reopened = await createRepository(name); expect((await reopened.snapshot()).transactions).toEqual([historical]); expect((await reopened.list('accounts'))).toHaveLength(3);
  });
  it('shows onboarding for a new install and persists all preferences after restart', async () => {
    const name = `tullip-new-${crypto.randomUUID()}`; const repo = await createRepository(name); const settings = await repo.getSettings(); expect(settings.onboardingCompleted).toBe(false);
    const saved = { ...settings, displayName: 'Élodie 🌷', dateFormat: 'YYYY-MM-DD' as const, weekStartsOn: 0 as const, reducedDecorations: true, reducedMotion: true, onboardingCompleted: true, walkthroughCompleted: true };
    await repo.saveSettings(saved); repo.close(); const reopened = await createRepository(name); expect(await reopened.getSettings()).toEqual(saved);
  });
  it('restores financial opening funds and currency into an empty journal while keeping personal display preferences', async () => {
    const source = await createRepository(); await source.saveSettings({ ...await source.getSettings(), currency: 'USD', openingBalanceMinor: 10_000, displayName: 'Source name' });
    await source.put('wishlistItems', { ...goal(), currency: 'USD' }); await source.saveSavingsEntry(entry('opening-reservation', 5_000));
    const backup: BackupFile = { app: 'TULLIP', schemaVersion: 2, exportedAt: stamp, data: await source.snapshot() };
    const destination = await createRepository(); await destination.saveSettings({ ...await destination.getSettings(), displayName: 'My chosen name', reducedMotion: true });
    await destination.mergeBackup(backup); const restored = await destination.snapshot();
    expect(restored.settings).toMatchObject({ currency: 'USD', openingBalanceMinor: 10_000, displayName: 'My chosen name', reducedMotion: true });
    expect(financialSummary(restored)).toMatchObject({ assetsMinor: 10_000, availableMinor: 5_000, allocatedMinor: 5_000 });
    const again = await destination.mergeBackup(backup); expect(again.imported).toBe(0); expect(financialSummary(await destination.snapshot())).toEqual(financialSummary(restored));
  });
  it('restores a v1 opening balance to unassigned funds in an empty journal, without forcing name or onboarding', async () => {
    const destination = await createRepository(); const data = await destination.snapshot(); delete data.accounts;
    data.settings = { ...data.settings, openingBalanceMinor: 25_000 }; delete data.settings.openingBalanceAccountId;
    const backup: BackupFile = { app: 'TULLIP', schemaVersion: 1, exportedAt: stamp, data }; await destination.mergeBackup(backup);
    const restored = await destination.snapshot(); expect(restored.settings.onboardingCompleted).toBe(false);
    expect(accountBalances(restored).find((row) => row.account.id === LEGACY)?.availableMinor).toBe(25_000);
  });
  it('merges old backups without duplicate IDs or replacing preferences and rejects broken account-aware history atomically', async () => {
    const repo = await funded(); const data = await repo.snapshot(); const backup: BackupFile = { app: 'TULLIP', schemaVersion: 2, exportedAt: stamp, data: structuredClone(data) };
    backup.data.transactions.push(tx('new-income', 'income', 5_000)); const first = await repo.mergeBackup(backup); expect(first.imported).toBe(1);
    expect((await repo.mergeBackup(backup)).imported).toBe(0);
    const invalid = structuredClone(backup); invalid.data.savingsContributions.push({ ...entry('broken', 100), wishlistItemId: 'no-goal' });
    await expect(repo.mergeBackup(invalid)).rejects.toThrow('no wish jar'); expect((await repo.snapshot()).savingsContributions).toHaveLength(0);
  });
});
