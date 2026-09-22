import { describe, expect, it } from 'vitest';
import { runVisualQa, type QaInput } from '../src/visualQa.js';

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
