/**
 * §PULSE-4 `buildWarnings` / `buildHotItems` · 观测大厅两条发现轨的纯函数行为
 *
 * 钉这条矩阵：
 * - churn-risk: visitorDays 新半窗口 ≤ 老半窗口的 80%（且老半窗口 ≥ 5 行）→ 提醒
 * - thin-traffic: 最近 7 天总打开 < 20 → 提醒；≥ 20 → 不提醒
 * - bot-pressure: opens ≥ 50 且机器人占比 > 30% → 提醒
 * - hot: 速度 = (curr-prev)/max(prev, 0)×100%，curr>0 且 prev=0 → 100%（全新热）；
 *        按 velocityPct 降序 → Top-3；prev 为负视同 0（不出现负无穷）
 */
import { describe, expect, it } from 'vitest';
import { buildHotItems, buildWarnings, type PulseNumbers, type PulseTrend, type VelocityRow } from '@/server/domain/pulse';

const baseNumbers: PulseNumbers = {
  users: 10,
  admins: 1,
  publishedVersions: 3,
  opens: 100,
  opensBot: 10,
  opensToday: 20,
  visitors: 5,
  visitorsToday: 1,
  visitorDays: 50,
  visibleMs: 0,
  gameClears: 0,
  workCompletions: 0,
  likes: 0,
  comments: 0,
  remixes: 0,
  follows: 0,
};

const mkTrend = (opensArr: number[], daysArr: number[]): PulseTrend => ({
  days: 14,
  points: opensArr.map((o, i) => ({
    day: `2026-11-${String(i + 1).padStart(2, '0')}`,
    opens: o,
    visitorDays: daysArr[i] ?? 0,
  })),
  opensDelta: null,
  visitorDaysDelta: null,
});

describe('buildWarnings', () => {
  it('流失风险：visitorDays 新半窗口 ≤ 老半窗口 80% → churn-risk 成立', () => {
    const trend = mkTrend(Array(14).fill(10), [10, 10, 10, 10, 10, 10, 10, 1, 1, 1, 1, 1, 1, 1]);
    const warnings = buildWarnings(baseNumbers, trend);
    expect(warnings.some((w) => w.kind === 'churn-risk')).toBe(true);
    expect(warnings.find((w) => w.kind === 'churn-risk')?.basis).toMatch(/visitorDaysHalfDelta=/);
  });

  it('薄流量：最近 7 天打开总数 < 20 → thin-traffic 成立', () => {
    const trend = mkTrend([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1], Array(14).fill(0));
    const warnings = buildWarnings(baseNumbers, trend);
    expect(warnings.some((w) => w.kind === 'thin-traffic')).toBe(true);
  });

  it('薄流量：≥ 20 → 不成立', () => {
    const trend = mkTrend(Array(14).fill(3), Array(14).fill(2));
    const warnings = buildWarnings(baseNumbers, trend);
    expect(warnings.some((w) => w.kind === 'thin-traffic')).toBe(false);
  });

  it('爬虫压力：opens ≥ 50 且机器人占比 > 30% → bot-pressure 成立', () => {
    const trend = mkTrend(Array(14).fill(10), Array(14).fill(2));
    const warnings = buildWarnings({ ...baseNumbers, opens: 100, opensBot: 40 }, trend);
    expect(warnings.some((w) => w.kind === 'bot-pressure')).toBe(true);
    expect(warnings.find((w) => w.kind === 'bot-pressure')?.basis).toMatch(/botShare=40%/);
  });

  it('爬虫占比 ≤ 30% → 不成立', () => {
    const trend = mkTrend(Array(14).fill(10), Array(14).fill(2));
    const warnings = buildWarnings({ ...baseNumbers, opens: 100, opensBot: 10 }, trend);
    expect(warnings.some((w) => w.kind === 'bot-pressure')).toBe(false);
  });
});

describe('buildHotItems', () => {
  it('无流量作品被过滤；速度 = (curr-prev)/prev×100，prev=0 且 curr>0 → 100', () => {
    const rows: VelocityRow[] = [
      { publicationId: 'a', projectName: 'A', path: 'a', opensCurr: 5, opensPrev: 0 },
      { publicationId: 'b', projectName: 'B', path: 'b', opensCurr: 6, opensPrev: 2 },
      { publicationId: 'c', projectName: 'C', path: 'c', opensCurr: 100, opensPrev: 10 },
    ];
    // 0/0 无流量项会被过滤（不再出现 0 分噪音）
    const cleaned = [...rows, { publicationId: 'z', projectName: 'Z', path: 'z', opensCurr: 0, opensPrev: 0 }];
    const hot = buildHotItems(cleaned);
    expect(hot.map((h) => h.publicationId)).toEqual(['c', 'b', 'a']);
    expect(hot.every((h) => h.publicationId !== 'z')).toBe(true);
    expect(hot[0]!.velocityPct).toBe(900);
    expect(hot[2]!.velocityPct).toBe(100);
  });

  it('按 velocityPct 降序 → Top-3', () => {
    const rows: VelocityRow[] = [
      { publicationId: 'a', projectName: 'A', path: 'a', opensCurr: 1, opensPrev: 1 },
      { publicationId: 'b', projectName: 'B', path: 'b', opensCurr: 5, opensPrev: 1 },
      { publicationId: 'c', projectName: 'C', path: 'c', opensCurr: 9, opensPrev: 3 },
      { publicationId: 'd', projectName: 'D', path: 'd', opensCurr: 12, opensPrev: 2 },
    ];
    const hot = buildHotItems(rows);
    expect(hot.map((h) => h.publicationId)).toEqual(['d', 'b', 'c']);
    expect(hot).toHaveLength(3);
  });
});
