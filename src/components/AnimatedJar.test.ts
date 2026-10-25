import { describe, expect, it } from 'vitest';
import { jarFillPercent } from './AnimatedJar';

describe('data-driven jar fill', () => {
  it('represents empty, small, half, near complete, full and overfunded goals', () => {
    expect([0, 10000, 2000000, 3960000, 4000000, 5000000].map(saved => jarFillPercent(saved, 4000000)))
      .toEqual([0, .25, 50, 99, 100, 100]);
  });
  it('responds to releases, linked spending and target changes without inventing funds', () => {
    expect(jarFillPercent(1000000, 4000000)).toBe(25);
    expect(jarFillPercent(0, 4000000)).toBe(0);
    expect(jarFillPercent(1000000, 2000000)).toBe(50);
    expect(jarFillPercent(-10, 100)).toBe(0);
    expect(jarFillPercent(100, 0)).toBe(0);
  });
});
