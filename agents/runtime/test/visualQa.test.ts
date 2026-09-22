import { describe, expect, it } from 'vitest';
import { contrastRatio, runVisualQa, type QaInput } from '../src/visualQa.js';

const PAGE = { x: 0, y: 0, width: 1200, height: 800 };

const input = (rects: QaInput['rects'], rest: Partial<QaInput> = {}): QaInput => ({ page: PAGE, rects, ...rest });

describe('visualQa (v11, structural geometry only)', () => {
  it('clean layout → ok verdict, all ids counted', () => {
    const rep = runVisualQa(input({ a: { x: 10, y: 10, width: 100, height: 40 }, b: { x: 200, y: 10, width: 100, height: 40 } }));
    expect(rep).toEqual({ verdict: 'ok', checked: 2, flags: [] });
  });

  it('detects zero-size, off-page and overlap with severities', () => {
    const rep = runVisualQa(input({
      thin: { x: 5, y: 5, width: 0, height: 30 },
      gone: { x: 5000, y: 5000, width: 50, height: 50 },
      p1: { x: 100, y: 100, width: 200, height: 100 },
      p2: { x: 110, y: 105, width: 190, height: 90 },
    }));
    expect(rep.verdict).toBe('flagged');
    const codes = rep.flags.map((f) => f.code);
    expect(codes).toContain('zero-size');
    expect(codes).toContain('off-page');
    expect(codes).toContain('overlap');
    const overlap = rep.flags.find((f) => f.code === 'overlap')!;
    expect(overlap.ids).toEqual(['p1', 'p2']);
    expect(overlap.severity).toBe('error');
  });

  it('errors sort before warnings, ties stable by code then ids', () => {
    const rep = runVisualQa(input({
      z1: { x: -9000, y: 0, width: 40, height: 40 }, // off-page error
      w1: { x: 1195, y: 10, width: 60, height: 20 }, // slight overflow warn
    }));
    expect(rep.flags.map((f) => f.severity)).toEqual(['error', 'warn']);
  });

  it('tolerances are explicit inputs, not magic constants (§60 honesty)', () => {
    const touchingEdge = { x: 1150, y: 10, width: 100, height: 40 }; // 50 past the edge
    const strict = runVisualQa(input({ e: touchingEdge }, { overflowTolerance: 8 }));
    const loose = runVisualQa(input({ e: touchingEdge }, { overflowTolerance: 200 }));
    expect(strict.flags.some((f) => f.code === 'overflow')).toBe(true);
    expect(loose.flags).toEqual([]);
  });

  it('deterministic: identical reports for identical inputs', () => {
    const i = input({ a: { x: 0, y: 0, width: 300, height: 300 }, b: { x: 10, y: 10, width: 100, height: 100 } });
    expect(runVisualQa(i)).toEqual(runVisualQa(i));
  });
});

describe('contrast rule (v14, computed WCAG 2.1 — not taste)', () => {
  it('black/white passes; low-contrast greys flag as warn', () => {
    const good = runVisualQa({ page: PAGE, rects: { t: { x: 10, y: 10, width: 50, height: 20, fill: '#000', bg: '#fff' } } });
    expect(good.flags).toEqual([]);
    const bad = runVisualQa({ page: PAGE, rects: { t: { x: 10, y: 10, width: 50, height: 20, fill: '#777', bg: '#888' } } });
    expect(bad.flags[0]).toMatchObject({ code: 'low-contrast', severity: 'warn' });
    expect(bad.flags[0]!.detail).toContain('contrast');
  });

  it('parses rgb()/rgba() css forms; unparsable colors produce no flag', () => {
    const fn = runVisualQa({ page: PAGE, rects: { t: { x: 0, y: 0, width: 40, height: 40, fill: 'rgba(120, 120, 120, 1)', bg: '#7d7d7d' } } });
    expect(fn.flags.some((f) => f.code === 'low-contrast')).toBe(true);
    const junk = runVisualQa({ page: PAGE, rects: { t: { x: 0, y: 0, width: 40, height: 40, fill: 'linear-gradient', bg: 'red' } } });
    expect(junk.flags).toEqual([]);
  });

  it('contrastRatio math: 21:1 for black/white, ~1:1 for identical, null for junk', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#zzz', '#fff')).toBeNull();
  });
});

