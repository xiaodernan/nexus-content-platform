import { describe, expect, it } from 'vitest';
import {
  EXHAUST_CAP_DAYS,
  leastSquares,
  projectBurn,
  zeroFill,
  type DailyBurn,
} from '../src/lib/burn-projection';

const TODAY = Date.UTC(2026, 10, 14); // 2026-11-14 UTC

function isoOffset(daysBack: number): string {
  return new Date(TODAY - daysBack * 86_400_000).toISOString().slice(0, 10);
}

describe('zeroFill（UTC 日窗口补零）', () => {
  it('按窗口补零并保序：旧的在前', () => {
    const rows: DailyBurn[] = [
      { day: isoOffset(2), burned: 10 },
      { day: isoOffset(0), burned: 30 },
    ];
    const series = zeroFill(rows, 5, TODAY);
    expect(series).toEqual([0, 0, 10, 0, 30]);
  });

  it('窗口外的旧行被丢弃', () => {
    const rows: DailyBurn[] = [{ day: isoOffset(400), burned: 99 }];
    expect(zeroFill(rows, 7, TODAY)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('非法行被丢弃而不是 NaN：坏日期/负燃烧/非数字', () => {
    const rows: DailyBurn[] = [
      { day: 'not-a-day', burned: 5 },
      { day: isoOffset(1), burned: -7 },
      { day: isoOffset(2), burned: Number.NaN },
      { day: isoOffset(3), burned: 4 },
    ];
    expect(zeroFill(rows, 5, TODAY)).toEqual([0, 4, 0, 0, 0]);
  });

  it('跨月边界也对得齐（窗口、月、日混合）', () => {
    const rows: DailyBurn[] = [{ day: '2026-10-31', burned: 6 }];
    const series = zeroFill(rows, 15, TODAY);
    const idx = Math.round((Date.parse('2026-10-31T00:00:00.000Z') - (TODAY - 14 * 86_400_000)) / 86_400_000);
    expect(series[idx]).toBe(6);
    expect(series.reduce((a, b) => a + b, 0)).toBe(6);
  });
});

describe('leastSquares（正规方程闭式解）', () => {
  it('常数序列：斜率 0', () => {
    const fit = leastSquares([5, 5, 5, 5]);
    expect(fit?.slope).toBe(0);
  });

  it('严格递增：斜率 = 公差', () => {
    const fit = leastSquares([1, 3, 5, 7, 9]);
    expect(fit?.slope).toBeCloseTo(2, 6);
  });

  it('含零的陡降：斜率负且有限', () => {
    const fit = leastSquares([100, 80, 60, 40, 20, 0]);
    expect(fit?.slope).toBeLessThan(0);
    expect(Number.isFinite(fit?.intercept ?? Number.NaN)).toBe(true);
  });

  it('n < 2 → null', () => {
    expect(leastSquares([1])).toBeNull();
    expect(leastSquares([])).toBeNull();
  });
});

describe('projectBurn（verdict 与耗尽日）', () => {
  it('活跃燃烧天数 < 3 → insufficient-data', () => {
    const s = new Array<number>(30).fill(0);
    s[29] = 5;
    const p = projectBurn(100, s, TODAY);
    expect(p.verdict).toBe('insufficient-data');
    expect(p.daysUntilEmpty).toBeNull();
  });

  it('斜率 ≥ 0（没有下降趋势）→ no-burn', () => {
    const s = [1, 2, 3, 4, 5];
    const p = projectBurn(100, s, TODAY);
    expect(p.verdict).toBe('no-burn');
    expect(p.daysUntilEmpty).toBeNull();
  });

  it('线性下降：给出 daysUntilEmpty 与 ISO 耗尽日', () => {
    // 每天燃 2 点，余额 10 → 5 天
    const s = [20, 18, 16, 14, 12, 10, 8];
    const p = projectBurn(10, s, TODAY);
    expect(p.verdict).toBe('projecting');
    expect(p.daysUntilEmpty).toBeGreaterThan(0);
    expect(p.exhaustDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.slopePerDay).toBeLessThan(0);
  });

  it('斜率极小：封顶 EXHAUST_CAP_DAYS', () => {
    const s = new Array<number>(30).fill(0).map((_, i) => 1000 - i * 0.000001);
    const p = projectBurn(1000, s, TODAY);
    expect(p.verdict).toBe('projecting');
    expect(p.daysUntilEmpty).toBe(EXHAUST_CAP_DAYS);
  });

  it('余额 0 立刻耗尽（今天）', () => {
    const s = [50, 40, 30, 20, 10];
    const p = projectBurn(0, s, TODAY);
    expect(p.verdict).toBe('projecting');
    expect(p.daysUntilEmpty).toBe(0);
  });

  it('NaN 与负数输入被收敛，不会炸出 NaN 日期', () => {
    const p = projectBurn(Number.NaN, [5, Number.NaN, -3, 10, 8, 6, 4, 2], TODAY);
    expect(Number.isFinite(p.totalBurned)).toBe(true);
    expect(p.exhaustDate === null || /^\d{4}-\d{2}-\d{2}$/.test(p.exhaustDate)).toBe(true);
  });

  it('avgPerDay 与 totalBurned 口径一致', () => {
    const s = [2, 0, 4, 0, 6];
    const p = projectBurn(100, s, TODAY);
    expect(p.totalBurned).toBe(12);
    expect(p.avgPerDay).toBeCloseTo(12 / 5, 6);
  });
});
