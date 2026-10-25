import { BANK_ACCOUNT_ID, LEGACY_ACCOUNT_ID, makeDefaultAccounts } from './defaults';
import type { Account, SavingsContribution, Transaction, TullipSnapshot } from './types';

export const activeTransactions = (transactions: Transaction[]) => transactions.filter((transaction) => !transaction.voidedAt);
export const accountsFor = (data: TullipSnapshot): Account[] => data.accounts ?? makeDefaultAccounts(data.settings.currency);
export const transactionAccountId = (transaction: Transaction) => transaction.accountId ?? LEGACY_ACCOUNT_ID;

export interface AccountBalance {
  account: Account;
  /** Actual money held, before reserving savings; negative on a card means debt. */
  balanceMinor: number;
  allocatedMinor: number;
  availableMinor: number;
  liabilityMinor: number;
}
interface Effect { reserved: Map<string, number>; cash: Map<string, number>; }
const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value);

export function savingsEffect(entry: SavingsContribution, history: SavingsContribution[]): Effect {
  const reserved = new Map<string, number>(); const cash = new Map<string, number>();
  if (!entry.kind) return { reserved, cash }; // Old planning records never moved money.
  if (entry.kind === 'reversal') {
    const original = history.find((candidate) => candidate.id === entry.reversesId);
    if (!original || original.kind === 'reversal') return { reserved, cash };
    const effect = savingsEffect(original, history);
    effect.reserved.forEach((amount, account) => reserved.set(account, -amount));
    effect.cash.forEach((amount, account) => cash.set(account, -amount));
    return { reserved, cash };
  }
  if (entry.kind === 'allocation') {
    if (entry.accountId) add(reserved, entry.accountId, entry.amountMinor);
  } else {
    for (const split of entry.fundingSplits ?? []) {
      add(reserved, split.accountId, -split.amountMinor);
      if (entry.kind === 'withdrawal') add(cash, split.accountId, -split.amountMinor);
    }
    if (entry.kind === 'withdrawal' && entry.accountId) add(cash, entry.accountId, entry.amountMinor);
  }
  return { reserved, cash };
}

export function allocatedByAccount(data: TullipSnapshot, jarId?: string, through = '9999-12-31') {
  const values = new Map<string, number>();
  data.savingsContributions.filter((entry) => (!jarId || entry.wishlistItemId === jarId) && entry.date <= through)
    .forEach((entry) => savingsEffect(entry, data.savingsContributions).reserved.forEach((amount, account) => add(values, account, amount)));
  return values;
}

export function accountBalances(data: TullipSnapshot, through = '9999-12-31'): AccountBalance[] {
  const balances = new Map<string, number>();
  const accounts = accountsFor(data);
  accounts.forEach((account) => balances.set(account.id, account.openingBalanceMinor));
  const openingAccount = data.settings.openingBalanceAccountId ?? LEGACY_ACCOUNT_ID;
  add(balances, openingAccount, data.settings.openingBalanceMinor);
  activeTransactions(data.transactions).filter((transaction) => transaction.date <= through).forEach((transaction) => {
    const source = transactionAccountId(transaction);
    if (transaction.type === 'income') add(balances, source, transaction.amountMinor);
    if (transaction.type === 'expense') add(balances, source, -transaction.amountMinor);
    if (transaction.type === 'transfer' && transaction.transferAccountId) {
      add(balances, source, -transaction.amountMinor);
      add(balances, transaction.transferAccountId, transaction.amountMinor);
    }
    // A historical transfer without source/destination was a label only: preserve it.
  });
  data.savingsContributions.filter((entry) => entry.date <= through).forEach((entry) => {
    savingsEffect(entry, data.savingsContributions).cash.forEach((amount, account) => add(balances, account, amount));
  });
  const reserved = allocatedByAccount(data, undefined, through);
  return accounts.map((account) => {
    const balanceMinor = balances.get(account.id) ?? 0; const allocatedMinor = reserved.get(account.id) ?? 0;
    return { account, balanceMinor, allocatedMinor, availableMinor: account.kind === 'credit_card' ? 0 : balanceMinor - allocatedMinor,
      liabilityMinor: account.kind === 'credit_card' ? Math.max(0, -balanceMinor) : 0 };
  });
}

