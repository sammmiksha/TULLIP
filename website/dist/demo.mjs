/** Website-only example. All money is integer paise; nothing is persisted. */
export const TARGET = 500_000;
export const STEP = 50_000;
export function initialDemo() { return { income: 2_000_000, spent: 34_000, reserved: 200_000 }; }
export function available(state) { return state.income - state.spent - state.reserved; }
export function transition(state, action) {
  const next = { ...state };
  if (action === 'save' && available(state) >= STEP && state.reserved + STEP <= TARGET) next.reserved += STEP;
  else if (action === 'release' && state.reserved >= STEP) next.reserved -= STEP;
  else if (action === 'expense' && available(state) >= 12_000) next.spent += 12_000;
  else if (action === 'reset') return initialDemo();
  return next;
}
export function formatMoney(paise) {
  return new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(paise / 100);
}
