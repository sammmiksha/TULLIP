import type { Account, AppSettings, Category, PaymentMethod } from './types';

const timestamp = () => new Date().toISOString();
export const BANK_ACCOUNT_ID = 'account-bank';
export const CASH_ACCOUNT_ID = 'account-cash';
export const LEGACY_ACCOUNT_ID = 'account-legacy';
export const makeDefaultAccounts = (currency = 'INR'): Account[] => [
  { id: BANK_ACCOUNT_ID, name: 'Bank account', kind: 'bank', currency, openingBalanceMinor: 0, createdAt: timestamp(), updatedAt: timestamp() },
  { id: CASH_ACCOUNT_ID, name: 'Cash wallet', kind: 'cash', currency, openingBalanceMinor: 0, createdAt: timestamp(), updatedAt: timestamp() },
  { id: LEGACY_ACCOUNT_ID, name: 'Historical / unassigned', kind: 'legacy', currency, openingBalanceMinor: 0, createdAt: timestamp(), updatedAt: timestamp() },
];
const entry = (id: string, name: string, kind: Category['kind'], color: string, sticker: string): Category => ({
  id, name, kind, color, sticker, createdAt: timestamp(), updatedAt: timestamp()
});

export const DEFAULT_CATEGORIES: Category[] = [
  entry('exp-food', 'Food & dining', 'expense', '#ef6f91', '🍔'),
  entry('exp-groceries', 'Groceries', 'expense', '#5c9b71', '🧺'),
  entry('exp-transport', 'Transport', 'expense', '#6e78ce', '🛵'),
  entry('exp-shopping', 'Shopping', 'expense', '#e18e54', '🛍️'),
  entry('exp-bills', 'Bills & utilities', 'expense', '#7a6a91', '🧾'),
  entry('exp-health', 'Health & care', 'expense', '#d96c9f', '💗'),
  entry('exp-education', 'Education', 'expense', '#4e93a9', '📚'),
  entry('exp-entertainment', 'Entertainment', 'expense', '#9870d3', '🎮'),
  entry('exp-home', 'Home', 'expense', '#ad8259', '🏠'),
  entry('exp-gifts', 'Gifts', 'expense', '#d35b81', '🎁'),
  entry('exp-subscriptions', 'Subscriptions', 'expense', '#5a789e', '⭐'),
  entry('exp-other', 'Other', 'expense', '#8b8294', '✦'),
  entry('inc-salary', 'Salary', 'income', '#4d9d75', '💰'),
  entry('inc-freelance', 'Freelance', 'income', '#5e9f8d', '🪙'),
  entry('inc-gift', 'Gift received', 'income', '#d785a9', '🌷'),
  entry('inc-refund', 'Refund', 'income', '#6394c9', '↩'),
  entry('inc-other', 'Other income', 'income', '#6e9e79', '✦')
];

const method = (id: string, name: string, kind: PaymentMethod['kind']): PaymentMethod => ({
  id, name, kind, createdAt: timestamp(), updatedAt: timestamp()
});

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  method('cash', 'Cash', 'cash'), method('upi', 'UPI', 'upi'),
  method('debit-card', 'Debit card', 'debit_card'), method('credit-card', 'Credit card', 'credit_card'),
  method('bank-transfer', 'Bank transfer', 'bank_transfer'), method('other', 'Other', 'other')
];

export const makeDefaultSettings = (): AppSettings => ({
  id: 'app', currency: 'INR', dateFormat: 'DD MMM YYYY', weekStartsOn: 1,
  openingBalanceMinor: 0, budgetWarningPercent: 80, reducedDecorations: false,
  reducedMotion: false, displayName: '', onboardingCompleted: false, walkthroughCompleted: false,
  openingBalanceAccountId: BANK_ACCOUNT_ID, createdAt: timestamp(), updatedAt: timestamp()
});
