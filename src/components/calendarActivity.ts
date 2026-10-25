import type { Transaction } from '../domain/types';

/** One day bucket, at most two markers, regardless of the number of entries. */
export function calendarActivity(transactions: Transaction[]) {
  const result = new Map<string, { entries: Transaction[]; income: boolean; expense: boolean }>();
  for (const entry of transactions) {
    if (entry.voidedAt) continue;
    const bucket = result.get(entry.date) ?? { entries: [], income: false, expense: false };
    bucket.entries.push(entry);
    bucket.income ||= entry.type === 'income' && !entry.refundOfTransactionId;
    bucket.expense ||= entry.type === 'expense' || !!entry.refundOfTransactionId;
    result.set(entry.date, bucket);
  }
  return result;
}
