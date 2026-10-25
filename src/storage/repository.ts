import Dexie from 'dexie';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, LEGACY_ACCOUNT_ID, makeDefaultAccounts, makeDefaultSettings } from '../domain/defaults';
import { accountsFor, assertDate, assertLedgerValid, assertPositiveMinor, fundingFor, requireAccount, validateTransaction } from '../domain/ledger';
import { goalProgress } from '../domain/finance';
import type { Account, AppSettings, Attachment, BackupFile, EntityMap, EntityName, SavingsContribution, Transaction, TullipSnapshot } from '../domain/types';

export const ENTITY_NAMES: EntityName[] = ['accounts', 'categories', 'paymentMethods', 'wishlistItems', 'transactions', 'budgets', 'savingsContributions', 'attachments'];
const V1_ENTITY_NAMES = ENTITY_NAMES.filter((name) => name !== 'accounts');
type Write = { name: EntityName; item: EntityMap[EntityName] };
const now = () => new Date().toISOString();

export interface Repository {
  init(): Promise<void>;
  list<K extends EntityName>(name: K): Promise<EntityMap[K][]>;
  put<K extends EntityName>(name: K, item: EntityMap[K]): Promise<void>;
  remove(name: EntityName, id: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  snapshot(): Promise<TullipSnapshot>;
  mergeBackup(backup: BackupFile): Promise<{ imported: number; skipped: number }>;
  saveFinancialTransaction(transaction: Transaction, attachment?: Attachment): Promise<void>;
  saveSavingsEntry(entry: SavingsContribution): Promise<void>;
  reverseSavingsEntry(id: string, date: string, note?: string): Promise<void>;
  editSavingsEntry(id: string, replacement: SavingsContribution): Promise<void>;
  saveJarPurchase(transaction: Transaction, jarId: string, fundedMinor: number, attachment?: Attachment): Promise<void>;
  saveAccount(account: Account): Promise<void>;
  refundTransaction(expenseId: string, amountMinor: number, date: string, note?: string, requestId?: string): Promise<void>;
  reconcileLegacyFunds(destinationAccountId: string, amountMinor: number, date: string, note?: string, requestId?: string): Promise<void>;
}

/** Historical transaction and contribution payloads are never rewritten. */
export function upgradeSettings(settings: AppSettings): AppSettings {
  return { ...settings, displayName: settings.displayName ?? '', onboardingCompleted: settings.onboardingCompleted ?? true,
    walkthroughCompleted: settings.walkthroughCompleted ?? true, openingBalanceAccountId: settings.openingBalanceAccountId ?? LEGACY_ACCOUNT_ID };
}
function replace<K extends EntityName>(data: TullipSnapshot, name: K, item: EntityMap[K]) {
  const values = (data[name] ?? []) as EntityMap[K][];
  (data as unknown as Record<string, unknown>)[name] = [...values.filter((row) => row.id !== item.id), item];
}

/** Serial mutations validate a fresh snapshot before one atomic database commit. */
export abstract class FinancialRepository implements Repository {
  private queue: Promise<unknown> = Promise.resolve();
  abstract init(): Promise<void>;
  abstract list<K extends EntityName>(name: K): Promise<EntityMap[K][]>;
  abstract getSettings(): Promise<AppSettings>;
  protected abstract writeBatch(writes: Write[], settings?: AppSettings): Promise<void>;
  protected abstract deleteReference(name: EntityName, id: string): Promise<void>;
  protected serialized<T>(operation: () => Promise<T>): Promise<T> {
    const running = this.queue.then(operation, operation); this.queue = running.catch(() => {}); return running;
  }
  async snapshot(): Promise<TullipSnapshot> { return this.serialized(() => this.readSnapshot()); }
  private async readSnapshot(): Promise<TullipSnapshot> {
    const [accounts, transactions, categories, paymentMethods, budgets, wishlistItems, savingsContributions, attachments, settings] = await Promise.all([
      this.list('accounts'), this.list('transactions'), this.list('categories'), this.list('paymentMethods'), this.list('budgets'),
      this.list('wishlistItems'), this.list('savingsContributions'), this.list('attachments'), this.getSettings(),
    ]);
    return { accounts, transactions, categories, paymentMethods, budgets, wishlistItems, savingsContributions, attachments, settings };
  }
  async put<K extends EntityName>(name: K, item: EntityMap[K]) {
    if (name === 'transactions') return this.saveFinancialTransaction(item as Transaction);
    if (name === 'savingsContributions') return this.saveSavingsEntry(item as SavingsContribution);
    if (name === 'accounts') return this.saveAccount(item as Account);
    return this.serialized(async () => {
      if (name === 'wishlistItems') {
        const goal = item as EntityMap['wishlistItems']; assertPositiveMinor(goal.targetMinor, 'Target');
        const data = await this.readSnapshot(); const existing = data.wishlistItems.find((row) => row.id === goal.id);
        if (!goal.name.trim() || goal.currency !== (existing?.currency ?? data.settings.currency)) throw new Error('Use a name and keep the wish jar’s recorded currency.');
        if (goal.status === 'cancelled' && goalProgress(goal, data.savingsContributions).savedMinor > 0) throw new Error('Withdraw all allocated savings before archiving this jar.');
      }
      if (name === 'budgets') assertPositiveMinor((item as EntityMap['budgets']).amountMinor, 'Budget');
      await this.writeBatch([{ name, item }]);
    });
  }
  async saveAccount(account: Account) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); const existing = accountsFor(data).find((row) => row.id === account.id);
      if (!account.name.trim() || account.name.trim().length > 80 || !['bank', 'cash', 'credit_card', 'legacy'].includes(account.kind)) throw new Error('Choose a valid account name and kind.');
      if (!Number.isSafeInteger(account.openingBalanceMinor) || account.currency !== data.settings.currency) throw new Error('Accounts use integer paise and the journal currency.');
      if (!existing && account.kind === 'legacy') throw new Error('The historical account is reserved for imported records.');
      if (existing && (account.kind !== existing.kind || account.currency !== existing.currency || account.openingBalanceMinor !== existing.openingBalanceMinor)) throw new Error('An existing account’s financial fields cannot be changed. Record a transfer or correction instead.');
      if (accountsFor(data).some((row) => row.id !== account.id && row.name.trim().toLocaleLowerCase() === account.name.trim().toLocaleLowerCase())) throw new Error('Choose a different account name.');
      const saved = { ...account, name: account.name.trim() }; replace(data, 'accounts', saved); assertLedgerValid(data);
      await this.writeBatch([{ name: 'accounts', item: saved }]);
    });
  }
  async saveSettings(settings: AppSettings) {
    return this.serialized(async () => {
      if (!Number.isSafeInteger(settings.openingBalanceMinor) || !['INR', 'USD', 'EUR', 'GBP'].includes(settings.currency)) throw new Error('Choose a supported currency and an integer opening balance.');
      if (Array.from((settings.displayName ?? '').trim()).length > 40) throw new Error('Display names can contain up to 40 characters.');
      if (/[\u0000-\u001f\u007f]/.test((settings.displayName ?? '').trim())) throw new Error('Keep your name on one line, without control characters.');
      const data = await this.readSnapshot(); const writes: Write[] = [];
      if (settings.currency !== data.settings.currency) {
        if (data.transactions.length || data.savingsContributions.length || data.wishlistItems.length || data.budgets.length || data.settings.openingBalanceMinor || accountsFor(data).some((row) => row.openingBalanceMinor)) throw new Error('Currency cannot relabel existing money or targets. Keep the recorded currency for this journal.');
        for (const account of accountsFor(data)) { const updated = { ...account, currency: settings.currency, updatedAt: now() }; replace(data, 'accounts', updated); writes.push({ name: 'accounts', item: updated }); }
      }
      const saved = { ...settings, displayName: (settings.displayName ?? '').trim() }; data.settings = saved;
      requireAccount(data, saved.openingBalanceAccountId ?? LEGACY_ACCOUNT_ID); assertLedgerValid(data);
      await this.writeBatch(writes, saved);
    });
  }
  async saveFinancialTransaction(transaction: Transaction, attachment?: Attachment) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); validateTransaction(data, transaction);
      const existing = data.transactions.find((row) => row.id === transaction.id);
      if (existing?.voidedAt) throw new Error('This entry has been removed. Create a new entry instead.');
      const linked = data.savingsContributions.find((row) => row.kind === 'purchase' && row.transactionId === transaction.id && !data.savingsContributions.some((reversal) => reversal.reversesId === row.id));
      if (linked && (transaction.accountId !== existing?.accountId || transaction.date !== existing?.date || transaction.amountMinor < linked.amountMinor || transaction.type !== 'expense')) throw new Error('Remove this linked purchase to reverse its jar funding before changing its date, account or funded amount.');
      replace(data, 'transactions', transaction); if (attachment) replace(data, 'attachments', attachment); assertLedgerValid(data);
      const writes: Write[] = [{ name: 'transactions', item: transaction }]; if (attachment) writes.push({ name: 'attachments', item: attachment });
      await this.writeBatch(writes);
    });
  }
  async refundTransaction(expenseId: string, amountMinor: number, date: string, note?: string, requestId: string = crypto.randomUUID()) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); assertPositiveMinor(amountMinor, 'Refund'); assertDate(date);
      if (data.transactions.some((row) => row.id === requestId)) throw new Error('This refund was already saved.');
      const original = data.transactions.find((row) => row.id === expenseId && row.type === 'expense' && !row.voidedAt);
      if (!original) throw new Error('Choose an active expense to refund.');
      const refund: Transaction = { id: requestId, type: 'income', isRefund: true, refundOfTransactionId: expenseId, amountMinor, accountId: original.accountId,
        currency: original.currency, categoryId: original.categoryId, paymentMethodId: original.paymentMethodId, date, description: note?.trim() || 'Purchase refund', createdAt: now(), updatedAt: now() };
      replace(data, 'transactions', refund); assertLedgerValid(data); await this.writeBatch([{ name: 'transactions', item: refund }]);
    });
  }
  async reconcileLegacyFunds(destinationAccountId: string, amountMinor: number, date: string, note?: string, requestId: string = crypto.randomUUID()) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); assertPositiveMinor(amountMinor, 'Assignment'); assertDate(date); requireAccount(data, destinationAccountId, true);
      if (data.transactions.some((row) => row.id === requestId)) throw new Error('This historical balance assignment was already saved.');
      if (data.transactions.some((row) => !row.voidedAt && !row.accountId && row.currency !== data.settings.currency)) throw new Error('Historical records contain another currency. Review them before assigning balances.');
      const transfer: Transaction = { id: requestId, type: 'transfer', legacyReconciliation: true, accountId: LEGACY_ACCOUNT_ID, transferAccountId: destinationAccountId,
        amountMinor, currency: data.settings.currency, categoryId: '', paymentMethodId: 'bank-transfer', date, description: note?.trim() || 'Assign historical balance', createdAt: now(), updatedAt: now() };
      validateTransaction(data, transfer); replace(data, 'transactions', transfer); assertLedgerValid(data); await this.writeBatch([{ name: 'transactions', item: transfer }]);
    });
  }
  private prepareSavings(data: TullipSnapshot, entry: SavingsContribution): SavingsContribution {
    assertPositiveMinor(entry.amountMinor); assertDate(entry.date);
    if (data.savingsContributions.some((row) => row.id === entry.id)) throw new Error('This savings entry was already saved. Use a correction to edit history.');
    const goal = data.wishlistItems.find((row) => row.id === entry.wishlistItemId);
    if (!goal || goal.status === 'cancelled' || goal.currency !== data.settings.currency) throw new Error('Choose an active wish jar using the journal currency.');
    requireAccount(data, entry.accountId, true);
    if (entry.kind !== 'allocation' && entry.kind !== 'withdrawal') throw new Error('Choose an allocation or withdrawal. Historical entries cannot be rewritten.');
    if (entry.paymentMethodId && !data.paymentMethods.some((method) => method.id === entry.paymentMethodId)) throw new Error('Choose a valid payment method.');
    const saved = { ...entry, reversesId: undefined, transactionId: undefined, fundingSplits: entry.kind === 'withdrawal' ? fundingFor(data, entry.wishlistItemId, entry.amountMinor, entry.date) : undefined };
    replace(data, 'savingsContributions', saved); return saved;
  }
  private goalWrite(data: TullipSnapshot, jarId: string): Write {
    const goal = data.wishlistItems.find((row) => row.id === jarId)!;
    const progress = goalProgress(goal, data.savingsContributions);
    const updated = { ...goal, status: goal.status === 'cancelled' ? 'cancelled' as const : progress.percent >= 100 ? 'achieved' as const : 'saving' as const, updatedAt: now() };
    replace(data, 'wishlistItems', updated); return { name: 'wishlistItems', item: updated };
  }
  async saveSavingsEntry(entry: SavingsContribution) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); const saved = this.prepareSavings(data, entry); assertLedgerValid(data);
      await this.writeBatch([{ name: 'savingsContributions', item: saved }, this.goalWrite(data, entry.wishlistItemId)]);
    });
  }
  private reversal(data: TullipSnapshot, id: string, date: string, note?: string, linkedPurchase = false): SavingsContribution {
    const original = data.savingsContributions.find((row) => row.id === id);
    if (!original?.kind || original.kind === 'reversal') throw new Error('Only account-aware savings entries can be reversed. Historical planning entries stay unchanged.');
    if (original.kind === 'purchase' && !linkedPurchase) throw new Error('Remove the linked expense to reverse both the purchase and its jar funding together.');
    if (data.savingsContributions.some((row) => row.reversesId === id)) throw new Error('This savings entry has already been reversed.');
    const entry: SavingsContribution = { id: crypto.randomUUID(), wishlistItemId: original.wishlistItemId, kind: 'reversal', amountMinor: original.amountMinor,
      accountId: original.accountId, date, note: note?.trim(), reversesId: original.id, createdAt: now(), updatedAt: now() };
    replace(data, 'savingsContributions', entry); return entry;
  }
  async reverseSavingsEntry(id: string, date: string, note?: string) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); const entry = this.reversal(data, id, date, note); assertLedgerValid(data);
      await this.writeBatch([{ name: 'savingsContributions', item: entry }, this.goalWrite(data, entry.wishlistItemId)]);
    });
  }
  async editSavingsEntry(id: string, replacement: SavingsContribution) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); const original = data.savingsContributions.find((row) => row.id === id);
      if (!original || original.wishlistItemId !== replacement.wishlistItemId || original.kind !== replacement.kind) throw new Error('A correction must keep the same jar and entry kind.');
      const reversal = this.reversal(data, id, original.date, 'Correction: replaced by a new history entry.');
      const saved = this.prepareSavings(data, replacement); assertLedgerValid(data);
      await this.writeBatch([{ name: 'savingsContributions', item: reversal }, { name: 'savingsContributions', item: saved }, this.goalWrite(data, saved.wishlistItemId)]);
    });
  }
  async saveJarPurchase(transaction: Transaction, jarId: string, fundedMinor: number, attachment?: Attachment) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); validateTransaction(data, transaction); assertPositiveMinor(fundedMinor, 'Jar-funded amount');
      if (transaction.type !== 'expense' || transaction.amountMinor < fundedMinor || data.transactions.some((row) => row.id === transaction.id)) throw new Error('Link a new expense and fund no more than its purchase amount.');
      requireAccount(data, transaction.accountId, true);
      const goal = data.wishlistItems.find((row) => row.id === jarId);
      if (!goal || goal.status === 'cancelled') throw new Error('Choose an active wish jar.');
      const entry: SavingsContribution = { id: crypto.randomUUID(), wishlistItemId: jarId, kind: 'purchase', amountMinor: fundedMinor,
        accountId: transaction.accountId, paymentMethodId: transaction.paymentMethodId, transactionId: transaction.id, date: transaction.date,
        fundingSplits: fundingFor(data, jarId, fundedMinor, transaction.date, transaction.accountId), note: transaction.description, createdAt: now(), updatedAt: now() };
      replace(data, 'transactions', transaction); replace(data, 'savingsContributions', entry); if (attachment) replace(data, 'attachments', attachment); assertLedgerValid(data);
      const writes: Write[] = [{ name: 'transactions', item: transaction }, { name: 'savingsContributions', item: entry }, this.goalWrite(data, jarId)];
      if (attachment) writes.push({ name: 'attachments', item: attachment });
      await this.writeBatch(writes);
    });
  }
  async remove(name: EntityName, id: string) {
    return this.serialized(async () => {
      const data = await this.readSnapshot(); const writes: Write[] = [];
      if (name === 'transactions') {
        const transaction = data.transactions.find((row) => row.id === id); if (!transaction || transaction.voidedAt) return;
        if (data.transactions.some((row) => !row.voidedAt && row.refundOfTransactionId === id)) throw new Error('Remove linked refunds before removing the original expense.');
        const voided = { ...transaction, voidedAt: now(), updatedAt: now() }; replace(data, name, voided); writes.push({ name, item: voided });
        for (const purchase of data.savingsContributions.filter((row) => row.kind === 'purchase' && row.transactionId === id && !data.savingsContributions.some((reversal) => reversal.reversesId === row.id))) {
          const entry = this.reversal(data, purchase.id, purchase.date, 'Linked purchase removed.', true); writes.push({ name: 'savingsContributions', item: entry }, this.goalWrite(data, entry.wishlistItemId));
        }
        assertLedgerValid(data);
      } else if (name === 'wishlistItems') {
        const goal = data.wishlistItems.find((row) => row.id === id); if (!goal) return;
        if (goalProgress(goal, data.savingsContributions).savedMinor > 0) throw new Error('Withdraw all allocated savings before archiving this jar. Its history will be kept.');
        writes.push({ name, item: { ...goal, status: 'cancelled', updatedAt: now() } });
      } else if (name === 'savingsContributions') throw new Error('Savings history cannot be deleted. Use a reversal or correction.');
      else if (name === 'accounts') throw new Error('Accounts are kept so historical money always has a source.');
      else {
        if (name === 'categories' && (data.transactions.some((row) => row.categoryId === id) || data.budgets.some((row) => row.categoryId === id))) throw new Error('This category is used by recorded transactions or budgets.');
        if (name === 'paymentMethods' && (data.transactions.some((row) => row.paymentMethodId === id) || data.savingsContributions.some((row) => row.paymentMethodId === id))) throw new Error('This payment method is used by recorded history.');
        if (name === 'attachments' && data.transactions.some((row) => row.attachmentId === id)) throw new Error('This attachment is referenced by journal history.');
        await this.deleteReference(name, id); return;
      }
      await this.writeBatch(writes);
    });
  }
  async mergeBackup(backup: BackupFile) {
    return this.serialized(async () => {
      validateBackup(backup); const data = await this.readSnapshot(); const candidate = structuredClone(data); const writes: Write[] = []; let skipped = 0;
      const empty = !data.transactions.length && !data.savingsContributions.length && !data.wishlistItems.length && !data.budgets.length && data.settings.openingBalanceMinor === 0 && accountsFor(data).every((row) => row.openingBalanceMinor === 0);
      let financialSettings: AppSettings | undefined;
      if (empty) {
        financialSettings = { ...data.settings, currency: backup.data.settings.currency, openingBalanceMinor: backup.data.settings.openingBalanceMinor,
          openingBalanceAccountId: backup.data.settings.openingBalanceAccountId ?? LEGACY_ACCOUNT_ID, updatedAt: now() };
        candidate.settings = financialSettings;
        for (const account of accountsFor(candidate)) {
          const source = backup.data.accounts?.find((row) => row.id === account.id);
          if (source && source.kind !== account.kind) throw new Error('A backup conflicts with a built-in account kind. No data was changed.');
          const updated = { ...account, currency: financialSettings.currency, openingBalanceMinor: source?.openingBalanceMinor ?? account.openingBalanceMinor, updatedAt: now() };
          replace(candidate, 'accounts', updated); writes.push({ name: 'accounts', item: updated });
        }
      }
      for (const name of ENTITY_NAMES) {
        const existing = new Set((candidate[name] ?? []).map((item) => item.id));
        for (const item of backup.data[name] ?? []) {
          if (existing.has(item.id)) { skipped++; continue; }
          replace(candidate, name, item); existing.add(item.id); writes.push({ name, item });
        }
      }
      for (const write of writes) {
        if (write.name === 'transactions' && (write.item as Transaction).accountId) validateTransaction(candidate, write.item as Transaction);
        if (write.name === 'accounts') {
          const account = write.item as Account;
          if (!['bank', 'cash', 'credit_card', 'legacy'].includes(account.kind) || account.currency !== candidate.settings.currency) throw new Error('Imported accounts must use the journal currency and a supported account kind.');
        }
      }
      requireAccount(candidate, candidate.settings.openingBalanceAccountId ?? LEGACY_ACCOUNT_ID); assertLedgerValid(candidate); await this.writeBatch(writes, financialSettings);
      return { imported: writes.filter((write) => !empty || write.name !== 'accounts' || !data.accounts?.some((row) => row.id === write.item.id)).length, skipped };
    });
  }
}

