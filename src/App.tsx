import { useEffect, useState } from 'react';
import { addMonths, budgetProgress, calendarDays, categorySpending, dateKey, financialSummary, formatDate, formatMoney, monthlyTotals } from './domain/finance';
import type { AppSettings, Budget, EntityMap, EntityName, Transaction, TullipSnapshot } from './domain/types';
import { repository } from './storage/repository';
import { AnimatedJar } from './components/AnimatedJar';
import { GoalsScreen } from './components/GoalsScreen';
import { Onboarding } from './components/Onboarding';
import { Walkthrough } from './components/Walkthrough';
import { SettingsScreen } from './components/SettingsScreen';
import { TransactionModal } from './components/TransactionModal';
import { TransactionRow, TransactionsScreen } from './components/JournalScreen';
import { ReportsScreen } from './components/ReportsScreen';
import { calendarActivity } from './components/calendarActivity';

type Screen = 'home' | 'calendar' | 'transactions' | 'goals' | 'reports' | 'settings';
type SaveEntity = <K extends EntityName>(kind: K, item: EntityMap[K]) => Promise<void>;
const now = () => new Date().toISOString();
const blankSnapshot = (): TullipSnapshot => ({ transactions: [], categories: [], paymentMethods: [], budgets: [], wishlistItems: [], savingsContributions: [], attachments: [], settings: { id: 'app', currency: 'INR', dateFormat: 'DD MMM YYYY', weekStartsOn: 1, openingBalanceMinor: 0, budgetWarningPercent: 80, reducedDecorations: false, reducedMotion: false, createdAt: now(), updatedAt: now() } });
const monthName = (month: string) => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`));
const cmpNewest = <T extends { date?: string; updatedAt: string }>(a: T, b: T) => (b.date ?? b.updatedAt).localeCompare(a.date ?? a.updatedAt);

function App() {
  const [data, setData] = useState<TullipSnapshot>(blankSnapshot);
  const [screen, setScreen] = useState<Screen>('home');
  const [month, setMonth] = useState(dateKey().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [transactionDraft, setTransactionDraft] = useState<Transaction | null | 'new'>(null);
  const [prefillDate, setPrefillDate] = useState<string | undefined>();
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const [onboardingReplay, setOnboardingReplay] = useState(false);
  const [tour, setTour] = useState(false);
  const [purchaseJar, setPurchaseJar] = useState<string | undefined>();
  const repo = repository();

  const load = async () => { await repo.init(); const snapshot = await repo.snapshot(); setData({ ...snapshot, transactions: snapshot.transactions.filter(entry => !entry.voidedAt) }); setReady(true); };
  const refreshAfterSave = async () => { try { await load(); } catch { setToast('Your change was saved. Reopen TULLIP to refresh the display.'); } };
  useEffect(() => { void load().catch((error) => setToast(error instanceof Error ? error.message : 'Unable to open local data.')); }, []);
  const notice = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3200); };
  const save: SaveEntity = async <K extends EntityName>(kind: K, item: EntityMap[K]) => { await repo.put(kind, item); await refreshAfterSave(); };
  const remove = async (kind: EntityName, id: string) => { await repo.remove(kind, id); await refreshAfterSave(); };
  const openNewTransaction = (date?: string) => { setPrefillDate(date); setPurchaseJar(undefined); setTransactionDraft('new'); };
  const updateSettings = async (settings: AppSettings) => { await repo.saveSettings(settings); await refreshAfterSave(); };

  if (!ready) return <main className="loading-screen"><PixelTulip /><p>Opening your private money journal…</p>{toast && <><p className="form-error" role="alert">{toast}</p><button className="secondary-button" onClick={() => void load().catch(error => setToast(String(error.message)))}>Try opening again</button></>}</main>;
  if (data.settings.onboardingCompleted === false || onboardingReplay) return <Onboarding settings={data.settings} introductionOnly={onboardingReplay} onCancel={onboardingReplay ? () => setOnboardingReplay(false) : undefined} illustration={<AnimatedJar savedMinor={1} targetMinor={2} decorative reducedMotion={data.settings.reducedMotion} />} onComplete={async settings => { await updateSettings(settings); setOnboardingReplay(false); setTour(!data.settings.walkthroughCompleted); }} />;
  return <main className={`app${data.settings.reducedDecorations ? ' simple' : ''}${data.settings.reducedMotion ? ' reduced-motion' : ''}`}>
    <header className="topbar"><button className="brand" onClick={() => setScreen('home')} aria-label="Go to dashboard"><PixelTulip /><span>TULLIP</span></button><span className="local-only">⌂ Local only</span></header>
    <section className="content">
      {screen === 'home' && <Dashboard data={data} month={month} setMonth={setMonth} onAdd={openNewTransaction} onScreen={setScreen} onEdit={setTransactionDraft} />}
      {screen === 'calendar' && <CalendarScreen data={data} month={month} setMonth={setMonth} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onAdd={openNewTransaction} onEdit={setTransactionDraft} />}
      {screen === 'transactions' && <TransactionsScreen data={data} onGoals={() => setScreen('goals')} onNew={openNewTransaction} onEdit={setTransactionDraft} onDelete={async (transaction) => { if (window.confirm(`Delete “${transaction.description || 'this transaction'}”? This changes reports and totals.`)) { const attachment = data.attachments.find((item) => item.id === transaction.attachmentId); try { await remove('transactions', transaction.id); notice('Transaction reversed; history retained.'); } catch (error) { notice(error instanceof Error ? error.message : 'Could not reverse this entry.'); } } }} />}
      {screen === 'goals' && <GoalsScreen data={data} onChanged={refreshAfterSave} notice={notice} onPurchase={jarId => { setPurchaseJar(jarId); setTransactionDraft('new'); }} />}
      {screen === 'reports' && <ReportsScreen data={data} month={month} setMonth={setMonth} notice={notice} />}
      {screen === 'settings' && <SettingsScreen data={data} onSettings={async settings => { await updateSettings(settings); notice('Settings saved.'); }} onSave={save} onDelete={remove} onReplayIntro={() => setOnboardingReplay(true)} onReplayTour={() => setTour(true)} notice={notice} />}
    </section>
    <button className="fab" data-tour="add-expense" onClick={() => openNewTransaction()} aria-label="Add transaction">＋ <span>Add</span></button>
    <Nav screen={screen} setScreen={setScreen} />
    {transactionDraft && <TransactionModal data={data} transaction={transactionDraft === 'new' ? undefined : transactionDraft} date={prefillDate} jarId={purchaseJar} onRefund={transactionDraft !== 'new' && transactionDraft.type === 'expense' ? async (amountMinor, refundDate, note, requestId) => { await repo.refundTransaction(transactionDraft.id, amountMinor, refundDate, note, requestId); await load().catch(() => notice('Refund saved. Reopen the journal to refresh the display.')); setTransactionDraft(null); notice('Refund recorded; expenses and account balances updated.'); } : undefined} onClose={() => { setTransactionDraft(null); setPrefillDate(undefined); setPurchaseJar(undefined); }} onSave={async (transaction, attachment, jarId, fundedMinor) => { if (jarId && fundedMinor) { await repo.saveJarPurchase(transaction, jarId, fundedMinor, attachment); } else await repo.saveFinancialTransaction(transaction, attachment); await load().catch(() => notice('Entry saved. Reopen the journal to refresh the display.')); notice(transactionDraft === 'new' ? 'Transaction added to your journal.' : 'Transaction updated.'); setTransactionDraft(null); setPrefillDate(undefined); setPurchaseJar(undefined); }} />}
    {tour && !transactionDraft && <Walkthrough onNavigate={setScreen} onComplete={async () => { await updateSettings({ ...data.settings, walkthroughCompleted: true, updatedAt: now() }); setTour(false); }} onClose={() => setTour(false)} />}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

function PixelTulip() { return <span className="pixel-tulip" aria-hidden="true"><i>◆</i><b>╿</b></span>; }
function Nav({ screen, setScreen }: { screen: Screen; setScreen: (screen: Screen) => void }) {
  const items: Array<[Screen, string, string]> = [['home', '⌂', 'Home'], ['calendar', '▦', 'Calendar'], ['transactions', '≡', 'Journal'], ['goals', '♡', 'Goals'], ['reports', '▥', 'Reports'], ['settings', '⚙', 'Settings']];
  return <nav className="bottom-nav" aria-label="Main navigation">{items.map(([id, icon, label]) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><span>{icon}</span>{label}</button>)}</nav>;
}

function Dashboard({ data, month, setMonth, onAdd, onScreen, onEdit }: { data: TullipSnapshot; month: string; setMonth: (value: string) => void; onAdd: (date?: string) => void; onScreen: (screen: Screen) => void; onEdit: (transaction: Transaction) => void }) {
  const totals = monthlyTotals(data.transactions, month); const categories = categorySpending(data.transactions, data.categories, month); const today = dateKey();
  const summary = financialSummary(data, `${month}-31`); const balance = summary.availableMinor;
  const monthlyBudget = data.budgets.find((budget) => budget.month === month && !budget.categoryId);
  const recent = [...data.transactions].sort(cmpNewest).slice(0, 5);
  return <>
    <section className="hero"><div><p className="eyebrow">{formatDate(today, data.settings.dateFormat)}</p><h1>{data.settings.displayName ? `Hi, ${data.settings.displayName}` : 'Your little money journal'} <span>✦</span></h1><p>Small entries make a clear money story.</p></div><PixelTulip /></section>
    <MonthPicker month={month} setMonth={setMonth} />
    <section className="balance-card" data-tour="balance"><div><p>Available balance</p><strong>{formatMoney(balance, data.settings.currency)}</strong><small>Unallocated cash after jar savings · through the selected month</small></div><span className="balance-sticker" aria-hidden="true">✦</span></section><section className="allocation-summary"><span>Reserved for wishes <b>{formatMoney(summary.allocatedMinor, data.settings.currency)}</b></span><span>Card liabilities <b>{formatMoney(summary.liabilitiesMinor, data.settings.currency)}</b></span></section><div className="dashboard-actions"><button className="secondary-button" data-tour="add-income" onClick={() => onAdd()}>＋ Record income or expense</button><button className="text-button" onClick={() => onScreen('goals')}>Visit your jars ♡</button></div>
    <section className="metric-grid">
      <Metric label="Income" amount={totals.incomeMinor} currency={data.settings.currency} tone="income" onClick={() => onScreen('transactions')} />
      <Metric label="Expenses" amount={totals.expenseMinor} currency={data.settings.currency} tone="expense" onClick={() => onScreen('transactions')} />
      <Metric label="Cash flow" amount={totals.netMinor} currency={data.settings.currency} tone="net" onClick={() => onScreen('reports')} />
    </section>
    <section className="section-head"><h2>Spending story <span>✦</span></h2><button className="text-button" onClick={() => onScreen('reports')}>See report</button></section>
    {categories.length ? <section className="card spending-card">{categories.slice(0, 5).map((entry) => <button className="breakdown" key={entry.categoryId} onClick={() => onScreen('transactions')}><span className="sticker" style={{ background: entry.category?.color }}>{entry.category?.sticker ?? '✦'}</span><span className="breakdown-main"><b>{entry.category?.name ?? 'Unknown'}</b><i><em style={{ width: `${categories[0].amountMinor > 0 ? Math.max(0, Math.min(100, (entry.amountMinor / categories[0].amountMinor) * 100)) : 0}%` }} /></i></span><strong>{formatMoney(entry.amountMinor, data.settings.currency)}</strong></button>)}</section> : <Empty icon="✦" text="Your spending story will bloom after the first expense." action="Add expense" onClick={() => onAdd()} />}
    {monthlyBudget && <BudgetCard budget={monthlyBudget} transactions={data.transactions} currency={data.settings.currency} onClick={() => onScreen('settings')} />}
    <section className="section-head"><h2>Recent little things</h2><button className="text-button" onClick={() => onScreen('transactions')}>All entries</button></section>
    <section className="card transaction-list">{recent.length ? recent.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} data={data} onClick={() => onEdit(transaction)} />) : <Empty icon="🌷" text="No entries yet. Start with today, or any past date." action="Add transaction" onClick={() => onAdd()} />}</section>
    <section className="shortcut-grid"><button onClick={() => onScreen('calendar')}><span>▦</span><b>Calendar</b><small>See daily details</small></button><button onClick={() => onScreen('goals')}><span>🫙</span><b>Wish jar</b><small>Save softly</small></button></section>
  </>;
}

function Metric({ label, amount, currency, tone, onClick }: { label: string; amount: number; currency: string; tone: string; onClick: () => void }) { return <button className={`metric ${tone}`} onClick={onClick}><span>{label}</span><strong>{formatMoney(amount, currency)}</strong></button>; }
function MonthPicker({ month, setMonth }: { month: string; setMonth: (value: string) => void }) { return <div className="month-picker"><button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button><button className="month-label" onClick={() => setMonth(dateKey().slice(0, 7))}>{monthName(month)} <small>today</small></button><button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button></div>; }
function BudgetCard({ budget, transactions, currency, onClick }: { budget: Budget; transactions: Transaction[]; currency: string; onClick: () => void }) { const progress = budgetProgress(budget, transactions, budget.month); const status = progress.remainingMinor >= 0 ? `${formatMoney(progress.remainingMinor, currency)} left` : `${formatMoney(-progress.remainingMinor, currency)} over`; return <button className="card budget-card" onClick={onClick}><span>🎯</span><div><b>Monthly spending budget</b><p>{formatMoney(progress.spentMinor, currency)} of {formatMoney(budget.amountMinor, currency)} · {status}</p><i><em style={{ width: `${Math.min(100, progress.percent)}%` }} /></i></div></button>; }
function Empty({ icon, text, action, onClick }: { icon: string; text: string; action?: string; onClick?: () => void }) { return <div className="empty"><span>{icon}</span><p>{text}</p>{action && <button className="secondary-button" onClick={onClick}>{action}</button>}</div>; }
function CalendarScreen({ data, month, setMonth, selectedDate, setSelectedDate, onAdd, onEdit }: { data: TullipSnapshot; month: string; setMonth: (value: string) => void; selectedDate: string; setSelectedDate: (value: string) => void; onAdd: (date?: string) => void; onEdit: (transaction: Transaction) => void }) {
  const activity = calendarActivity(data.transactions); const days = calendarDays(month, data.settings.weekStartsOn); const labels = data.settings.weekStartsOn === 1 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayRecords = data.transactions.filter((transaction) => transaction.date === selectedDate); const dayTotals = monthlyTotals(dayRecords, selectedDate.slice(0, 7));
  useEffect(() => { if (!selectedDate.startsWith(month)) setSelectedDate(`${month}-01`); }, [month]);
  return <><section className="page-heading"><p className="eyebrow">YOUR MONEY DATES</p><h1>Calendar <span>✦</span></h1></section><section className="card calendar-card" data-tour="calendar"><MonthPicker month={month} setMonth={setMonth} /><p className="calendar-legend">▲ Income · ● Expense or refund · number of entries</p><div className="weekdays">{labels.map((label) => <span key={label}>{label}</span>)}</div><div className="calendar-grid">{days.map((day) => { const bucket = activity.get(day.date); const entries = bucket?.entries ?? []; const expenses = bucket?.expense; const income = bucket?.income; return <button key={day.date} aria-label={`${formatDate(day.date, data.settings.dateFormat)}: ${entries.length} entries${income ? ", income" : ""}${expenses ? ", expenses" : ""}`} aria-pressed={selectedDate === day.date} className={`${!day.inMonth ? 'outside ' : ''}${day.isToday ? 'today ' : ''}${selectedDate === day.date ? 'selected' : ''}`} onClick={() => setSelectedDate(day.date)}><b>{day.number}</b><i>{income && <em className="income" />}{expenses && <em className="expense" />}</i>{entries.length > 0 && <small className="day-count">{entries.length}</small>}</button>; })}</div></section><section className="section-head selected-day"><div><p className="eyebrow">SELECTED DAY</p><h2>{formatDate(selectedDate, data.settings.dateFormat)}</h2></div><button className="secondary-button" onClick={() => onAdd(selectedDate)}>＋ Add</button></section><section className="metric-grid compact"><Metric label="Income" amount={dayTotals.incomeMinor} currency={data.settings.currency} tone="income" onClick={() => {}} /><Metric label="Expenses" amount={dayTotals.expenseMinor} currency={data.settings.currency} tone="expense" onClick={() => {}} /><Metric label="Net" amount={dayTotals.netMinor} currency={data.settings.currency} tone="net" onClick={() => {}} /></section><section className="card transaction-list">{dayRecords.length ? dayRecords.sort(cmpNewest).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} data={data} onClick={() => onEdit(transaction)} />) : <Empty icon="☁" text="This date has no transactions. Adding one will stay right here." action="Add for this date" onClick={() => onAdd(selectedDate)} />}</section></>;
}

export default App;
