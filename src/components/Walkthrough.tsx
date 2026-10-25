import { useCallback, useEffect, useRef, useState } from 'react';
import { adjacentTourStep, TOUR_STEPS, type TourScreen } from './introduction';
import './introduction.css';

export interface WalkthroughProps {
  onNavigate: (screen: TourScreen) => void;
  onComplete: (result: 'completed' | 'skipped') => Promise<void> | void;
  onClose?: () => void;
}

interface Highlight { top: number; left: number; width: number; height: number; unavailable: boolean; }

export function Walkthrough({ onNavigate, onComplete, onClose }: WalkthroughProps) {
  const [index, setIndex] = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState('');
  const card = useRef<HTMLElement>(null);
  const navigation = useRef(onNavigate);
  navigation.current = onNavigate;
  const step = TOUR_STEPS[index];

  const finish = useCallback(async (result: 'completed' | 'skipped') => {
    if (saving) return;
    setSaving(true);
    setError('');
    try { await onComplete(result); setFinished(true); onClose?.(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the walkthrough status. Please try again.'); setSaving(false); }
  }, [saving, onComplete, onClose]);

  useEffect(() => {
    if (finished) return;
    setHighlight(null);
    navigation.current(step.screen);
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    card.current?.focus();
    let scrolled = false;
    let attempts = 0;
    const measure = () => {
      const actual = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      const target = actual ?? (step.fallback ? document.querySelector<HTMLElement>(`[data-tour="${step.fallback}"]`) : null);
      if (!target) { setHighlight(null); return; }
      if (!scrolled) { target.scrollIntoView({ block: 'center', behavior: 'instant' }); scrolled = true; }
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) { setHighlight(null); return; }
      setHighlight({ top: Math.max(4, rect.top - 5), left: Math.max(4, rect.left - 5), width: Math.min(window.innerWidth - 8, rect.width + 10), height: Math.min(window.innerHeight - 8, rect.height + 10), unavailable: !actual });
    };
    const timer = window.setInterval(() => { measure(); if (++attempts >= 10) window.clearInterval(timer); }, 100);
    const animationFrame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearInterval(timer); cancelAnimationFrame(animationFrame); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); previousFocus?.focus({ preventScroll: true }); };
  }, [index, step, finished]);

  useEffect(() => {
    if (finished) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); void finish('skipped'); }
      if (event.key !== 'Tab' || !card.current) return;
      const controls = [...card.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [finish, finished]);

  const cardAbove = highlight && highlight.top > window.innerHeight * .5;
  if (finished) return null;
  return <div className="walkthrough-layer">
    {!highlight && <div className="walkthrough-dimmer" />}
    {highlight && <div className="walkthrough-highlight" aria-hidden="true" style={{ top: highlight.top, left: highlight.left, width: highlight.width, height: highlight.height }} />}
    <section ref={card} className={`walkthrough-card ${cardAbove ? 'at-top' : 'at-bottom'}`} role="dialog" aria-modal="true" aria-labelledby="walkthrough-title" aria-describedby="walkthrough-description" tabIndex={-1}>
      <div className="walkthrough-step"><span>YOUR LITTLE TOUR</span><span>{index + 1} / {TOUR_STEPS.length}</span></div>
      <h2 id="walkthrough-title">{step.title}</h2>
      <p id="walkthrough-description">{highlight?.unavailable && step.unavailable ? step.unavailable : step.description}</p>
      {!highlight && <small>The relevant screen is open. You can keep going or return to explore at any time.</small>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="walkthrough-actions"><button className="text-button" disabled={saving} onClick={() => void finish('skipped')}>Skip tour</button><div><button className="secondary-button" disabled={index === 0 || saving} onClick={() => { setError(''); setIndex(adjacentTourStep(index, -1)); }}>Back</button><button className="primary-button" disabled={saving} onClick={() => index === TOUR_STEPS.length - 1 ? void finish('completed') : setIndex(adjacentTourStep(index, 1))}>{saving ? 'Saving…' : index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}</button></div></div>
    </section>
  </div>;
}

export default Walkthrough;
