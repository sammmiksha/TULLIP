import Dexie, { type Table } from 'dexie';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, makeDefaultSettings } from '../domain/defaults';
import type { AppSettings, BackupFile, EntityMap, EntityName, TullipSnapshot } from '../domain/types';

type Timestamped = { id: string; updatedAt: string };
const ENTITY_NAMES: EntityName[] = ['transactions', 'categories', 'paymentMethods', 'budgets', 'wishlistItems', 'savingsContributions', 'attachments'];

export interface Repository {
  init(): Promise<void>;
  list<K extends EntityName>(name: K): Promise<EntityMap[K][]>;
  put<K extends EntityName>(name: K, item: EntityMap[K]): Promise<void>;
  remove(name: EntityName, id: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
  snapshot(): Promise<TullipSnapshot>;
  mergeBackup(backup: BackupFile): Promise<{ imported: number; skipped: number }>;
}

class BrowserDatabase extends Dexie {
  transactions!: Table<EntityMap['transactions'], string>;
  categories!: Table<EntityMap['categories'], string>;
  paymentMethods!: Table<EntityMap['paymentMethods'], string>;
  budgets!: Table<EntityMap['budgets'], string>;
  wishlistItems!: Table<EntityMap['wishlistItems'], string>;
  savingsContributions!: Table<EntityMap['savingsContributions'], string>;
  attachments!: Table<EntityMap['attachments'], string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('tullip-local-v1');
    this.version(1).stores({
      transactions: 'id, date, type, categoryId, paymentMethodId, updatedAt',
      categories: 'id, kind, name, updatedAt', paymentMethods: 'id, kind, name',
      budgets: 'id, month, categoryId', wishlistItems: 'id, status, priority, updatedAt',
      savingsContributions: 'id, wishlistItemId, date', attachments: 'id, updatedAt', settings: 'id'
    });
  }
}

class BrowserRepository implements Repository {
  private readonly db = new BrowserDatabase();
  private table<K extends EntityName>(name: K): Table<EntityMap[K], string> { return this.db.table(name); }

  async init() {
    if (await this.db.categories.count() === 0) await this.db.categories.bulkAdd(DEFAULT_CATEGORIES);
    if (await this.db.paymentMethods.count() === 0) await this.db.paymentMethods.bulkAdd(DEFAULT_PAYMENT_METHODS);
    if (!await this.db.settings.get('app')) await this.db.settings.add(makeDefaultSettings());
  }
  async list<K extends EntityName>(name: K) { return this.table(name).toArray(); }
  async put<K extends EntityName>(name: K, item: EntityMap[K]) { await this.table(name).put(item); }
  async remove(name: EntityName, id: string) { await this.table(name).delete(id); }
  async getSettings() { return (await this.db.settings.get('app')) ?? makeDefaultSettings(); }
  async saveSettings(settings: AppSettings) { await this.db.settings.put(settings); }
  async snapshot(): Promise<TullipSnapshot> {
    const [transactions, categories, paymentMethods, budgets, wishlistItems, savingsContributions, attachments, settings] = await Promise.all([
      this.list('transactions'), this.list('categories'), this.list('paymentMethods'), this.list('budgets'), this.list('wishlistItems'), this.list('savingsContributions'), this.list('attachments'), this.getSettings()
    ]);
    return { transactions, categories, paymentMethods, budgets, wishlistItems, savingsContributions, attachments, settings };
  }
  async mergeBackup(backup: BackupFile) { return mergeInto(this, backup); }
}

/** Native SQLite is selected only inside Capacitor Android. Records are JSON payloads in
 * entity-specific tables so SQL migrations and indexes remain stable while TypeScript
 * models evolve. Date/type/category indexes support the app's common queries. */
