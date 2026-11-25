import { describe, expect, it } from 'vitest';
import { cnNumber, romanNumber } from '../src/lib/cnNumeral';

describe('cnNumeral · 典籍室编号', () => {
  it('个位/十位写法正确', () => {
    expect(cnNumber(0)).toBe('零');
    expect(cnNumber(9)).toBe('九');
    expect(cnNumber(10)).toBe('十');
    expect(cnNumber(41)).toBe('四十一');
  });

  it('整百与百位零头写法正确', () => {
    expect(cnNumber(100)).toBe('一百');
    expect(cnNumber(105)).toBe('一百零五');
    expect(cnNumber(119)).toBe('一百一十九');
    expect(cnNumber(200)).toBe('二百');
  });

  it('219 回响不再写出「一百undefined」（真浏览器抓到的回归）', () => {
    const s = cnNumber(219);
    expect(s).toBe('二百一十九');
    expect(s).not.toContain('undefined');
    expect(cnNumber(218)).toBe('二百一十八');
  });

  it('超出三位数照实写数字，不编中文位', () => {
    expect(cnNumber(1000)).toBe('1000');
    expect(cnNumber(-1)).toBe('-1');
  });

  it('罗马数字仍给英文模式用', () => {
    expect(romanNumber(219)).toBe('CCXIX');
    expect(romanNumber(1)).toBe('I');
  });
});
