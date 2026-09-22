import { describe, expect, it } from 'vitest';
import { proposeRepairs } from '../src/repair.js';
import { runVisualQa, type QaRect } from '../src/visualQa.js';

const PAGE = { x: 0, y: 0, width: 1200, height: 800 };
const r = (x: number, y: number, width: number, height: number): QaRect => ({ x, y, width, height });

describe('proposeRepairs (v12 auto-fix, structural)', () => {
  it('clean input → no repairs, ok remaining', () => {
    const res = proposeRepairs({ page: PAGE, rects: { a: r(10, 10, 100, 40), b: r(200, 10, 100, 40) } });
    expect(res.repairs).toEqual([]);
    expect(res.remaining.verdict).toBe('ok');
  });

  it('off-page node is moved back inside and QA then passes', () => {
    const res = proposeRepairs({ page: PAGE, rects: { gone: r(5000, 50, 200, 40) } });
    expect(res.repairs[0]).toMatchObject({ targetId: 'gone', action: 'move-inside' });
    expect(res.repairs[0]!.to.x + res.repairs[0]!.to.width).toBeLessThanOrEqual(PAGE.width);
    expect(res.remaining.verdict).toBe('ok');
  });

  it('overlapping pair: the alphabetically-later node is nudged below, QA clears', () => {
    const res = proposeRepairs({ page: PAGE, rects: { hero: r(50, 50, 400, 60), note: r(60, 55, 300, 40) } });
    expect(res.repairs.map((p) => p.targetId)).toEqual(['note']);
    expect(res.repairs[0]!.action).toBe('nudge-below');
    expect(res.repairs[0]!.to.y).toBeGreaterThanOrEqual(50 + 60);
    expect(res.remaining.flags.filter((f) => f.code === 'overlap')).toEqual([]);
  });

  it('zero-size grows to the minimum side', () => {
    const res = proposeRepairs({ page: PAGE, rects: { flat: r(10, 10, 100, 0) } });
    expect(res.repairs[0]!.action).toBe('resize-min');
    expect(res.repairs[0]!.to.height).toBe(8);
  });

  it('repairs are deduped to one final move per node and deterministic', () => {
    const input = { page: PAGE, rects: { a: r(1150, 10, 200, 40), b: r(1160, 15, 100, 30), c: r(100, 900, 50, 50) } };
    const first = proposeRepairs(input);
    const second = proposeRepairs(input);
    expect(second).toEqual(first);
    const ids = first.repairs.map((p) => p.targetId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of first.repairs) {
      const after: Record<string, QaRect> = { ...input.rects, [p.targetId]: p.to };
      void after; // dedupe means applying all repairs together is the final state
    }
    const applied: Record<string, QaRect> = { ...input.rects };
    for (const p of first.repairs) applied[p.targetId] = p.to;
    const recheck = runVisualQa({ page: PAGE, rects: applied });
    expect(recheck.flags.filter((f) => f.severity === 'error')).toEqual([]);
  });
});
