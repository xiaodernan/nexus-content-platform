import { describe, expect, it } from 'vitest';
import { leastSquares, projectHorizonSum, projectNext } from '@/lib/insight-math';

describe('insight-math 最小二乘与外推', () => {
  it('完美直线：y = 2x + 1 → slope 2, intercept 1, R² = 1', () => {
    const fit = leastSquares([1, 3, 5, 7, 9])!;
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  it('常数序列：斜率 0、R² 定义为 1（无残差方差）', () => {
    const fit = leastSquares([4, 4, 4, 4])!;
    expect(fit.slope).toBeCloseTo(0, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  it('下降序列：斜率为负，R² 高说明趋势可信', () => {
    const fit = leastSquares([20, 18, 16, 14, 12, 10])!;
    expect(fit.slope).toBeCloseTo(-2, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  it('样本不足 n<2 → null（不硬凑一条线）', () => {
    expect(leastSquares([])).toBeNull();
    expect(leastSquares([7])).toBeNull();
  });

  it('projectNext 推进 horizon 步，严格沿同一条线', () => {
    // y = 3x − 5，索引 0..3 覆盖原数据；预测 x=4 → 7，x=5 → 10
    expect(projectNext([-5, -2, 1, 4], 2)).toEqual([7, 10]);
  });

  it('projectNext 对空序列返回 null', () => {
    expect(projectNext([], 7)).toBeNull();
  });

  it('projectHorizonSum 是外推区间求和（同形算 6.9）', () => {
    // slope 0.9 / intercept −0.6 → 预测 3.0 与 3.9，和 6.9
    expect(projectHorizonSum([0, 0, 0, 3], 2)).toBeCloseTo(6.9, 5);
  });

  it('噪声序列 R² 低于完美序列（诚实性它自己说）', () => {
    const noise = leastSquares([4, 1, 9, 2, 8, 1, 10, 2])!;
    expect(noise.r2).toBeLessThan(0.5);
  });
});
