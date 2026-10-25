import { addMonths, categorySpending, dateKey, formatMoney, monthlyTotals, paymentBreakdown } from '../domain/finance';
import type { TullipSnapshot } from '../domain/types';
import { downloadBlob } from '../services/download';

export function ReportsScreen({ data, month, setMonth, notice }: { data: TullipSnapshot; month: string; setMonth: (value: string) => void; notice: (message: string) => void }) {
  const totals = monthlyTotals(data.transactions, month);
  const spending = categorySpending(data.transactions, data.categories, month);
  const payments = paymentBreakdown(data.transactions, data.paymentMethods, month);
  const previous = monthlyTotals(data.transactions, addMonths(month, -1));
  const delta = totals.expenseMinor - previous.expenseMinor;
  const exportFile = async (kind: 'csv' | 'pdf' | 'savings') => {
    try {
      const { csvForSavingsHistory, csvForTransactions, pdfForMonth } = await import('../services/exports');
      const blob = kind === 'pdf' ? pdfForMonth(month, data.transactions, data.categories, data.paymentMethods, data.settings.currency, data.accounts)
        : new Blob([kind === 'csv' ? csvForTransactions(data.transactions.filter(transaction => transaction.date.startsWith(month)), data.categories, data.paymentMethods, data.accounts) : csvForSavingsHistory(data, month)], { type: 'text/csv;charset=utf-8' });
      await downloadBlob(blob, kind === 'pdf' ? `tullip-statement-${month}.pdf` : kind === 'savings' ? `tullip-savings-${month}.csv` : `tullip-${month}.csv`);
      notice('Export opened. Choose where to keep your private copy.');
    } catch (caught) { notice(caught instanceof Error ? caught.message : 'Could not export this report.'); }
  };
  return <>
    <section className="page-heading"><div><p className="eyebrow">MONTHLY WRAP-UP</p><h1>Reports <span>▥</span></h1></div></section>
    <div className="month-picker"><button aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button><button className="month-label" onClick={() => setMonth(dateKey().slice(0, 7))}>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T12:00:00`))}<small>today</small></button><button aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button></div>
    <section className="report-hero"><span aria-hidden="true">✦</span><p>Net cash flow</p><strong>{formatMoney(totals.netMinor, data.settings.currency)}</strong><small>{totals.transactionCount} financial entries this month</small></section>
    <section className="metric-grid">{[['Income', totals.incomeMinor, 'income'], ['Expenses', totals.expenseMinor, 'expense'], ['vs last month', delta, 'net']].map(([label, value, tone]) => <div className={`metric ${tone}`} key={label}><span>{label}</span><strong>{formatMoney(Number(value), data.settings.currency)}</strong></div>)}</section>
    <p className="page-note">Allocations, releases and transfers stay out of income and expenses. Linked refunds reduce expenses in the month received; older unlinked refunds retain their original classification.</p>
    <section className="card report-section"><h2>Where it went</h2>{spending.length ? spending.map(entry => <div className="report-line" key={entry.categoryId}><span>{entry.category?.sticker} {entry.category?.name ?? 'Original category'}</span><b>{formatMoney(entry.amountMinor, data.settings.currency)}</b></div>) : <div className="empty"><span aria-hidden="true">▤</span><p>No spending this month. A quiet page in your journal.</p></div>}<h2>How you paid</h2>{payments.length ? payments.map(entry => <div className="report-line" key={entry.name}><span>{entry.name}</span><b>{formatMoney(entry.amountMinor, data.settings.currency)}</b></div>) : <p className="muted">No expense payments in this period.</p>}</section>
    <section className="export-card" data-tour="reports-export"><div><span aria-hidden="true">▣</span><h2>Take a copy with you</h2><p>All exports use this journal's actual entries. PDF totals match this report. Savings history is separate from purchases and cash flow.</p></div><div><button className="secondary-button" onClick={() => void exportFile('csv')}>CSV</button><button className="primary-button" onClick={() => void exportFile('pdf')}>PDF statement</button><button className="secondary-button" onClick={() => void exportFile('savings')}>Savings CSV</button></div></section>
  </>;
}
