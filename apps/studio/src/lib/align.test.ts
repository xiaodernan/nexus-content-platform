import { describe, expect, it } from 'vitest';
import { boundsOf, computeAlign, computeDistribute, type AlignItem } from './align';

const item = (id: string, x: number, y: number, width: number, height: number): AlignItem => ({ id, rect: { x, y, width, height } });

describe('boundsOf', () => {
  it('computes the union rect of a set', () => {
    expect(boundsOf([item('a', 10, 20, 100, 40), item('b', 60, 5, 20, 10)])).toEqual({ x: 10, y: 5, width: 100, height: 55 });
  });
  it('is null for an empty set', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('computeAlign', () => {
  const page = { x: 0, y: 0, width: 1440, height: 900 };

  it('aligns each item to the page left edge', () => {
    const items = [item('a', 120, 50, 100, 100), item('b', 340, 90, 80, 40)];
    const d = computeAlign(items, page, 'left');
    expect(d.a!).toEqual({ dx: -120, dy: 0 });
    expect(d.b!).toEqual({ dx: -340, dy: 0 });
  });

  it('centers on the page horizontally', () => {
    const d = computeAlign([item('a', 0, 0, 200, 100)], page, 'hcenter');
    // page center x = 720; item center currently 100 -> dx = 620
    expect(d.a!.dx).toBeCloseTo(620);
    expect(d.a!.dy).toBe(0);
  });

  it('aligns to the selection bounds when given one', () => {
    const items = [item('a', 10, 0, 40, 10), item('b', 90, 0, 20, 10)];
    const sel = boundsOf(items)!; // {x:10,width:100}
    const d = computeAlign(items, sel, 'right');
    // right edge = 110; a right=50 -> dx 60; b right=110 -> dx 0
    expect(d.a!.dx).toBeCloseTo(60);
    expect(d.b!.dx).toBeCloseTo(0);
  });
});

describe('computeDistribute', () => {
  it('equalizes interior gaps while pinning the extremes (x)', () => {
    // widths 100,100,100 across span 0..700 -> two equal gaps of 200 -> b lands at 300
    const items = [item('a', 0, 0, 100, 50), item('b', 250, 0, 100, 50), item('c', 600, 0, 100, 50)];
    const d = computeDistribute(items, 'x');
    expect(d.a!.dx).toBe(0); // first pinned
    expect(d.c!.dx).toBe(0); // last pinned
    expect(d.b!.dx).toBeCloseTo(50); // 250 -> 300, giving gaps of 200 on both sides
    // final left positions: 0, 300, 600 -> gaps 200 and 200
  });

  it('handles out-of-order input by sorting', () => {
    const items = [item('c', 600, 0, 100, 50), item('a', 0, 0, 100, 50), item('b', 250, 0, 100, 50)];
    const d = computeDistribute(items, 'x');
    expect(d.b!.dx).toBeCloseTo(50);
  });

  it('is a no-op with fewer than three items', () => {
    const items = [item('a', 0, 0, 100, 50), item('b', 250, 0, 100, 50)];
    const d = computeDistribute(items, 'x');
    expect(d.a!).toEqual({ dx: 0, dy: 0 });
    expect(d.b!).toEqual({ dx: 0, dy: 0 });
  });

  it('distributes along y independently of x', () => {
    const items = [item('a', 0, 0, 50, 100), item('b', 0, 250, 50, 100), item('c', 0, 600, 50, 100)];
    const d = computeDistribute(items, 'y');
    expect(d.b!.dy).toBeCloseTo(50);
    expect(d.b!.dx).toBe(0);
    expect(d.a!.dx).toBe(0);
  });
});
