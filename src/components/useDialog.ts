import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button, input:not([type="hidden"]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

const usable = (element: HTMLElement) => !element.matches(':disabled, [aria-disabled="true"]')
  && !element.closest('[inert], [hidden], [aria-hidden="true"]')
  && element.getClientRects().length > 0
  && getComputedStyle(element).visibility !== 'hidden';

/**
 * Attach the returned ref to a mounted role="dialog" element.
 * Keeps keyboard focus inside, focuses the first field, and restores the trigger.
 * Escape is ignored while a financial mutation is being saved.
 */
export function useDialog<T extends HTMLElement = HTMLElement>(
  onClose: () => void,
  busy = false,
  initialFocusSelector = '[autofocus], input:not([type="hidden"]), select, textarea',
): RefObject<T | null> {
  const dialog = useRef<T>(null);
  const callback = useRef(onClose);
  const blocked = useRef(busy);
  // Capture during render, before a React autoFocus field takes the trigger's focus.
  const previousFocus = useRef<HTMLElement | null>(typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  callback.current = onClose;
  blocked.current = busy;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const hadTabIndex = element.hasAttribute('tabindex');
    if (!hadTabIndex) element.tabIndex = -1;
    const controls = () => [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(usable);
    const firstField = [...element.querySelectorAll<HTMLElement>(initialFocusSelector)].find(usable);
    (firstField ?? controls()[0] ?? element).focus({ preventScroll: true });

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!blocked.current) callback.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const available = controls();
      if (!available.length) { event.preventDefault(); element.focus({ preventScroll: true }); return; }
      const first = available[0]; const last = available[available.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === element || !element.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !element.contains(active))) { event.preventDefault(); first.focus(); }
    };
    const focusin = (event: FocusEvent) => {
      if (!element.contains(event.target as Node)) (controls()[0] ?? element).focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focusin);
      if (!hadTabIndex) element.removeAttribute('tabindex');
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    };
  }, [initialFocusSelector]);

  return dialog;
}
