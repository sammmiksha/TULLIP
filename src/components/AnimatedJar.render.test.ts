import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnimatedJar } from './AnimatedJar';

/** Static rendering verifies the visible progress and accessibility contract,
 * not browser animation timing or device screen-reader behavior. */
describe('rendered savings jar', () => {
  it.each([
    [0, 0, 188],
    [10000, 25, 160],
    [20000, 50, 132],
    [30000, 75, 104],
    [40000, 100, 76],
    [50000, 100, 76],
  ])('keeps saved amount %i consistent with accessible progress and liquid height', (savedMinor, percentage, liquidTop) => {
    const html = renderToStaticMarkup(createElement(AnimatedJar, { savedMinor, targetMinor: 40000, name: 'Phone' }));
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Phone savings"');
    expect(html).toContain(`aria-valuenow="${percentage}"`);
    expect(html).toContain(`aria-valuetext="${percentage}% funded"`);
    expect(html).toContain(`transform:translateY(${liquidTop}px);opacity:${savedMinor === 0 ? 0 : 1}`);
  });

  it('keeps progress readable when motion is reduced and omits decorative progress from accessibility', () => {
    const still = renderToStaticMarkup(createElement(AnimatedJar, { savedMinor: 100, targetMinor: 200, reducedMotion: true }));
    expect(still).toContain('class="animated-jar still"');
    expect(still).toContain('aria-valuenow="50"');
    const decorative = renderToStaticMarkup(createElement(AnimatedJar, { savedMinor: 0, targetMinor: 1, decorative: true }));
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('role="progressbar"');
    expect(decorative).not.toContain('aria-valuenow');
  });

  it('gives separate jars distinct SVG references so one illustration cannot borrow another fill', () => {
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(AnimatedJar, { key: 'phone', savedMinor: 100, targetMinor: 200 }),
      createElement(AnimatedJar, { key: 'sofa', savedMinor: 100, targetMinor: 400 }),
    ));
    const clips = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map(match => match[1]);
    expect(clips).toHaveLength(2);
    expect(new Set(clips).size).toBe(2);
    for (const id of clips) expect(html).toContain(`clip-path="url(#${id})"`);
  });
});
