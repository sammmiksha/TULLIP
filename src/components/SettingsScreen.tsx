import { useEffect, useRef, useState } from 'react';
import type { AppSettings, BackupFile, Budget, Category, EntityMap, EntityName, TullipSnapshot } from '../domain/types';
import { dateKey, formatMoney, parseAmountToMinor } from '../domain/finance';
import { repository, validateBackup } from '../storage/repository';
import { downloadBlob } from '../services/download';
import { AccountsPanel } from './AccountsPanel';
import { PrivacyLockSettings } from './AppLock';
import { parseOpeningBalance, validateDisplayName } from './introduction';

type SaveEntity = <K extends EntityName>(kind: K, item: EntityMap[K]) => Promise<void>;
export function SettingsScreen({ data, onSettings, onSave, onDelete, notice, onReplayIntro, onReplayTour }: {
  data: TullipSnapshot; onSettings: (settings: AppSettings) => Promise<void>; onSave: SaveEntity;
  onDelete: (kind: EntityName, id: string) => Promise<void>; notice: (message: string) => void;
  onReplayIntro: () => void; onReplayTour: () => void;
}) {
  const [settings, setSettings] = useState(data.settings);
  const [opening, setOpening] = useState((data.settings.openingBalanceMinor / 100).toFixed(2));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [categoryName, setCategoryName] = useState(''); const [categoryKind, setCategoryKind] = useState<Category['kind']>('expense');
  useEffect(() => { setSettings(data.settings); setOpening((data.settings.openingBalanceMinor / 100).toFixed(2)); }, [data.settings]);
  const backup = async () => {
    try {
      const body: BackupFile = { schemaVersion: 2, app: 'TULLIP', exportedAt: new Date().toISOString(), data: await repository().snapshot() };
      await downloadBlob(new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }), `tullip-backup-${dateKey()}.json`);
      notice('Backup export opened. Keep it private; receipt files need a separate private copy.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not export backup.'); }
  };
  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()); validateBackup(raw);
      if (!window.confirm('Merge new records from this backup? Existing records and preferences stay. An empty journal restores the backup currency and starting funds. Keep a private backup first.')) return;
      const result = await repository().mergeBackup(raw);
      notice(`Restored ${result.imported} new records; skipped ${result.skipped} duplicates.`); window.location.reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to restore this backup.'); }
    finally { if (restoreRef.current) restoreRef.current.value = ''; }
  };
  return <>
    <section className="page-heading" data-tour="settings"><div><p className="eyebrow">YOUR PRIVATE CORNER</p><h1>Settings <span>⚙</span></h1></div></section>
    <form className="card settings-form" onSubmit={async event => {
      event.preventDefault(); if (busy) return; setError('');
      const validatedName = validateDisplayName(settings.displayName ?? '', true);
      if (validatedName.error) return setError(validatedName.error);
      const displayName = validatedName.value;
      const openingMinor = parseOpeningBalance(opening);
      if (openingMinor === null) return setError('Enter a valid opening balance, including zero, with up to two decimals.');
      try { setBusy(true); await onSettings({ ...settings, displayName, openingBalanceMinor: openingMinor, updatedAt: new Date().toISOString() }); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save your preferences.'); } finally { setBusy(false); }
    }}>
      <h2>Money and display</h2>
      <label>What should we call you?<input value={settings.displayName ?? ''} maxLength={80} onChange={event => setSettings({ ...settings, displayName: event.target.value })} placeholder="Your nickname (optional)" autoComplete="off" /></label>
      <label>Currency<select value={settings.currency} onChange={event => setSettings({ ...settings, currency: event.target.value })}><option value="INR">Indian rupee (₹)</option><option value="USD">US dollar ($)</option><option value="EUR">Euro (€)</option><option value="GBP">Pound sterling (£)</option></select></label>
      <p className="muted">Currency labels never convert existing amounts. A journal with financial history keeps its original currency.</p>
      <label>Date format<select value={settings.dateFormat} onChange={event => setSettings({ ...settings, dateFormat: event.target.value as AppSettings['dateFormat'] })}><option value="DD MMM YYYY">25 Oct 2026</option><option value="MM/DD/YYYY">10/25/2026</option><option value="YYYY-MM-DD">2026-10-25</option></select></label>
      <label>Week begins<select value={settings.weekStartsOn} onChange={event => setSettings({ ...settings, weekStartsOn: Number(event.target.value) as 0 | 1 })}><option value={1}>Monday</option><option value={0}>Sunday</option></select></label>
      <label>Opening balance<input inputMode="decimal" value={opening} onChange={event => setOpening(event.target.value)} /></label>
      <p className="muted">Assigned to {data.accounts?.find(account => account.id === settings.openingBalanceAccountId)?.name ?? 'your original balance account'}. Changing it changes your starting funds.</p>
      <label className="switch"><input type="checkbox" checked={settings.reducedDecorations} onChange={event => setSettings({ ...settings, reducedDecorations: event.target.checked })} />Reduce decorations</label>
      <label className="switch"><input type="checkbox" checked={settings.reducedMotion} onChange={event => setSettings({ ...settings, reducedMotion: event.target.checked })} />Reduce motion</label>
      <button className="primary-button" disabled={busy}>Save preferences</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    <AccountsPanel data={data} onChanged={async () => { await onSettings(await repository().getSettings()); }} />
    <PrivacyLockSettings />
    <section className="card settings-form"><h2>A little guidance</h2><p className="muted">Revisit the introduction or take a skippable tour. These never add sample financial records.</p><div className="button-row"><button className="secondary-button" onClick={onReplayIntro}>Replay introduction</button><button className="secondary-button" onClick={onReplayTour}>Replay walkthrough</button></div></section>
    <section className="card settings-form"><h2>Monthly budget</h2><BudgetEditor data={data} onSave={onSave} onDelete={onDelete} notice={notice} /></section>
    <section className="card settings-form"><h2>Categories</h2><form className="inline-form wrap" onSubmit={async event => {
      event.preventDefault(); if (!categoryName.trim()) return; const stamp = new Date().toISOString();
      try { await onSave('categories', { id: crypto.randomUUID(), name: categoryName.trim(), kind: categoryKind, color: categoryKind === 'expense' ? '#A52E57' : '#236044', sticker: '✦', createdAt: stamp, updatedAt: stamp }); setCategoryName(''); notice('Category added.'); }
      catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not add category.'); }
    }}><label>New category<input value={categoryName} maxLength={50} onChange={event => setCategoryName(event.target.value)} /></label><label>Category kind<select value={categoryKind} onChange={event => setCategoryKind(event.target.value as Category['kind'])}><option value="expense">Expense</option><option value="income">Income</option></select></label><button className="secondary-button">Add</button></form><div className="category-pills">{data.categories.map(category => <span key={category.id} style={{ borderColor: category.color }}>{category.sticker} {category.name}{!category.id.startsWith('exp-') && !category.id.startsWith('inc-') && <button aria-label={`Remove ${category.name}`} onClick={() => { void onDelete('categories', category.id).catch(caught => setError(String(caught.message))); }}>×</button>}</span>)}</div></section>
    <section className="card data-card"><span aria-hidden="true">▣</span><div><h2>Local data & backup</h2><p>Records and receipt files stay on this device. Uninstalling can remove them. JSON backups include records and receipt metadata; app-private receipt files are separate. App-lock credentials are never exported.</p><button className="secondary-button" onClick={() => void backup()}>Export backup</button><button className="secondary-button" onClick={() => restoreRef.current?.click()}>Restore & merge</button><input ref={restoreRef} type="file" accept="application/json,.json" hidden onChange={event => void restore(event.target.files?.[0])} /></div></section>
    <section className="privacy-card"><h2>Privacy promise</h2><p>No account, ads, analytics, cloud sync, bank connection, or automatic upload. Accounts and payment methods are manually recorded. The database is not encrypted; optional app lock guards casual access.</p><small>TULLIP v0.3.0 · local money journal</small></section>
  </>;
}