describe('near-miss lints (v24, opt-in geometry — measurable, not taste)', () => {
  it('off by default: an almost-coincident pair gains NO flags without tolerances', () => {
    const rects = { a: { x: 100, y: 100, width: 200, height: 50 }, b: { x: 103, y: 400, width: 200, height: 50 } };
    expect(runVisualQa(input(rects)).flags).toEqual([]);
  });

  it('near-align: edges within alignTolerance (but not exact) flag once per pair with the real gaps', () => {
    const rects = { a: { x: 100, y: 100, width: 200, height: 50 }, b: { x: 103, y: 400, width: 200, height: 50 } };
    const rep = runVisualQa(input(rects, { alignTolerance: 4 }));
    expect(rep.flags).toHaveLength(1);
    const f = rep.flags[0]!;
    expect(f).toMatchObject({ code: 'near-align', severity: 'warn', ids: ['a', 'b'] });
    expect(f.detail).toContain('left 3.0px'); // left AND right edges both 3px off
    expect(f.detail).toContain('right 3.0px');
  });

  it('near-align boundaries: exact 0px gap passes, gap > tolerance passes, gap == tolerance flags', () => {
    const exact = { a: { x: 100, y: 100, width: 50, height: 20 }, b: { x: 100, y: 400, width: 50, height: 20 } };
    expect(runVisualQa(input(exact, { alignTolerance: 4 })).flags).toEqual([]);
    const beyond = { a: exact.a, b: { x: 105, y: 400, width: 50, height: 20 } };
    expect(runVisualQa(input(beyond, { alignTolerance: 4 })).flags).toEqual([]);
    const boundary = { a: exact.a, b: { x: 104, y: 400, width: 50, height: 20 } };
    expect(runVisualQa(input(boundary, { alignTolerance: 4 })).flags.map((f) => f.code)).toEqual(['near-align']);
  });

  it('near-center: 2px off horizontal center flags; exact center, edge-touching and wide rects with non-positive margins stay clean', () => {
    const almost = { m: { x: 401, y: 350, width: 400, height: 100 } }; // gaps 401/399 → 2px off h; exact v
    const rep = runVisualQa(input(almost, { centerTolerance: 3 }));
    expect(rep.flags).toHaveLength(1);
    expect(rep.flags[0]).toMatchObject({ code: 'near-center', ids: ['m'] });
    expect(rep.flags[0]!.detail).toContain('horizontally');
    expect(rep.flags[0]!.detail).not.toContain('vertically');
    const exact = { m: { x: 400, y: 350, width: 400, height: 100 } };
    expect(runVisualQa(input(exact, { centerTolerance: 3 })).flags).toEqual([]);
    const touching = { m: { x: 0, y: 350, width: 400, height: 100 } }; // leftGap 0 → centering was never the intent
    expect(runVisualQa(input(touching, { centerTolerance: 3 })).flags).toEqual([]);
  });

  it('stronger flags win: zero-size and off-page rects never also collect near-miss noise', () => {
    const rep = runVisualQa(
      input(
        { z: { x: 100, y: 100, width: 0, height: 50 }, gone: { x: 103, y: 5000, width: 100, height: 50 }, a: { x: 100, y: 100, width: 200, height: 50 } },
        { alignTolerance: 4 },
      ),
    );
    expect(rep.flags.map((f) => f.code).sort()).toEqual(['off-page', 'zero-size']);
  });

  it('deterministic: identical inputs produce identical reports', () => {
    const i = input({ a: { x: 100, y: 100, width: 200, height: 50 }, b: { x: 103, y: 402, width: 194, height: 50 } }, { alignTolerance: 4, centerTolerance: 3 });
    expect(runVisualQa(i)).toEqual(runVisualQa(i));
    const rep = runVisualQa(i);
    expect(rep.verdict).toBe('flagged');
    expect(rep.flags.every((f) => f.severity === 'warn')).toBe(true);
  });
});

