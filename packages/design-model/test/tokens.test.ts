import { describe, expect, it } from 'vitest';
import { colorToCss, flattenTokens, parseDimension, resolveToken, type TokenGroup } from '../src/index.js';

// `tokens.ts` helpers. `resolveToken` was touched by design-model.test.ts; `flattenTokens`,
// `parseDimension` and `colorToCss` had no direct unit coverage before this file.

const group: TokenGroup = {
  color: {
    brand: { $value: '#ff0044' },
    bg: { $value: '#002244' },
  },
  font: {
    size: {
      xl: { $value: '28px' },
      sm: { $value: '12px' },
    },
  },
};

describe('resolveToken', () => {
  it('walks a dotted path to the token value', () => {
    expect(resolveToken(group, 'color.brand')?.$value).toBe('#ff0044');
    expect(resolveToken(group, 'font.size.xl')?.$value).toBe('28px');
  });
  it('returns undefined for a missing path', () => {
    expect(resolveToken(group, 'color.missing')).toBeUndefined();
    expect(resolveToken(group, 'no.such.thing')).toBeUndefined();
  });
  it('returns undefined when the path lands on a group, not a value', () => {
    expect(resolveToken(group, 'color')).toBeUndefined();
    expect(resolveToken(group, 'font.size')).toBeUndefined();
  });
});

describe('flattenTokens', () => {
  it('flattens nested groups into dotted-path keys', () => {
    const flat = flattenTokens(group);
    expect(Object.keys(flat).sort()).toEqual(['color.bg', 'color.brand', 'font.size.sm', 'font.size.xl']);
    expect(flat['color.brand'].$value).toBe('#ff0044');
  });
  it('honors a prefix', () => {
    const flat = flattenTokens(group, 'theme');
    expect(flat['theme.color.brand'].$value).toBe('#ff0044');
  });
});

describe('parseDimension', () => {
  it('passes numbers through', () => {
    expect(parseDimension(10)).toBe(10);
    expect(parseDimension(10.5)).toBe(10.5);
    expect(parseDimension(-3)).toBe(-3);
  });
  it('strips px / rem / % units', () => {
    expect(parseDimension('28px')).toBe(28);
    expect(parseDimension('1.5rem')).toBe(1.5);
    expect(parseDimension('50%')).toBe(50);
    expect(parseDimension('12')).toBe(12);
  });
  it('trims surrounding whitespace', () => {
    expect(parseDimension('  10px  ')).toBe(10);
  });
  it('falls back on garbage, using the default or a custom fallback', () => {
    expect(parseDimension('abc')).toBe(0);
    expect(parseDimension('abc', 8)).toBe(8);
    expect(parseDimension(undefined, 4)).toBe(4);
  });
});

describe('colorToCss', () => {
  it('passes strings through', () => {
    expect(colorToCss('#ff0000')).toBe('#ff0000');
    expect(colorToCss('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
  });
  it('normalizes an RGBA object to css', () => {
    expect(colorToCss({ r: 1, g: 0, b: 0, a: 1 })).toBe('rgba(255, 0, 0, 1)');
    expect(colorToCss({ r: 0.5, g: 0.5, b: 0.5, a: 0.5 })).toBe('rgba(128, 128, 128, 0.5)');
  });
  it('defaults alpha to 1 when absent', () => {
    expect(colorToCss({ r: 1, g: 0, b: 0 })).toBe('rgba(255, 0, 0, 1)');
  });
  it('returns transparent for non-color input', () => {
    expect(colorToCss(null)).toBe('transparent');
    expect(colorToCss(123)).toBe('transparent');
  });
});