export function financialSummary(data: TullipSnapshot, through = '9999-12-31') {
  const balances = accountBalances(data, through);
  const availableMinor = balances.reduce((sum, row) => sum + row.availableMinor, 0);
  const allocatedMinor = balances.reduce((sum, row) => sum + row.allocatedMinor, 0);
  const assetsMinor = balances.reduce((sum, row) => sum + (row.account.kind === 'credit_card' ? Math.max(0, row.balanceMinor) : row.balanceMinor), 0);
  const liabilitiesMinor = balances.reduce((sum, row) => sum + row.liabilityMinor, 0);
  return { availableMinor, allocatedMinor, assetsMinor, liabilitiesMinor, netWorthMinor: assetsMinor - liabilitiesMinor };
}

export function assertPositiveMinor(amount: number, label = 'Amount') {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`${label} must be positive integer paise.`);
}
export function assertDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid calendar date.');
}
export function requireAccount(data: TullipSnapshot, id: string | undefined, cashOnly = false): Account {
  const account = accountsFor(data).find((candidate) => candidate.id === id);
  if (!account || account.archived) throw new Error('Choose an active account.');
  if (cashOnly && (account.kind === 'credit_card' || account.kind === 'legacy')) throw new Error('Choose a bank or cash account for savings.');
  return account;
}

/** Validate at every calendar-day boundary, including later dates after a backdated edit. */
export function assertLedgerValid(data: TullipSnapshot) {
  if (!Object.values(financialSummary(data)).every(Number.isSafeInteger)) throw new Error('Combined totals exceed the safe integer range.');
  const refunded = new Map<string, number>();
  for (const transaction of data.transactions.filter((row) => row.accountId)) {
    if (!accountsFor(data).some((account) => account.id === transaction.accountId)) throw new Error('A transaction references a missing account.');
    if (transaction.attachmentId && !data.attachments.some((attachment) => attachment.id === transaction.attachmentId)) throw new Error('A transaction references missing receipt metadata.');
  }
  for (const transaction of activeTransactions(data.transactions).filter((row) => row.refundOfTransactionId)) {
    const original = data.transactions.find((row) => row.id === transaction.refundOfTransactionId);
    if (transaction.type !== 'income' || !transaction.isRefund || !original || original.type !== 'expense' || original.voidedAt || original.date > transaction.date
      || transactionAccountId(original) !== transactionAccountId(transaction) || original.currency !== transaction.currency || original.categoryId !== transaction.categoryId) throw new Error('A refund must link to an active expense in the same account, currency and category, dated on or after the purchase.');
    add(refunded, original.id, transaction.amountMinor);
    if (refunded.get(original.id)! > original.amountMinor) throw new Error('Refunds cannot exceed the original expense.');
  }
  const dates = [...new Set([...activeTransactions(data.transactions).map((row) => row.date), ...data.savingsContributions.filter((row) => row.kind).map((row) => row.date)])].sort();
  const histories = new Map<string, SavingsContribution>();
  for (const entry of data.savingsContributions) {
    if (histories.has(entry.id)) throw new Error('A savings history ID is duplicated.');
    histories.set(entry.id, entry);
  }
  for (const entry of data.savingsContributions.filter((row) => row.kind)) {
    assertPositiveMinor(entry.amountMinor); assertDate(entry.date);
    if (!data.wishlistItems.some((goal) => goal.id === entry.wishlistItemId)) throw new Error('A savings entry has no wish jar.');
    if (entry.kind === 'reversal') {
      const original = histories.get(entry.reversesId ?? '');
      if (!original?.kind || original.kind === 'reversal' || original.wishlistItemId !== entry.wishlistItemId || original.amountMinor !== entry.amountMinor || entry.date < original.date) throw new Error('Invalid savings reversal.');
      if (data.savingsContributions.filter((row) => row.reversesId === original.id).length !== 1) throw new Error('This savings entry has already been reversed.');
    } else {
      requireAccount(data, entry.accountId, true);
      if (entry.kind !== 'allocation') {
        const splits = entry.fundingSplits ?? [];
        if (!splits.length || splits.reduce((sum, split) => sum + split.amountMinor, 0) !== entry.amountMinor) throw new Error('Savings funding does not reconcile.');
        splits.forEach((split) => { assertPositiveMinor(split.amountMinor); requireAccount(data, split.accountId, true); });
      }
      if (entry.kind === 'purchase') {
        const transaction = data.transactions.find((row) => row.id === entry.transactionId);
        if (!transaction || transaction.type !== 'expense' || transaction.amountMinor < entry.amountMinor || transaction.accountId !== entry.accountId || transaction.date !== entry.date
          || entry.fundingSplits?.some((split) => split.accountId !== entry.accountId) || (transaction.voidedAt && !data.savingsContributions.some((row) => row.reversesId === entry.id))) throw new Error('A jar purchase must link to its expense in the same account and date, with matching funding.');
      }
    }
  }
  for (const date of dates) {
    for (const row of accountBalances(data, date)) {
      if (![row.balanceMinor, row.allocatedMinor, row.availableMinor].every(Number.isSafeInteger)) throw new Error('Account totals exceed the safe integer range.');
      if (row.allocatedMinor < 0) throw new Error(`Savings would be overdrawn on ${date}.`);
      if (row.account.kind !== 'legacy' && row.account.kind !== 'credit_card' && row.availableMinor < 0) throw new Error(`${row.account.name} has insufficient unallocated funds on ${date}.`);
      if (row.account.id === LEGACY_ACCOUNT_ID && row.availableMinor < 0 && activeTransactions(data.transactions).some((transaction) => transaction.legacyReconciliation && transaction.date <= date)) throw new Error(`Historical funds are insufficient for that assignment on ${date}.`);
    }
    for (const goal of data.wishlistItems) {
      if ([...allocatedByAccount(data, goal.id, date).values()].some((amount) => amount < 0)) throw new Error(`The ${goal.name} jar would be overdrawn on ${date}.`);
    }
  }
}