describe('even-gap distribution lint (v26, opt-in arithmetic on spacing chains)', () => {
  const row = (x1: number, x2: number) => ({
    a: { x: 100, y: 100, width: 200, height: 50 },
    b: { x: x1, y: 100, width: 200, height: 50 },
    c: { x: x2, y: 100, width: 200, height: 50 },
  });

  it('off by default: an almost-even 1px-uneven row gains NO flags without gapTolerance', () => {
    expect(runVisualQa(input(row(311, 523))).flags).toEqual([]);
  });

  it('exact-even spacing passes even with the rule ON (spread 0 is distribution, not drift)', () => {
    expect(runVisualQa(input(row(311, 522), { gapTolerance: 2 })).flags).toEqual([]);
  });

  it('almost-even row flags once per axis, naming the run, the real gaps and the spread', () => {
    const rep = runVisualQa(input(row(311, 523), { gapTolerance: 2 })); // x gaps 11, 12 → 1px uneven; y chain overlaps → skipped
    expect(rep.flags).toHaveLength(1);
    const f = rep.flags[0]!;
    expect(f).toMatchObject({ code: 'uneven-gaps', severity: 'warn', ids: ['a', 'b', 'c'] });
    expect(f.detail).toContain('along x');
    expect(f.detail).toContain('11.0px, 12.0px');
    expect(f.detail).toContain('1.0px uneven');
  });

  it('boundaries: spread == tolerance flags, spread > tolerance passes, a two-rect chain is not a distribution', () => {
    expect(runVisualQa(input(row(310, 522), { gapTolerance: 2 })).flags.map((f) => f.code)).toEqual(['uneven-gaps']); // 10/12 → 2 == tol
    expect(runVisualQa(input(row(310, 523), { gapTolerance: 2 })).flags).toEqual([]); // 10/13 → 3 > tol
    const pair = { a: { x: 100, y: 100, width: 50, height: 20 }, b: { x: 200, y: 100, width: 50, height: 20 } };
    expect(runVisualQa(input(pair, { gapTolerance: 4 })).flags).toEqual([]);
  });

  it('a chain with a non-positive gap is overlap territory, not distribution: no uneven-gaps invented', () => {
    const rep = runVisualQa(input({ a: { x: 100, y: 100, width: 300, height: 50 }, b: { x: 420, y: 100, width: 200, height: 50 }, c: { x: 450, y: 110, width: 50, height: 30 } }, { gapTolerance: 2 }));
    expect(rep.flags.map((f) => f.code)).not.toContain('uneven-gaps');
    expect(rep.flags.map((f) => f.code)).toContain('overlap'); // b swallows c — stronger flag owns it
  });

  it('a zero-size member breaks the usable chain (no invented distribution) and reports stay deterministic', () => {
    const rects = { a: { x: 100, y: 100, width: 200, height: 50 }, b: { x: 311, y: 100, width: 200, height: 0 }, c: { x: 523, y: 100, width: 200, height: 50 } };
    const rep = runVisualQa(input(rects, { gapTolerance: 2 }));
    expect(rep.flags.map((f) => f.code)).toEqual(['zero-size']); // usable chain shrinks to two — not a distribution
    const shuffled = input({ c: rects.c, a: rects.a, b: rects.b }, { gapTolerance: 2 });
    expect(runVisualQa(shuffled)).toEqual(runVisualQa(input(rects, { gapTolerance: 2 })));
  });
});

describe('near-edge lint (v27, almost-flush to the page — measurable, opt-in)', () => {
  it('off by default: a 1.5px page margin gains NO flags without edgeTolerance', () => {
    expect(runVisualQa(input({ f: { x: 1.5, y: 300, width: 200, height: 50 } })).flags).toEqual([]);
  });

  it('opt-in: near-flush left edge flags once, naming the side and the real margin', () => {
    const rep = runVisualQa(input({ f: { x: 1.5, y: 300, width: 200, height: 50 } }, { edgeTolerance: 2 }));
    expect(rep.flags).toHaveLength(1);
    expect(rep.flags[0]).toMatchObject({ code: 'near-edge', severity: 'warn', ids: ['f'] });
    expect(rep.flags[0]!.detail).toContain('left edge 1.5px off the page');
  });

  it('exact flush passes; a margin beyond tolerance passes; spread == tolerance flags', () => {
    expect(runVisualQa(input({ f: { x: 0, y: 300, width: 200, height: 50 } }, { edgeTolerance: 2 })).flags).toEqual([]);
    expect(runVisualQa(input({ f: { x: 3, y: 300, width: 200, height: 50 } }, { edgeTolerance: 2 })).flags).toEqual([]);
    expect(runVisualQa(input({ f: { x: 2, y: 300, width: 200, height: 50 } }, { edgeTolerance: 2 })).flags.map((x) => x.code)).toEqual(['near-edge']);
  });

  it('a near-flush corner lints ONCE naming both sides', () => {
    const rep = runVisualQa(input({ c: { x: 1, y: 1, width: 200, height: 50 } }, { edgeTolerance: 2 }));
    expect(rep.flags).toHaveLength(1);
    expect(rep.flags[0]!.detail).toContain('left edge 1.0px');
    expect(rep.flags[0]!.detail).toContain('top edge 1.0px');
  });

  it('hangover and stronger flags own their rects: a rect past the edge never collects near-edge noise', () => {
    const rep = runVisualQa(input({ o: { x: 1190, y: 100, width: 30, height: 50 }, gone: { x: 9000, y: 9000, width: 40, height: 40 } }, { edgeTolerance: 2 }));
    expect(rep.flags.map((f) => f.code).sort()).toEqual(['off-page', 'overflow']); // right margin is NEGATIVE — overflow's business
    expect(rep.flags.some((f) => f.code === 'near-edge')).toBe(false);
  });

  it('deterministic: identical inputs, identical reports', () => {
    const i = input({ f: { x: 1050, y: 300, width: 148.5, height: 50 }, g: { x: 100, y: 798.5, width: 100, height: 1 } }, { edgeTolerance: 2 });
    expect(runVisualQa(i)).toEqual(runVisualQa(i));
    expect(runVisualQa(i).flags.every((x) => x.code === 'near-edge')).toBe(true);
  });
});