export const V1_STORES = {
  transactions: 'id, date, type, categoryId, paymentMethodId, updatedAt', categories: 'id, kind, name, updatedAt', paymentMethods: 'id, kind, name',
  budgets: 'id, month, categoryId', wishlistItems: 'id, status, priority, updatedAt', savingsContributions: 'id, wishlistItemId, date', attachments: 'id, updatedAt', settings: 'id',
};
export class BrowserDatabase extends Dexie {
  constructor(name = 'tullip-local-v1') {
    super(name); this.version(1).stores(V1_STORES);
    this.version(2).stores({ ...V1_STORES, accounts: 'id, kind, name, updatedAt' }).upgrade(async (transaction) => {
      const settings = await transaction.table<AppSettings>('settings').get('app');
      await transaction.table('accounts').bulkPut(makeDefaultAccounts(settings?.currency));
      if (settings) await transaction.table('settings').put(upgradeSettings(settings));
    });
  }
}
export class BrowserRepository extends FinancialRepository {
  private readonly db: BrowserDatabase;
  constructor(databaseName?: string) { super(); this.db = new BrowserDatabase(databaseName); }
  private transaction(scope: () => Promise<void>): Promise<void> {
    // Narrow Dexie's recursive overload here; all stores are intentionally included.
    const transaction = this.db.transaction as unknown as (mode: string, tables: string[], callback: () => Promise<void>) => Promise<void>;
    return transaction.call(this.db, 'rw', [...ENTITY_NAMES, 'settings'], scope);
  }
  async init() {
    await this.transaction(async () => {
      if (await this.db.table('categories').count() === 0) await this.db.table('categories').bulkPut(DEFAULT_CATEGORIES);
      if (await this.db.table('paymentMethods').count() === 0) await this.db.table('paymentMethods').bulkPut(DEFAULT_PAYMENT_METHODS);
      if (!await this.db.table('settings').get('app')) await this.db.table('settings').put(makeDefaultSettings());
      if (await this.db.table('accounts').count() === 0) await this.db.table('accounts').bulkPut(makeDefaultAccounts((await this.getSettings()).currency));
    });
  }
  async list<K extends EntityName>(name: K): Promise<EntityMap[K][]> { return this.db.table<EntityMap[K], string>(name).toArray(); }
  async getSettings(): Promise<AppSettings> { return await this.db.table<AppSettings, string>('settings').get('app') ?? makeDefaultSettings(); }
  protected async writeBatch(writes: Write[], settings?: AppSettings) {
    await this.transaction(async () => {
      for (const write of writes) await this.db.table(write.name).put(write.item);
      if (settings) await this.db.table('settings').put(settings);
    });
  }
  protected async deleteReference(name: EntityName, id: string) { await this.db.table(name).delete(id); }
  close() { this.db.close(); }
}

