import { describe, expect, it } from 'vitest';
import { formatRate, formatTokensCompact, hitRate, weightedHitRate } from '../src/lib/llmSavingsAdmin';

describe('hitRate（admin/savings 口径）', () => {
  it('cached/tin，且封顶 100%', () => {
    expect(hitRate(1000, 700)).toBeCloseTo(0.7, 6);
    expect(hitRate(1000, 1500)).toBe(1);
  });

  it('tin ≤ 0 → null（渲染 —，不写 0%）', () => {
    expect(hitRate(0, 500)).toBeNull();
    expect(hitRate(-100, 500)).toBeNull();
  });

  it('cached 负数/NaN 按 0 计（不抛）', () => {
    expect(hitRate(1000, -50)).toBe(0);
    expect(hitRate(1000, Number.NaN)).toBe(0);
  });
});

describe('weightedHitRate（全表加权）', () => {
  it('合计 cached / 合计 tin', () => {
    const rows = [
      { tokensIn: 1000, cachedTokens: 500 },
      { tokensIn: 3000, cachedTokens: 900 },
    ];
    expect(weightedHitRate(rows)).toBeCloseTo(1400 / 4000, 6);
  });

  it('空表/全零 tin → null', () => {
    expect(weightedHitRate([])).toBeNull();
    expect(weightedHitRate([{ tokensIn: 0, cachedTokens: 0 }])).toBeNull();
  });
});

describe('formatRate / formatTokensCompact', () => {
  it('rate → 整数百分比或 —', () => {
    expect(formatRate(0.738)).toBe('74%');
    expect(formatRate(null)).toBe('—');
  });

  it('tokens 紧凑展示', () => {
    expect(formatTokensCompact(0)).toBe('0');
    expect(formatTokensCompact(9_999)).toBe('9999');
    expect(formatTokensCompact(20_842)).toBe('2.1 万');
    expect(formatTokensCompact(150_000_000)).toBe('1.50 亿');
  });
});
