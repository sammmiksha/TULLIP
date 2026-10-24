export type TransactionType = 'income' | 'expense' | 'transfer';
export type PaymentMethodKind = 'cash' | 'upi' | 'debit_card' | 'credit_card' | 'bank_transfer' | 'other';
export type WishlistStatus = 'planned' | 'saving' | 'achieved' | 'cancelled' | 'purchased';
export type Priority = 'low' | 'medium' | 'high';

export interface Transaction {
  id: string;
  type: TransactionType;
  amountMinor: number;
  currency: string;
  categoryId: string;
  paymentMethodId: string;
  date: string; // ISO local calendar date: YYYY-MM-DD
  description: string;
  merchant?: string;
  attachmentId?: string;
  accountId?: string;
  transferAccountId?: string;
  isRefund?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  color: string;
  sticker: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  kind: PaymentMethodKind;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  month: string; // YYYY-MM
  amountMinor: number;
  categoryId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItem {
  id: string;
  name: string;
  targetMinor: number;
  currency: string;
  url?: string;
  priority: Priority;
  notes?: string;
  targetDate?: string;
  status: WishlistStatus;
  imageAttachmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsContribution {
  id: string;
  wishlistItemId: string;
  amountMinor: number;
  date: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  nativePath?: string;
  dataUrl?: string; // Used only by the browser adapter; never embedded in transaction rows.
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: 'app';
  currency: string;
  dateFormat: 'DD MMM YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  weekStartsOn: 0 | 1;
  openingBalanceMinor: number;
  budgetWarningPercent: number;
  reducedDecorations: boolean;
  reducedMotion: boolean;
  createdAt: string;
  updatedAt: string;
}

export type EntityName =
  | 'transactions'
  | 'categories'
  | 'paymentMethods'
  | 'budgets'
  | 'wishlistItems'
  | 'savingsContributions'
  | 'attachments';

export type EntityMap = {
  transactions: Transaction;
  categories: Category;
  paymentMethods: PaymentMethod;
  budgets: Budget;
  wishlistItems: WishlistItem;
  savingsContributions: SavingsContribution;
  attachments: Attachment;
};

export interface TullipSnapshot {
  transactions: Transaction[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  budgets: Budget[];
  wishlistItems: WishlistItem[];
  savingsContributions: SavingsContribution[];
  attachments: Attachment[];
  settings: AppSettings;
}

export interface BackupFile {
  schemaVersion: 1;
  app: 'TULLIP';
  exportedAt: string;
  data: TullipSnapshot;
}
