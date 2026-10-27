import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppSettings } from '../domain/types';
import { MAX_DISPLAY_NAME_LENGTH, parseOpeningBalance, validateDisplayName } from './introduction';
import './introduction.css';

export interface OnboardingProps {
  settings: AppSettings;
  onComplete: (settings: AppSettings) => Promise<void> | void;
  onCancel?: () => void;
  /** Replaying the introduction never asks an existing user to re-enter preferences. */
  introductionOnly?: boolean;
  /** Brand illustration slot; the application supplies the owner's exact logo. */
  illustration?: ReactNode;
}

export function Onboarding({ settings, onComplete, onCancel, introductionOnly = false, illustration }: OnboardingProps) {
  const [step, setStep] = useState(introductionOnly ? 3 : 0);
  const [name, setName] = useState(settings.displayName ?? '');
  const [preferences, setPreferences] = useState(settings);
  const [openingBalance, setOpeningBalance] = useState((settings.openingBalanceMinor / 100).toFixed(2));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { heading.current?.focus(); }, [step]);

  const advance = () => {
    setError('');
    if (step === 1) {
      const result = validateDisplayName(name);
      if (result.error) return setError(result.error);
      setName(result.value);
    }
    if (step === 2 && parseOpeningBalance(openingBalance) === null) return setError('Enter an opening balance with up to two decimal places.');
    setStep((current) => Math.min(3, current + 1));
  };

  const complete = async () => {
    if (saving) return;
    const result = validateDisplayName(name, true);
    const minor = parseOpeningBalance(openingBalance);
    if (result.error || minor === null) return setError(result.error ?? 'Check the opening balance.');
    setSaving(true);
    setError('');
    try {
      await onComplete(introductionOnly ? settings : {
        ...preferences, displayName: result.value || undefined, openingBalanceMinor: minor,
        onboardingCompleted: true, updatedAt: new Date().toISOString(),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Your preferences could not be saved. Please try again.');
      setSaving(false);
    }
  };

  const titles = ['A little space for your wishes', 'What should we call you?', 'Your journal, your way', 'Ready for your first page?'];

  return <section className={`introduction-screen${settings.reducedDecorations ? ' introduction-reduced-decorations' : ''}${settings.reducedMotion ? ' introduction-reduced-motion' : ''}`} aria-labelledby="onboarding-heading">
    <div className="introduction-window">
      <div className="introduction-window-bar" aria-hidden="true"><span>♡</span><span>TULLIP JOURNAL</span><span>✦</span></div>
      <div className="introduction-body">
        <p className="eyebrow">{introductionOnly ? 'A LITTLE INTRODUCTION' : `WELCOME · ${step + 1} OF 4`}</p>
        <h1 ref={heading} id="onboarding-heading" tabIndex={-1}>{titles[step]}</h1>
        {step === 0 && <>
          <div className="introduction-illustration" aria-hidden="true">{illustration ?? <span className="introduction-jar-placeholder">🫙<span>✦</span></span>}</div>
          <p className="introduction-lead">Your little corner for money, wishes, and everything in between.</p>
          <p>Record the everyday, save for the special, and keep it all on this device. No accounts or sign-up.</p>
        </>}
        {step === 1 && <>
          <p>A nickname is lovely. It stays here on your device.</p>
          <label className="introduction-label" htmlFor="onboarding-name">Your preferred name</label>
          <input id="onboarding-name" autoComplete="nickname" value={name} onChange={(event) => { setName(event.target.value); setError(''); }} aria-describedby="onboarding-name-hint" aria-invalid={Boolean(error)} placeholder="A name that feels like you" />
          <small id="onboarding-name-hint">{Array.from(name.trim()).length}/{MAX_DISPLAY_NAME_LENGTH} characters · any language welcome</small>
          <button className="text-button introduction-skip" type="button" onClick={() => { setName(''); setError(''); setStep(2); }}>Skip for now</button>
        </>}
        {step === 2 && <div className="introduction-preferences">
          <label>Currency<select value={preferences.currency} onChange={(event) => setPreferences({ ...preferences, currency: event.target.value })}><option value="INR">Indian rupee (₹)</option><option value="USD">US dollar ($)</option><option value="EUR">Euro (€)</option><option value="GBP">Pound sterling (£)</option></select></label>
          <label>Date format<select value={preferences.dateFormat} onChange={(event) => setPreferences({ ...preferences, dateFormat: event.target.value as AppSettings['dateFormat'] })}><option value="DD MMM YYYY">25 Oct 2026</option><option value="MM/DD/YYYY">10/25/2026</option><option value="YYYY-MM-DD">2026-10-25</option></select></label>
          <label>Week begins<select value={preferences.weekStartsOn} onChange={(event) => setPreferences({ ...preferences, weekStartsOn: Number(event.target.value) as 0 | 1 })}><option value={1}>Monday</option><option value={0}>Sunday</option></select></label>
          <label>Opening balance (optional)<input inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} placeholder="0.00" aria-describedby="opening-balance-hint" /></label>
          <small id="opening-balance-hint">Money you already have before the first journal entry. This is not new income.</small>
        </div>}
        {step === 3 && <>
          <p className="introduction-lead">{name.trim() && !introductionOnly ? `Welcome, ${name.trim()}. ` : ''}Make a little habit of checking in.</p>
          <ul className="introduction-feature-list"><li><span aria-hidden="true">＋</span><div><b>Record income and expenses</b><p>Choose the account, payment method, and date.</p></div></li><li><span aria-hidden="true">🫙</span><div><b>Give your wishes a place</b><p>Set savings aside in jars, then release them when needed.</p></div></li><li><span aria-hidden="true">▦</span><div><b>Look back with clarity</b><p>Explore your calendar, journal, and monthly reports.</p></div></li></ul>
          <p className="introduction-private">Your records stay local. Export a private backup before changing phones or uninstalling.</p>
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="introduction-actions">
          {step > 0 && !introductionOnly ? <button className="secondary-button" type="button" disabled={saving} onClick={() => { setError(''); setStep(step - 1); }}>Back</button> : onCancel ? <button className="secondary-button" type="button" disabled={saving} onClick={onCancel}>Close</button> : <span />}
          <button className="primary-button" type="button" disabled={saving} onClick={() => step === 3 ? void complete() : advance()}>{saving ? 'Saving…' : step === 3 ? introductionOnly ? 'Back to My Journal' : 'Start My Journal' : 'Next'}</button>
        </div>
      </div>
    </div>
  </section>;
}

export default Onboarding;
