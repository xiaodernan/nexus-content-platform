/**
 * Direct coverage for `relativeLuminance` (agents/runtime/src/visualQa.ts).
 *
 * The existing visualQa.test.ts only exercises this function *indirectly* through
 * `contrastRatio`/`runVisualQa`, so the parsing branches (3-digit hex expansion,
 * rgb()/rgba() without alpha, out-of-range clamp to null, unparsable → null) were
 * never asserted on their own. Per house discipline an untested branch *is* the
 * next increment.
 */
import { describe, expect, it } from 'vitest';
import { relativeLuminance } from '../src/visualQa.js';

describe('relativeLuminance', () => {
  it('returns 1 for white in both 6-digit and 3-digit hex', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#fff')).toBeCloseTo(1, 6);
    expect(relativeLuminance('ffffff')).toBeCloseTo(1, 6); // leading # optional
  });

  it('returns 0 for black', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6);
    expect(relativeLuminance('#000')).toBeCloseTo(0, 6);
  });

  it('anchors the WCAG channel weights for pure primaries', () => {
    expect(relativeLuminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance('#0000ff')).toBeCloseTo(0.0722, 4);
  });

  it('expands 3-digit hex to the doubled 6-digit value', () => {
    // #f00 === #ff0000 === pure red
    expect(relativeLuminance('#f00')).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance('#f00')).toBeCloseTo(relativeLuminance('#ff0000')!, 10);
  });

  it('parses rgb() and rgba() and ignores the alpha channel', () => {
    expect(relativeLuminance('rgb(255, 0, 0)')).toBeCloseTo(0.2126, 4);
    expect(relativeLuminance('rgba(0, 255, 0, 0.5)')).toBeCloseTo(0.7152, 4);
    // alpha must not leak into the luminance
    expect(relativeLuminance('rgba(0, 255, 0, 1)')).toBeCloseTo(
      relativeLuminance('rgba(0, 255, 0, 0.1)')!,
      10,
    );
  });

  it('returns null for unparsable colors (no flag invented)', () => {
    expect(relativeLuminance('linear-gradient')).toBeNull();
    expect(relativeLuminance('red')).toBeNull(); // named colors are not supported
    expect(relativeLuminance('')).toBeNull();
    expect(relativeLuminance('   ')).toBeNull();
  });

  it('returns null when any channel is out of the [0,255] range', () => {
    expect(relativeLuminance('rgb(300, 0, 0)')).toBeNull();
    expect(relativeLuminance('rgb(-1, 0, 0)')).toBeNull();
    expect(relativeLuminance('rgb(0, 256, 0)')).toBeNull();
  });

  it('is deterministic across calls', () => {
    const a = relativeLuminance('#6ea8fe');
    const b = relativeLuminance('#6ea8fe');
    expect(a).toBe(b);
    expect(a).not.toBeNull();
  });
});
