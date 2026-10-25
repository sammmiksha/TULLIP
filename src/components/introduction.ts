export const MAX_DISPLAY_NAME_LENGTH = 40;

/** Count Unicode code points, so ordinary emoji and non-Latin names are welcome. */
export function validateDisplayName(input: string, allowEmpty = false): { value: string; error?: string } {
  const value = input.trim();
  if (!value && !allowEmpty) return { value, error: 'Enter a nickname, or choose Skip for now.' };
  if (Array.from(value).length > MAX_DISPLAY_NAME_LENGTH) return { value, error: `Use ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.` };
  if (/[\u0000-\u001f\u007f]/.test(value)) return { value, error: 'Keep your name on one line, without control characters.' };
  return { value };
}

/** Opening balances may be zero or negative; no floating-point money is stored. */
export function parseOpeningBalance(input: string): number | null {
  const value = input.trim();
  if (!value) return 0;
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const minor = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(minor) ? (negative ? -minor : minor) : null;
}

export type TourScreen = 'home' | 'calendar' | 'transactions' | 'goals' | 'reports' | 'settings';
export interface TourStep { screen: TourScreen; target: string; fallback?: string; title: string; description: string; unavailable?: string; }

export const TOUR_STEPS: readonly TourStep[] = [
  { screen: 'home', target: 'balance', title: 'Your everyday money', description: 'Available balance is money that has not been set aside in wish jars. Income, spending, and savings stay separate.' },
  { screen: 'home', target: 'add-income', title: 'Record a little win', description: 'Open this form and choose Income when money arrives. Choose the account receiving it, then the payment method, amount, and date.' },
  { screen: 'home', target: 'add-expense', title: 'Save a money moment', description: 'Use Add and choose Expense for an actual purchase. You can add a note or receipt, and edit the entry later.' },
  { screen: 'calendar', target: 'calendar', title: 'Choose a day', description: 'Select a date to see its entries. Compact income and expense markers keep busy days tidy. New entries use your selected date.' },
  { screen: 'transactions', target: 'journal-search', title: 'Find an entry', description: 'Search your journal and combine filters to find income, expenses, transfers, and savings activity.' },
  { screen: 'goals', target: 'jar-create', title: 'Make room for a wish', description: 'Create a wish jar with a name and target. Its fill shows the savings actually allocated to that wish.' },
  { screen: 'goals', target: 'jar-add', fallback: 'jar-create', title: 'Set money aside', description: 'Add saved amount allocates money from an account to a jar. It reduces available money without becoming an expense.', unavailable: 'Create a wish first. Its Add saved amount button lets you choose an account, amount, and date.' },
  { screen: 'goals', target: 'jar-withdraw', fallback: 'jar-create', title: 'Bring savings back', description: 'Remove money releases savings back into an account. The history stays intact, and the release is not income.', unavailable: 'Each wish jar has a Remove money action. After funding a jar, use it for a partial or full withdrawal.' },
  { screen: 'reports', target: 'reports-export', title: 'See the bigger picture', description: 'Reports use the same recorded income and expenses as Home. Save a monthly CSV or PDF when you need a copy.' },
  { screen: 'settings', target: 'settings', title: 'Make this corner yours', description: 'Change your nickname, display preferences, and optional app lock here. You can replay this walkthrough whenever you like.' },
] as const;

export function adjacentTourStep(index: number, direction: -1 | 1): number {
  return Math.max(0, Math.min(TOUR_STEPS.length - 1, index + direction));
}
