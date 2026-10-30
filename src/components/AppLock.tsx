import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { appLockAction, appLockStatus, observeAppLock, type AppLockStatus, type AppLockAction } from '../services/appLock';
import './appLock.css';

type LockAction = AppLockAction;
interface AppLockContextValue {
  status: AppLockStatus | null;
  busy: boolean;
  error: string;
  act: (action: LockAction) => Promise<void>;
}
const AppLockContext = createContext<AppLockContextValue | null>(null);

/** Native Android protection is independent of this presentation and stays active if JS fails. */
export function AppLockBoundary({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AppLockStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => Promise<void>) | undefined;
    void (async () => {
      try {
        const handle = await observeAppLock(next => { if (!disposed) setStatus(next); });
        if (disposed) { await handle.remove(); return; }
        unsubscribe = () => handle.remove();
        const next = await appLockStatus();
        if (!disposed) setStatus(next);
      } catch {
        if (!disposed) setError('Privacy protection could not be checked. Close and reopen TULLIP to retry.');
      }
    })();
    return () => { disposed = true; void unsubscribe?.(); };
  }, []);

  const act = async (action: LockAction) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await appLockAction(action);
      setStatus(next);
      if (next.authenticated === false) setError('Authentication was cancelled or not completed.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'TULLIP could not complete PIN verification.');
      try { setStatus(await appLockStatus()); } catch { /* Keep the existing privacy gate. */ }
    } finally { setBusy(false); }
  };

  return <AppLockContext.Provider value={{ status, busy, error, act }}>
    {status && <div className="app-lock-content" hidden={status.locked} inert={status.locked}>{children}</div>}
    {!status || status.locked
      ? <main className="app-lock-screen" aria-busy={busy}>
          <div className="app-lock-emblem" aria-hidden="true">✦</div>
          <h1>{status?.locked ? 'Your private journal' : 'Opening TULLIP'}</h1>
          <p>{status?.locked ? 'Unlock with your own six-digit TULLIP PIN to see your money and wishes.' : 'Checking your privacy preferences…'}</p>
          {status?.locked && <button className="primary-button" disabled={busy} onClick={() => void act('authenticate')}>Unlock journal</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </main>
      : null}
  </AppLockContext.Provider>;
}

export function PrivacyLockSettings() {
  const lock = useContext(AppLockContext);
  const [setup, setSetup] = useState(false);
  if (!lock) return <p className="form-error">App-lock protection is unavailable in this view.</p>;
  const { status, busy, error, act } = lock;
  return <section className="card settings-form privacy-lock-settings" aria-labelledby="privacy-lock-heading">
    <h2 id="privacy-lock-heading">Privacy &amp; App Lock</h2>
    <p className="muted">Your journal, your secret. Create a six-digit TULLIP PIN that is separate from your phone screen lock. PIN entry and verification stay on your device.</p>
    {!status?.supported
      ? <p className="privacy-lock-note">App lock is available in the installed Android app. This browser preview has no app-lock protection.</p>
      : <>
          <p className="privacy-lock-status">App lock: <strong>{status.enabled ? 'Enabled' : 'Off'}</strong></p>
          {status.enabled
            ? <div className="privacy-lock-actions">
                <button className="secondary-button" disabled={busy} onClick={() => void act('lock')}>Lock now</button>
                <button className="secondary-button" disabled={busy} onClick={() => void act('change')}>{status.migrationRequired ? 'Upgrade to TULLIP PIN' : 'Change TULLIP PIN'}</button>
                <button className="secondary-button" disabled={busy} onClick={() => void act('disable')}>Verify PIN &amp; disable lock</button>
              </div>
            : !setup
              ? <button className="secondary-button" disabled={busy || !status.available} onClick={() => setSetup(true)}>Set up app lock</button>
              : <div className="privacy-lock-setup">
                  <h3>Before you enable it</h3>
                  <p>Your journal will lock on each new app session and whenever TULLIP leaves the foreground, including opening a receipt picker or another app. TULLIP will ask for your own app PIN again.</p>
                  <p>Choose a PIN you can remember. There is no recovery account or reset bypass if you forget it. Keep a private journal backup; clearing app data or uninstalling removes local records. TULLIP never deletes your journal to reset a PIN.</p>
                  <div className="privacy-lock-actions">
                    <button className="primary-button" disabled={busy} onClick={() => { setSetup(false); void act('enable'); }}>Create my TULLIP PIN</button>
                    <button className="text-button" disabled={busy} onClick={() => setSetup(false)}>Cancel</button>
                  </div>
                </div>}
          {status.migrationRequired && <p className="privacy-lock-note">Your existing Android lock still protects this journal. Verify it once to switch safely to your own TULLIP PIN. Cancelling keeps your existing protection.</p>}
        </>}
    <p className="privacy-lock-note">Your PIN is stored as a salted verifier, never as readable digits. Repeated wrong attempts trigger a waiting period. This protects against casual access; it does not encrypt the database or replace Android device security. Screenshots and screen sharing are blocked while app lock is enabled, where Android supports it.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}

