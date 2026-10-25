import { useEffect, useId, useRef, useState } from 'react';

export function jarFillPercent(savedMinor: number, targetMinor: number) {
  if (!Number.isSafeInteger(savedMinor) || !Number.isSafeInteger(targetMinor) || targetMinor <= 0) return 0;
  return Math.max(0, Math.min(100, savedMinor / targetMinor * 100));
}

/** Temporary, replaceable illustration. It is not the owner's final logo. */
export function AnimatedJar({ savedMinor, targetMinor, name = 'Wish jar', reducedMotion = false, decorative = false }: {
  savedMinor: number; targetMinor: number; name?: string; reducedMotion?: boolean; decorative?: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const percent = jarFillPercent(savedMinor, targetMinor);
  const previous = useRef(percent);
  const [change, setChange] = useState<'up' | 'down' | 'complete' | ''>('');
  useEffect(() => {
    const before = previous.current;
    previous.current = percent;
    if (before === percent || reducedMotion) return;
    setChange(percent >= 100 && before < 100 ? 'complete' : percent > before ? 'up' : 'down');
    const timeout = window.setTimeout(() => setChange(''), 1300);
    return () => window.clearTimeout(timeout);
  }, [percent, reducedMotion]);
  return <div className={`animated-jar ${reducedMotion ? 'still' : ''}`} data-change={change}
    {...(decorative ? { 'aria-hidden': true as const } : { role: 'progressbar', 'aria-label': `${name} savings`, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(percent), 'aria-valuetext': `${Math.round(percent)}% funded` })}>
    <svg viewBox="0 0 180 200" focusable="false" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-glass`}><path d="M49 62h82v19c0 11 24 15 24 40v45c0 16-28 23-65 23s-65-7-65-23v-45c0-25 24-29 24-40Z" /></clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--blush)"/><stop offset="1" stopColor="var(--periwinkle)"/></linearGradient>
        <linearGradient id={`${id}-glass-shine`}><stop stopColor="var(--warm-white)" stopOpacity=".6"/><stop offset=".5" stopColor="var(--lavender)" stopOpacity=".2"/><stop offset="1" stopColor="var(--warm-white)" stopOpacity=".6"/></linearGradient>
      </defs>
      <path className="jar-sticker-edge" d="M49 62h82v19c0 11 24 15 24 40v45c0 16-28 23-65 23s-65-7-65-23v-45c0-25 24-29 24-40Z" />
      <path fill={`url(#${id}-glass-shine)`} stroke="var(--plum)" strokeWidth="4" d="M49 62h82v19c0 11 24 15 24 40v45c0 16-28 23-65 23s-65-7-65-23v-45c0-25 24-29 24-40Z" />
      <g clipPath={`url(#${id}-glass)`}>
        <g className="jar-liquid" style={{ transform: `translateY(${188 - 112 * percent / 100}px)`, opacity: percent === 0 ? 0 : 1 }}>
          <path fill={`url(#${id}-fill)`} d="M15 0Q40-7 65 0T115 0T165 0V140H15Z" />
          <path fill="none" stroke="var(--warm-white)" strokeWidth="2" opacity=".7" d="M15 0Q40-7 65 0T115 0T165 0" />
        </g>
        <path fill="var(--buttercream)" stroke="var(--star-edge)" strokeWidth="2" d="m90 99 12 24 27 4-20 19 5 27-24-13-24 13 5-27-20-19 27-4Z" />
        <path fill="none" stroke="var(--warm-white)" strokeWidth="5" strokeLinecap="round" opacity=".85" d="M39 118v42M44 104l3-4" />
      </g>
      <ellipse cx="90" cy="61" rx="48" ry="12" fill="var(--lavender)" stroke="var(--plum)" strokeWidth="4" />
      <path d="m49 30 5 29q36 12 72 0l5-29Z" fill="var(--cork)" stroke="var(--plum)" strokeWidth="4" />
      <ellipse cx="90" cy="30" rx="41" ry="10" fill="var(--cork-highlight)" stroke="var(--plum)" strokeWidth="4" />
      <g className="jar-sparkles" fill="var(--berry)"><path d="m24 47 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><path d="m153 78 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/></g>
    </svg>
  </div>;
}