const TABLES: Record<EntityName, string> = { accounts: 'accounts', transactions: 'transactions', categories: 'categories', paymentMethods: 'payment_methods', budgets: 'budgets', wishlistItems: 'wishlist_items', savingsContributions: 'savings_contributions', attachments: 'attachments' };
export class NativeSqliteRepository extends FinancialRepository {
  private connection?: SQLiteDBConnection;
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private initializing?: Promise<void>;
  private async db(): Promise<SQLiteDBConnection> {
    if (!this.connection) {
      this.connection = await this.sqlite.createConnection('tullip', false, 'no-encryption', 1, false);
      await this.connection.open();
    }
    return this.connection;
  }
  async init() { if (!this.initializing) this.initializing = this.initialize(); return this.initializing; }
  private async initialize() {
    const db = await this.db();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, date TEXT NOT NULL, type TEXT NOT NULL, category_id TEXT, payment_method_id TEXT, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_filters ON transactions(type, category_id, payment_method_id, date);
      CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, payload TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS payment_methods (id TEXT PRIMARY KEY, payload TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS budgets (id TEXT PRIMARY KEY, payload TEXT NOT NULL, month TEXT NOT NULL, category_id TEXT, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
      CREATE TABLE IF NOT EXISTS wishlist_items (id TEXT PRIMARY KEY, payload TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS savings_contributions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, wishlist_item_id TEXT NOT NULL, date TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(wishlist_item_id) REFERENCES wishlist_items(id));
      CREATE INDEX IF NOT EXISTS idx_savings_goal ON savings_contributions(wishlist_item_id, date);
      CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
    `);
    const migration = await db.query('SELECT version FROM schema_migrations WHERE version=2');
    if (!migration.values?.length) {
      await db.beginTransaction();
      try {
        const existing = await this.settingsOrNull(); const settings = existing ? upgradeSettings(existing) : makeDefaultSettings();
        for (const account of makeDefaultAccounts(settings.currency)) await this.rawPut('accounts', account);
        await this.rawSettings(settings);
        await db.run('INSERT INTO schema_migrations(version, applied_at) VALUES (2, ?)', [now()], false);
        await db.commitTransaction();
      } catch (error) { await db.rollbackTransaction(); throw error; }
    }
    const writes: Write[] = [];
    if (!(await this.list('categories')).length) DEFAULT_CATEGORIES.forEach((item) => writes.push({ name: 'categories', item }));
    if (!(await this.list('paymentMethods')).length) DEFAULT_PAYMENT_METHODS.forEach((item) => writes.push({ name: 'paymentMethods', item }));
    if (writes.length) await this.writeBatch(writes);
  }
  async list<K extends EntityName>(name: K): Promise<EntityMap[K][]> {
    const result = await (await this.db()).query(`SELECT payload FROM ${TABLES[name]} ORDER BY updated_at DESC`);
    return (result.values ?? []).map((row) => JSON.parse(String(row.payload)) as EntityMap[K]);
  }
  private async rawPut(name: EntityName, item: EntityMap[EntityName]) {
    const values = nativeValues(name, item); const columns = values.map((row) => row.column); const updates = columns.filter((column) => column !== 'id').map((column) => `${column}=excluded.${column}`);
    await (await this.db()).run(`INSERT INTO ${TABLES[name]} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${updates.join(',')}`, values.map((row) => row.value), false);
  }
  protected async writeBatch(writes: Write[], settings?: AppSettings) {
    const db = await this.db(); await db.beginTransaction();
    try { for (const write of writes) await this.rawPut(write.name, write.item); if (settings) await this.rawSettings(settings); await db.commitTransaction(); }
    catch (error) { await db.rollbackTransaction(); throw error; }
  }
  protected async deleteReference(name: EntityName, id: string) { await (await this.db()).run(`DELETE FROM ${TABLES[name]} WHERE id=?`, [id]); }
  private async settingsOrNull(): Promise<AppSettings | null> {
    const result = await (await this.db()).query('SELECT payload FROM settings WHERE id=?', ['app']);
    return result.values?.[0] ? JSON.parse(String(result.values[0].payload)) as AppSettings : null;
  }
  async getSettings() { return await this.settingsOrNull() ?? makeDefaultSettings(); }
  private async rawSettings(settings: AppSettings) { await (await this.db()).run('INSERT INTO settings (id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at', [settings.id, JSON.stringify(settings), settings.updatedAt], false); }
}

function nativeValues(name: EntityName, item: EntityMap[EntityName]) {
  const source = item as unknown as Record<string, unknown>;
  const fields: Record<EntityName, Array<[string, string]>> = {
    accounts: [['kind', 'kind'], ['name', 'name']], transactions: [['date', 'date'], ['type', 'type'], ['category_id', 'categoryId'], ['payment_method_id', 'paymentMethodId']],
    categories: [['kind', 'kind'], ['name', 'name']], paymentMethods: [['kind', 'kind'], ['name', 'name']], budgets: [['month', 'month'], ['category_id', 'categoryId']],
    wishlistItems: [['status', 'status'], ['priority', 'priority']], savingsContributions: [['wishlist_item_id', 'wishlistItemId'], ['date', 'date']], attachments: [],
  };
  return [{ column: 'id', value: item.id }, { column: 'payload', value: JSON.stringify(item) }, ...fields[name].map(([column, key]) => ({ column, value: source[key] ?? null })), { column: 'updated_at', value: item.updatedAt }];
}

/** Custom adapters retain the former helper; built-in adapters merge atomically. */
export async function mergeInto(repository: Repository, backup: BackupFile): Promise<{ imported: number; skipped: number }> {
  if (repository instanceof FinancialRepository) return repository.mergeBackup(backup);
  validateBackup(backup); let imported = 0; let skipped = 0;
  for (const name of ENTITY_NAMES) {
    const existing = new Set((await repository.list(name)).map((item) => item.id));
    for (const item of backup.data[name] ?? []) {
      if (existing.has(item.id)) skipped++; else { await repository.put(name, item); existing.add(item.id); imported++; }
    }
  }
  return { imported, skipped };
}
export function validateBackup(value: unknown): asserts value is BackupFile {
  const backup = value as Partial<BackupFile>;
  if (backup?.app !== 'TULLIP' || ![1, 2].includes(backup.schemaVersion ?? 0) || !backup.data || typeof backup.data !== 'object') throw new Error('This is not a supported TULLIP backup. No data was changed.');
  for (const name of (backup.schemaVersion === 1 ? V1_ENTITY_NAMES : ENTITY_NAMES)) if (!Array.isArray(backup.data[name])) throw new Error(`Backup is missing ${name}. No data was changed.`);
  if (!backup.data.settings || typeof backup.data.settings !== 'object') throw new Error('Backup is missing settings. No data was changed.');
  if (!['INR', 'USD', 'EUR', 'GBP'].includes(backup.data.settings.currency)) throw new Error('Backup uses an unsupported journal currency. No data was changed.');
  const minorFields: Partial<Record<EntityName | 'settings', string>> = { accounts: 'openingBalanceMinor', transactions: 'amountMinor', budgets: 'amountMinor', wishlistItems: 'targetMinor', savingsContributions: 'amountMinor', settings: 'openingBalanceMinor' };
  for (const name of [...ENTITY_NAMES, 'settings'] as const) {
    const records = name === 'settings' ? [backup.data.settings] : backup.data[name] ?? [];
    for (const record of records) {
      if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id) throw new Error(`Backup has an invalid ${name} record. No data was changed.`);
      const field = minorFields[name]; if (field && !Number.isSafeInteger((record as unknown as Record<string, unknown>)[field])) throw new Error(`Backup has a non-integer ${field}. No data was changed.`);
      if (field && name !== 'settings' && name !== 'accounts' && Number((record as unknown as Record<string, unknown>)[field]) <= 0) throw new Error(`Backup has a nonpositive ${field}. No data was changed.`);
      if (name === 'transactions' && !['income', 'expense', 'transfer'].includes((record as Transaction).type)) throw new Error('Backup has an invalid transaction type. No data was changed.');
    }
  }
}
let singleton: Repository | undefined;
export function repository(): Repository {
  if (!singleton) singleton = Capacitor.getPlatform() === 'android' ? new NativeSqliteRepository() : new BrowserRepository();
  return singleton;
}
