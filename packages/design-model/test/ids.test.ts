import { describe, expect, it } from 'vitest';
import { clamp01, demoId, hexToRgba, newId, rgbaToCss } from '../src/ids.js';

describe('ids: id + color helpers', () => {
  it('newId uses the given prefix and stays unique across calls', () => {
    const a = newId('tx');
    const b = newId('tx');
    expect(a.startsWith('tx_')).toBe(true);
    expect(b.startsWith('tx_')).toBe(true);
    // counter + random make collisions astronomically unlikely in practice
    expect(a).not.toBe(b);
  });

  it('newId defaults its prefix to "n"', () => {
    expect(newId().startsWith('n_')).toBe(true);
  });

  it('demoId is deterministic for a seed (ADR 0010: identical prompts → identical models)', () => {
    expect(demoId('an analytics dashboard')).toBe(demoId('an analytics dashboard'));
  });

  it('demoId differs across seeds and salts', () => {
    expect(demoId('one')).not.toBe(demoId('two'));
    expect(demoId('same', 0)).not.toBe(demoId('same', 1));
  });

  it('hexToRgba expands shorthand and parses channels', () => {
    expect(hexToRgba('#ffffff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(hexToRgba('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(hexToRgba('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(hexToRgba('#000000', 0.5)).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('rgbaToCss renders 0..255 channels and rounds alpha', () => {
    expect(rgbaToCss({ r: 1, g: 0, b: 0, a: 1 })).toBe('rgba(255, 0, 0, 1)');
    expect(rgbaToCss({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('clamp01 bounds its input', () => {
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.37)).toBe(0.37);
  });
});
