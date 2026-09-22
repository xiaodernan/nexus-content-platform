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

describe('alignment nudges (v25, opt-in repair of the v24 near-miss lints)', () => {
  it('OFF by default: a near-miss-only input still proposes nothing and leaves the flag stated', () => {
    const input = { page: PAGE, rects: { a: r(100, 100, 200, 50), b: r(101.5, 400, 200, 50) }, alignTolerance: 2 };
    const res = proposeRepairs(input);
    expect(res.repairs).toEqual([]);
    expect(res.remaining.flags.map((f) => f.code)).toEqual(['near-align']);
  });

  it('align-nudge on opt-in: equal-area pair moves the later id to exact, QA then passes', () => {
    const res = proposeRepairs({ page: PAGE, rects: { a: r(100, 100, 200, 50), b: r(101.5, 400, 200, 50) }, alignTolerance: 2 }, { alignRepairs: true });
    expect(res.repairs).toHaveLength(1);
    expect(res.repairs[0]).toMatchObject({ targetId: 'b', action: 'align-nudge' });
    expect(res.repairs[0]!.to.x).toBe(100);
    expect(res.repairs[0]!.reason).toContain('near-align with a: 1.5px left slip snapped to exact');
    expect(res.remaining.verdict).toBe('ok');
  });

  it('mover selection is by area: the SMALLER layer moves onto the bigger anchor', () => {
    const res = proposeRepairs({ page: PAGE, rects: { big: r(100, 100, 400, 300), s: r(101, 500, 50, 50) }, alignTolerance: 2 }, { alignRepairs: true });
    expect(res.repairs[0]).toMatchObject({ targetId: 's', action: 'align-nudge' });
    expect(res.repairs[0]!.to.x).toBe(100);
    expect(res.remaining.verdict).toBe('ok');
  });

  it('center-nudge: 1px-off horizontal center is centered exactly; vertical stays untouched when exact', () => {
    const res = proposeRepairs({ page: PAGE, rects: { m: r(401, 350, 399, 100) }, centerTolerance: 2 }, { alignRepairs: true });
    expect(res.repairs[0]).toMatchObject({ targetId: 'm', action: 'center-nudge' });
    expect(res.repairs[0]!.to.x).toBeCloseTo(400.5, 10);
    expect(res.repairs[0]!.to.y).toBe(350);
    expect(res.repairs[0]!.reason).toContain('centered horizontally (1.0px)');
    expect(res.remaining.verdict).toBe('ok');
  });

  it('a chain of slips resolves honestly and deterministically (equal areas: later ids move)', () => {
    const input = { page: PAGE, rects: { a: r(100, 100, 200, 50), b: r(101.5, 400, 200, 50), c: r(103, 600, 200, 50) }, alignTolerance: 2 };
    const first = proposeRepairs(input, { alignRepairs: true });
    expect(proposeRepairs(input, { alignRepairs: true })).toEqual(first);
    // b snaps onto a; c is then 3px off exact — beyond tolerance, a design choice, not a lint
    expect(first.repairs.map((p) => p.targetId)).toEqual(['b']);
    expect(first.remaining.verdict).toBe('ok');
  });

  it('applying every nudge through the same rects clears all near-miss flags', () => {
    const rects = { hero: r(60, 60, 300, 40), a: r(61.5, 200, 250, 40), b: r(58.5, 300, 100, 100) };
    const input = { page: PAGE, rects, alignTolerance: 2 };
    const res = proposeRepairs(input, { alignRepairs: true });
    const applied: Record<string, QaRect> = { ...rects };
    for (const p of res.repairs) applied[p.targetId] = p.to;
    expect(runVisualQa({ page: PAGE, rects: applied, alignTolerance: 2 }).flags).toEqual([]);
  });
});

describe('edge-snap nudges (v27, near-edge slips snap flush — opt-in, proposals only)', () => {
  it('default OFF: a visible near-edge lint still earns no repair proposal without the opt-in', () => {
    const res = proposeRepairs({ page: PAGE, rects: { n: r(1.5, 300, 200, 50) }, edgeTolerance: 2 });
    expect(res.repairs).toEqual([]);
    expect(res.remaining.flags.map((f) => f.code)).toEqual(['near-edge']);
  });

  it('left slip on opt-in: edge-snap moves x flush to the page, y untouched, px stated', () => {
    const res = proposeRepairs({ page: PAGE, rects: { n: r(1.5, 300, 200, 50) }, edgeTolerance: 2 }, { alignRepairs: true });
    expect(res.repairs).toHaveLength(1);
    expect(res.repairs[0]).toMatchObject({ targetId: 'n', action: 'edge-snap' });
    expect(res.repairs[0]!.to.x).toBe(0);
    expect(res.repairs[0]!.to.y).toBe(300);
    expect(res.repairs[0]!.reason).toContain('left edge 1.5px off the page, snapped flush');
    expect(res.remaining.verdict).toBe('ok');
  });

  it('right slip snaps against the right edge: x = page.width − width', () => {
    const res = proposeRepairs({ page: PAGE, rects: { n: r(1050, 100, 148.5, 50) }, edgeTolerance: 2 }, { alignRepairs: true });
    expect(res.repairs[0]!.to.x).toBeCloseTo(1051.5, 10);
    expect(res.repairs[0]!.reason).toContain('right edge 1.5px');
  });

  it('a near-flush corner snaps the fixed-order side first and stops honestly with the rest', () => {
    const res = proposeRepairs({ page: PAGE, rects: { c: r(1, 1, 200, 50) }, edgeTolerance: 2 }, { alignRepairs: true });
    expect(res.repairs).toHaveLength(1);
    expect(res.repairs[0]!.to.x).toBe(0); // left went first
    expect(res.repairs[0]!.to.y).toBe(1); // top still 1px off — reported, not chased forever
    expect(res.remaining.flags.map((f) => f.code)).toEqual(['near-edge']);
    expect(res.remaining.flags[0]!.detail).toContain('top edge');
  });

  it('two independent slips both snap in one run; deterministic and clean after applying', () => {
    const input = { page: PAGE, rects: { n1: r(1.5, 300, 200, 50), n2: r(1050, 100, 148.5, 50) }, edgeTolerance: 2 };
    const first = proposeRepairs(input, { alignRepairs: true });
    expect(proposeRepairs(input, { alignRepairs: true })).toEqual(first);
    expect(first.repairs.map((p) => p.targetId)).toEqual(['n1', 'n2']);
    const applied: Record<string, QaRect> = { ...input.rects };
    for (const p of first.repairs) applied[p.targetId] = p.to;
    expect(runVisualQa({ page: PAGE, rects: applied, edgeTolerance: 2 }).flags).toEqual([]);
  });
});
