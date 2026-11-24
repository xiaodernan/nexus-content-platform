/**
 * §ADMIN-13 · 只读观察站「趋势预测」——最小二乘线性外推的确定性契约（非 AI）
 * 纪律：输入只认实库 daily[]；样本 < 4 不拟合；公式、残差口径、趋势死区全部讲明。
 */
import { describe, expect, it } from 'vitest';
import { buildObserverProjection } from '@/server/admin/observer';
import type { ObserverDailyPoint } from '@/server/admin/observer';

const daily = (ops: (number | null)[]): ObserverDailyPoint[] =>
  ops.map((opens, i) => ({ day: `2026-11-${String(10 + i).padStart(2, '0')}`, opens }));

describe('§OBSERVE-PROJ · buildObserverProjection', () => {
  it('完美线性数据：斜率 / 截项 / 下一点预测全部精确', () => {
    // y = 2x + 10，n=7（x 0..6，y 10..22）
    const p = buildObserverProjection(daily([10, 12, 14, 16, 18, 20, 22]));
    expect(p.valid).toBe(true);
    expect(p.slopePerDay).toBeCloseTo(2, 6);
    expect(p.intercept).toBeCloseTo(10, 6);
    expect(p.next1).toBeCloseTo(24, 6); // x = 7
    expect(p.next3).toBeCloseTo(26, 6); // (24+26+28)/3
    expect(p.next7).toBeCloseTo(30, 6); // mean of x=7..13 → 24..36 的平均 = 30
    expect(p.r2).toBeCloseTo(1, 6);
    expect(p.residualStdDev).toBeCloseTo(0, 6);
    expect(p.trend).toBe('up');
  });

  it('完全平线（非零）：有效预测，斜率 0，趋势 flat，R² 不造出来', () => {
    const p = buildObserverProjection(daily([5, 5, 5, 5, 5, 5, 5]));
    expect(p.valid).toBe(true);
    expect(p.slopePerDay).toBeCloseTo(0, 6);
    expect(p.next1).toBeCloseTo(5, 6);
    expect(p.r2).toBeNull();
    expect(p.residualStdDev).toBeCloseTo(0, 6);
    expect(p.trend).toBe('flat');
  });

  it('全零观测：没有趋势样本，拒绝伪造有效平线预测', () => {
    const p = buildObserverProjection(daily([0, 0, 0, 0, 0, 0, 0]));
    expect(p.valid).toBe(false);
    expect(p.next1).toBeNull();
    expect(p.trend).toBeNull();
    expect(p.reasonZh).toContain('全为 0');
    expect(p.reasonEn).toContain('zero effective opens');
  });

  it('空样本或全部未观测：明确拒绝，不把缺失当成零', () => {
    for (const input of [[], daily([null, null, null, null, null, null, null])]) {
      const p = buildObserverProjection(input);
      expect(p.valid).toBe(false);
      expect(p.slopePerDay).toBeNull();
      expect(p.reasonZh).toContain('没有有效观测日');
      expect(p.reasonEn).toContain('No observed days');
    }
  });

  it('缺失日不补零、不压缩日历：只用四个真实观测日拟合', () => {
    const p = buildObserverProjection(daily([1, null, 3, null, 5, null, 7]));
    expect(p.valid).toBe(true);
    expect(p.slopePerDay).toBeCloseTo(1, 6);
    expect(p.intercept).toBeCloseTo(1, 6);
    expect(p.next1).toBeCloseTo(8, 6);
    expect(p.next3).toBeCloseTo(9, 6);
    expect(p.next7).toBeCloseTo(11, 6);
  });

  it('末位缺失仍锚定最后观测日：不从七天窗口的末日硬补一天', () => {
    const p = buildObserverProjection(daily([1, null, 3, null, 5, 7, null]));
    expect(p.valid).toBe(true);
    expect(p.slopePerDay).toBeCloseTo(68 / 59, 6);
    expect(p.next1).toBeCloseTo(7.745763, 6);
    expect(p.next3).toBeCloseTo(8.898305, 6);
    expect(p.next7).toBeCloseTo(11.203390, 6);
    expect(p.next1).not.toBeCloseTo(p.slopePerDay! * 7 + p.intercept!, 6);
  });

  it('下降直线：斜率为负，趋势 down', () => {
    // y = 30 - 3x
    const p = buildObserverProjection(daily([30, 27, 24, 21, 18, 15, 12]));
    expect(p.valid).toBe(true);
    expect(p.slopePerDay).toBeCloseTo(-3, 6);
    expect(p.next1).toBeCloseTo(9, 6);
    expect(p.trend).toBe('down');
  });

  it('样本 < 4：不拟合，reasonZh/reasonEn 都如实给出，不画曲线', () => {
    const p = buildObserverProjection(daily([3, 1, 4]));
    expect(p.valid).toBe(false);
    expect(p.slopePerDay).toBeNull();
    expect(p.reasonZh).toContain('少于 4 天');
    expect(p.reasonEn).toContain('fewer than 4');
    expect(p.trend).toBeNull();
    const sparse = buildObserverProjection(daily([3, null, 1, null, 4, null, null]));
    expect(sparse.valid).toBe(false);
    expect(sparse.reasonZh).toContain('3 个观测日');
  });

  it('含噪声数据：R² 落在 (0,1)，残差 SD > 0，next1 与拟合线一致', () => {
    // 基底 y = x + 5，两点各 +2/-1.5 抖动
    const ys = [5, 6 + 2, 7, 8 - 1.5, 9, 10 + 1, 11, 12 - 0.5];
    const p = buildObserverProjection(daily(ys));
    expect(p.valid).toBe(true);
    expect(p.r2).not.toBeNull();
    expect(p.r2!).toBeGreaterThan(0);
    expect(p.r2!).toBeLessThan(1);
    expect(p.residualStdDev!).toBeGreaterThan(0);
    expect(p.next1).toBeCloseTo(p.slopePerDay! * 8 + p.intercept!, 6);
  });

  it('斜率死区 ±0.5：极缓微跌也算 flat，不喊"下降趋势"', () => {
    // 斜率 = 0.3（< 0.5）
    const p = buildObserverProjection(daily([10, 10, 10, 11, 11, 11, 12]));
    expect(p.valid).toBe(true);
    expect(Math.abs(p.slopePerDay!)).toBeLessThan(0.5);
    expect(p.trend).toBe('flat');
  });

  it('输出契约：valid=true 时所有数值字段非空且有限', () => {
    const p = buildObserverProjection(daily([4, 9, 2, 13, 7, 11, 6]));
    expect(p.valid).toBe(true);
    for (const v of [p.slopePerDay, p.intercept, p.next1, p.next3, p.next7, p.residualStdDev]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
