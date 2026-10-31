/** Pure helpers for the website's scroll illustrations. No journal state or DOM. */
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function clamp(value, min = 0, max = 1) {
  const first = finite(min, 0);
  const second = finite(max, 1);
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  if (typeof value !== 'number' || Number.isNaN(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/** A local 0..1 interval, including a deterministic step for a zero-length range. */
export function segment(progress, start, end) {
  const beginning = clamp(start);
  const finish = clamp(end);
  const current = clamp(progress);
  return finish <= beginning
    ? Number(current >= beginning)
    : clamp((current - beginning) / (finish - beginning));
}

/** rectTop is the scene's viewport-relative top, measured before its sticky child. */
export function sceneProgress(rectTop, sectionHeight, viewportHeight) {
  const top = finite(rectTop);
  const travel = Math.max(1, finite(sectionHeight) - finite(viewportHeight));
  return clamp(-top / travel);
}

/**
 * All count cards complete sequentially over 0..1. Apply y as px and rotate as
 * degrees. Cards behind the active one approach the front; outgoing cards rise,
 * turn and fade. A completed card stays invisible when scrolling past it, and
 * restores the exact earlier pose when the visitor scrolls back.
 */
export function cardPose(index, progress, count) {
  if (!Number.isSafeInteger(count) || count < 1
      || !Number.isSafeInteger(index) || index < 0 || index >= count) {
    return { y: 0, scale: 1, rotate: 0, opacity: 0, done: true };
  }
  const phase = clamp(progress) * count - index;
  if (phase < 0) {
    const depth = -phase;
    return {
      y: Math.min(depth, 6) * 18,
      scale: Math.max(.76, 1 - depth * .045),
      rotate: Math.min(depth, 4) * 1.6,
      opacity: clamp(1 - Math.max(0, depth - 3) * .3),
      done: false,
    };
  }
  const exit = clamp(phase);
  const eased = exit * exit * (3 - 2 * exit);
  return {
    y: eased === 0 ? 0 : -260 * eased,
    scale: 1 + .025 * eased,
    rotate: eased === 0 ? 0 : -12 * eased,
    opacity: 1 - segment(exit, .5, 1),
    done: phase >= 1,
  };
}

export function revealedWordCount(progress, count) {
  if (!Number.isSafeInteger(count) || count < 1) return 0;
  return Math.min(count, 1 + Math.floor(clamp(progress) * count));
}

/** Illustration amounts remain integer paise and cannot exceed the target. */
export function scrollSavings(progress, targetMinor) {
  if (!Number.isSafeInteger(targetMinor) || targetMinor < 0) {
    throw new RangeError('A savings illustration needs a non-negative safe integer target in paise.');
  }
  return Math.min(targetMinor, Math.round(clamp(progress) * targetMinor));
}

export function horizontalDistance(trackWidth, viewportWidth) {
  return Math.max(0, finite(trackWidth) - Math.max(0, finite(viewportWidth)));
}