function BudgetEditor({ data, onSave, onDelete, notice }: { data: TullipSnapshot; onSave: SaveEntity; onDelete: (kind: EntityName, id: string) => Promise<void>; notice: (message: string) => void }) {
  const [amount, setAmount] = useState(''); const [error, setError] = useState('');
  const active = data.budgets.find(budget => budget.month === dateKey().slice(0, 7) && !budget.categoryId);
  return <><p className="muted">A budget is a spending limit, separate from jar savings. Linked refunds reduce spending; older unlinked refund income retains its original classification.</p>{active && <p className="active-budget">Current: {formatMoney(active.amountMinor, data.settings.currency)} <button onClick={() => { void onDelete('budgets', active.id).catch(caught => setError(String(caught.message))); }}>Remove</button></p>}<form className="inline-form" onSubmit={async event => {
    event.preventDefault(); const amountMinor = parseAmountToMinor(amount); if (!amountMinor) return setError('Enter a positive monthly budget.');
    const stamp = new Date().toISOString(); const budget: Budget = { id: active?.id ?? crypto.randomUUID(), month: dateKey().slice(0, 7), amountMinor, createdAt: active?.createdAt ?? stamp, updatedAt: stamp };
    try { await onSave('budgets', budget); setAmount(''); setError(''); notice('Monthly budget saved.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save budget.'); }
  }}><label>Monthly budget amount<input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label><button className="secondary-button">{active ? 'Change' : 'Set budget'}</button></form>{error && <p className="form-error" role="alert">{error}</p>}</>;
}