export function validateTransaction(data: TullipSnapshot, transaction: Transaction) {
  assertPositiveMinor(transaction.amountMinor); assertDate(transaction.date);
  if (!['income', 'expense', 'transfer'].includes(transaction.type)) throw new Error('Choose a valid transaction type.');
  const existing = data.transactions.find((row) => row.id === transaction.id);
  if (transaction.legacyReconciliation && (transaction.type !== 'transfer' || transaction.accountId !== LEGACY_ACCOUNT_ID)) throw new Error('A historical assignment must be a transfer from unassigned funds.');
  if (!transaction.accountId && existing && !existing.accountId) return; // Historical record stays unassigned until explicitly edited.
  const account = requireAccount(data, transaction.accountId);
  if (account.kind === 'legacy' && !(transaction.legacyReconciliation && transaction.type === 'transfer' && account.id === LEGACY_ACCOUNT_ID)) throw new Error('Choose a real account for new entries.');
  if (transaction.currency !== account.currency || transaction.currency !== data.settings.currency) throw new Error('Transaction and account currencies must match the journal currency.');
  const payment = data.paymentMethods.find((method) => method.id === transaction.paymentMethodId);
  if (!payment) throw new Error('Choose a payment method.');
  if (transaction.type === 'transfer') {
    const destination = requireAccount(data, transaction.transferAccountId);
    if (destination.id === account.id || destination.kind === 'legacy' || destination.currency !== account.currency) throw new Error('Choose a different destination account with the same currency.');
    if (account.kind === 'credit_card') throw new Error('Credit-card cash advances are not supported. Pay card bills by transferring from bank or cash to the card.');
    if (transaction.legacyReconciliation && (account.id !== LEGACY_ACCOUNT_ID || destination.kind === 'credit_card')) throw new Error('Assign historical funds only to a bank or cash account.');
  } else {
    if (account.kind === 'cash' && payment.kind !== 'cash') throw new Error('Use the cash payment method with the cash wallet.');
    if (account.kind === 'bank' && ['cash', 'credit_card'].includes(payment.kind)) throw new Error('Use UPI, debit card, bank transfer or other with a bank account.');
    if (account.kind === 'credit_card' && payment.kind !== 'credit_card') throw new Error('Use the credit-card payment method with a credit-card account.');
    if (!data.categories.some((category) => category.id === transaction.categoryId && category.kind === (transaction.refundOfTransactionId ? 'expense' : transaction.type))) throw new Error('Choose a category matching this entry type.');
  }
}

export function fundingFor(data: TullipSnapshot, jarId: string, amount: number, through: string, onlyAccount?: string) {
  let remaining = amount; const splits: Array<{ accountId: string; amountMinor: number }> = [];
  for (const [accountId, balance] of allocatedByAccount(data, jarId, through)) {
    if (onlyAccount && accountId !== onlyAccount) continue;
    const taken = Math.min(Math.max(0, balance), remaining);
    if (taken) { splits.push({ accountId, amountMinor: taken }); remaining -= taken; }
  }
  if (remaining) throw new Error(onlyAccount ? 'This account does not hold enough allocated jar savings. Withdraw to the chosen account first, or reduce the jar-funded amount.' : 'The jar does not have enough allocated savings.');
  return splits;
}

export const defaultOpeningAccount = BANK_ACCOUNT_ID;
