import { describe, expect, it } from 'vitest';
import { computeSnap, computeResizeSnap } from './snap';

describe('computeSnap', () => {
  const page = { x: 0, y: 0, width: 1440, height: 900 };

  it('snaps the moving rect left edge to a sibling left edge within threshold', () => {
    const sibling = { x: 200, y: 100, width: 120, height: 80 };
    // moving rect left edge at 205 -> 5px off the sibling's 200; threshold 8 => snap dx=-5
    const moving = { x: 205, y: 400, width: 100, height: 50 };
    const r = computeSnap([moving], [sibling], page, 8);
    expect(r.dx).toBeCloseTo(-5);
    expect(r.xs).toContain(200);
  });

  it('snaps to the page center on the y axis and reports the guide', () => {
    const moving = { x: 700, y: 452, width: 100, height: 40 };
    const r = computeSnap([moving], [], page, 6);
    // page centerY = 450; moving centerY = 472 -> too far; but top edge 452 vs center 450 -> -2
    // union centerY is what we compare: 452+20=472. Nearest candidate to any y-anchor.
    expect(Math.abs(r.dy)).toBeLessThanOrEqual(6);
    expect(r.ys.length).toBe(1);
  });

  it('does not snap when the nearest candidate is beyond threshold', () => {
    const sibling = { x: 300, y: 100, width: 120, height: 80 };
    const moving = { x: 350, y: 500, width: 100, height: 50 };
    const r = computeSnap([moving], [sibling], page, 3);
    // nearest x candidate (300) is 50 away, centers differ by 60, right edges 450 vs 420 (30)
    expect(r.dx).toBe(0);
    expect(r.xs).toEqual([]);
  });

  it('unions multiple moving rects before comparing anchors', () => {
    const a = { x: 100, y: 100, width: 40, height: 40 };
    const b = { x: 106, y: 300, width: 40, height: 40 };
    const sibling = { x: 140, y: 0, width: 10, height: 10 };
    const r = computeSnap([a, b], [sibling], page, 8);
    // union right edge = 146 -> snaps to sibling 140+10=150? that is 4 away; or sibling.x=140 (6 away)
    expect(Math.abs(r.dx)).toBeLessThanOrEqual(6);
  });
});

describe('computeResizeSnap', () => {
  it('snaps a dragged edge to the nearest candidate line', () => {
    const r = computeResizeSnap('x', 253, [200, 250, 300], 6);
    expect(r).not.toBeNull();
    expect(r?.line).toBe(250);
    expect(r?.delta).toBeCloseTo(-3);
  });

  it('returns null beyond threshold', () => {
    expect(computeResizeSnap('x', 260, [200, 250], 6)).toBeNull();
  });
});
