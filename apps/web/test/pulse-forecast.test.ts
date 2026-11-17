import { describe, expect, it } from 'vitest';
import { leastSquares, projectNextSevenDays, buildPulseDigest, type PulseMetrics } from '../src/server/domain/pulse';

/**
 * §PULSE-0 · 最小二乘与公开 digest 的契约门（不连库、不烧 token）。
 */
const series = (counts: number[]) => counts.map((y, i) => ({ x: i, y }));

const metricsFixture = (): PulseMetrics => ({
  capturedAt: '2026-11-17T00:00:00.000Z',
  usersTotal: 42,
  guestsTotal: 17,
  claimedTotal: 25,
  registrationsByDay: [
    { day: '2026-11-04', count: 0 },
    { day: '2026-11-05', count: 1 },
    { day: '2026-11-06', count: 2 },
    { day: '2026-11-07', count: 1 },
    { day: '2026-11-08', count: 3 },
    { day: '2026-11-09', count: 0 },
    { day: '2026-11-10', count: 2 },
    { day: '2026-11-11', count: 4 },
    { day: '2026-11-12', count: 1 },
    { day: '2026-11-13', count: 2 },
    { day: '2026-11-14', count: 3 },
    { day: '2026-11-15', count: 2 },
    { day: '2026-11-16', count: 5 },
    { day: '2026-11-17', count: 4 },
  ],
  sessionsActive: 9,
  projectsPublic: 11,
  projectsUnlisted: 3,
  projectsPrivate: 28,
  tasks: [{ status: 'completed', capability: 'text', n: 63, avgMs: 2412 }],
  audit: [{ action: 'file.edit', allowed: true, n: 128 }],
  apiCalls: [{ endpoint: '/v1/ai/run', calls: 97 }],
  trend: { slopePerDay: 0.28, intercept: 0.7, r2: 0.55, projectedNext7d: 14, points: 14 },
});

describe('§PULSE-0 最小二乘', () => {
  it('完美直线：y = 2x + 1 → slope 2 · intercept 1 · r2 1', () => {
    const fit = leastSquares(series([1, 3, 5, 7, 9, 11]));
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
  });

  it('水平线：斜率 0（退化后 r2 = 0，不硬凑决定系数）', () => {
    const fit = leastSquares(series([3, 3, 3, 3]));
    expect(fit.slope).toBeCloseTo(0, 10);
    expect(fit.r2).toBe(0);
  });

  it('单点退化：不抛错，斜率 0', () => {
    const fit = leastSquares([{ x: 0, y: 7 }]);
    expect(fit.slope).toBe(0);
    expect(fit.intercept).toBe(7);
  });

  it('projectNextSevenDays：n<2 → 0，绝不虚报', () => {
    expect(projectNextSevenDays([5])).toBe(0);
    expect(projectNextSevenDays([])).toBe(0);
  });

  it('projectNextSevenDays：线性增长序列外推 > 0', () => {
    expect(projectNextSevenDays([0, 1, 2, 3, 4, 5, 6])).toBeGreaterThan(0);
  });
});

describe('§PULSE-0 buildPulseDigest（零个人字段）', () => {
  it('digest 含聚合数字与 14 天序列', () => {
    const digest = buildPulseDigest(metricsFixture());
    expect(digest).toContain('users_total: 42');
    expect(digest).toContain('users_claimed: 25');
    expect(digest).toContain('registrations_last_14d:');
    expect(digest).toContain('trend_r2:');
  });

  it('digest 绝不含 @（邮箱没有出场的口子）', () => {
    expect(buildPulseDigest(metricsFixture())).not.toContain('@');
  });
});