class NativeSqliteRepository implements Repository {
  private connection?: SQLiteDBConnection;
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private initialized = false;
  private table<K extends EntityName>(name: K) {
    const map: Record<EntityName, string> = {
      transactions: 'transactions', categories: 'categories', paymentMethods: 'payment_methods', budgets: 'budgets',
      wishlistItems: 'wishlist_items', savingsContributions: 'savings_contributions', attachments: 'attachments'
    };
    return map[name];
  }
  private async db(): Promise<SQLiteDBConnection> {
    if (!this.connection) {
      this.connection = await this.sqlite.createConnection('tullip', false, 'no-encryption', 1, false);
      await this.connection.open();
    }
    return this.connection;
  }
  async init() {
    if (this.initialized) return;
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
      INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
    `);
    if ((await this.list('categories')).length === 0) for (const item of DEFAULT_CATEGORIES) await this.put('categories', item);
    if ((await this.list('paymentMethods')).length === 0) for (const item of DEFAULT_PAYMENT_METHODS) await this.put('paymentMethods', item);
    if (!(await this.getSettingsOrNull())) await this.saveSettings(makeDefaultSettings());
    this.initialized = true;
  }
  async list<K extends EntityName>(name: K): Promise<EntityMap[K][]> {
    const db = await this.db();
    const result = await db.query(`SELECT payload FROM ${this.table(name)} ORDER BY updated_at DESC`);
    return (result.values ?? []).map((row) => JSON.parse(String(row.payload)) as EntityMap[K]);
  }
  async put<K extends EntityName>(name: K, item: EntityMap[K]): Promise<void> {
    const db = await this.db(); const table = this.table(name); const record = item as EntityMap[K] & Timestamped;
    const values = nativeValues(name, record);
    const columns = values.map(({ column }) => column).join(', ');
    const binds = values.map(({ value }) => value);
    const updates = values.filter(({ column }) => column !== 'id').map(({ column }) => `${column}=excluded.${column}`).join(', ');
    await db.run(`INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updates}`, binds);
  }
  async remove(name: EntityName, id: string): Promise<void> { await (await this.db()).run(`DELETE FROM ${this.table(name)} WHERE id=?`, [id]); }
  private async getSettingsOrNull(): Promise<AppSettings | null> {
    const result = await (await this.db()).query('SELECT payload FROM settings WHERE id=?', ['app']);
    return result.values?.[0] ? JSON.parse(String(result.values[0].payload)) as AppSettings : null;
  }
  async getSettings() { return (await this.getSettingsOrNull()) ?? makeDefaultSettings(); }
  async saveSettings(settings: AppSettings) { await (await this.db()).run('INSERT INTO settings (id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at', [settings.id, JSON.stringify(settings), settings.updatedAt]); }
  async snapshot(): Promise<TullipSnapshot> {
    const [transactions, categories, paymentMethods, budgets, wishlistItems, savingsContributions, attachments, settings] = await Promise.all([
      this.list('transactions'), this.list('categories'), this.list('paymentMethods'), this.list('budgets'), this.list('wishlistItems'), this.list('savingsContributions'), this.list('attachments'), this.getSettings()
    ]);
    return { transactions, categories, paymentMethods, budgets, wishlistItems, savingsContributions, attachments, settings };
  }
  async mergeBackup(backup: BackupFile) { return mergeInto(this, backup); }
}

function nativeValues(name: EntityName, item: EntityMap[EntityName] & Timestamped) {
  const generic = [{ column: 'id', value: item.id }, { column: 'payload', value: JSON.stringify(item) }];
  const source = item as unknown as Record<string, unknown>;
  const fields: Record<EntityName, Array<[string, string]>> = {
    transactions: [['date', 'date'], ['type', 'type'], ['category_id', 'categoryId'], ['payment_method_id', 'paymentMethodId']],
    categories: [['kind', 'kind'], ['name', 'name']], paymentMethods: [['kind', 'kind'], ['name', 'name']],
    budgets: [['month', 'month'], ['category_id', 'categoryId']], wishlistItems: [['status', 'status'], ['priority', 'priority']],
    savingsContributions: [['wishlist_item_id', 'wishlistItemId'], ['date', 'date']], attachments: []
  };
  return [...generic, ...fields[name].map(([column, key]) => ({ column, value: source[key] ?? null })), { column: 'updated_at', value: item.updatedAt }];
}

async function mergeInto(repository: Repository, backup: BackupFile): Promise<{ imported: number; skipped: number }> {
  validateBackup(backup); let imported = 0; let skipped = 0;
  for (const name of ENTITY_NAMES) {
    const existing = new Set((await repository.list(name)).map((item) => item.id));
    for (const item of backup.data[name]) { if (existing.has(item.id)) { skipped++; } else { await repository.put(name, item); imported++; } }
  }
  // Settings are deliberately not restored silently. Existing settings remain in place.
  return { imported, skipped };
}

export function validateBackup(value: unknown): asserts value is BackupFile {
  const backup = value as Partial<BackupFile>;
  if (backup?.app !== 'TULLIP' || backup.schemaVersion !== 1 || !backup.data || typeof backup.data !== 'object') throw new Error('This is not a supported TULLIP backup. No data was changed.');
  for (const name of ENTITY_NAMES) if (!Array.isArray((backup.data as Partial<TullipSnapshot>)[name])) throw new Error(`Backup is missing ${name}. No data was changed.`);
}

let singleton: Repository | undefined;
export function repository(): Repository {
  if (!singleton) singleton = Capacitor.getPlatform() === 'android' ? new NativeSqliteRepository() : new BrowserRepository();
  return singleton;
}
