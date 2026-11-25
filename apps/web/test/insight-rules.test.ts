import { describe, expect, it } from 'vitest';
import { evaluateInsightRules, type InsightMetrics } from '@/lib/insight-rules';

const base: InsightMetrics = {
  usersTotal: 100,
  guestsTotal: 10,
  projectsTotal: 50,
  publishedTotal: 30,
  opens30d: 6000,
  botOpens30d: 12,
  likes30d: 80,
  comments30d: 60,
  creditGranted30d: 5000,
  creditConsumed30d: 1500,
  realCalls30d: 180,
  demoCalls30d: 20,
  tokensIn30d: 100_000,
  tokensCached30d: 1_600_000, // 94% 命中，健康
  dailySignups: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  dailyPublishes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  dailyOpens: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

describe('evaluateInsightRules 规则引擎（阈值即产品决策）', () => {
  it('一个健康快照：不触发任何红/黄牌（全部阈值未越界）', () => {
    const actions = evaluateInsightRules(base);
    expect(actions.filter((a) => a.severity !== 'keep')).toEqual([]);
  });

  it('发布转化偏低（act 档）：触发 publish-conversion，证据里带数字', () => {
    const m = { ...base, publishedTotal: 3 }; // 3/50 = 6%
    const action = evaluateInsightRules(m).find((a) => a.id === 'publish-conversion');
    expect(action?.severity).toBe('act');
    expect(action?.evidence.zh).toContain('3');
    expect(action?.evidence.zh).toContain('50');
  });

  it('触达过低（act 档）：每作品不足 40 次打开', () => {
    const m = { ...base, opens30d: 60, botOpens30d: 0 }; // 60/30 = 2 opens/work
    const action = evaluateInsightRules(m).find((a) => a.id === 'open-reach');
    expect(action?.severity).toBe('act');
  });

  it('互动率低于 2% 触发 watch', () => {
    const m = { ...base, likes30d: 5, comments30d: 2, opens30d: 900 };
    const action = evaluateInsightRules(m).find((a) => a.id === 'interaction-rate');
    expect(action?.severity).toBe('watch');
  });

  it('游客占比超过 60% 触发 watch', () => {
    const m = { ...base, usersTotal: 30, guestsTotal: 80 }; // 80/110 = 72.7%
    const action = evaluateInsightRules(m).find((a) => a.id === 'guest-claim');
    expect(action?.severity).toBe('watch');
  });

  it('爬虫打开占比超过 10% 触发 watch', () => {
    const m = { ...base, botOpens30d: 200, opens30d: 900 };
    const action = evaluateInsightRules(m).find((a) => a.id === 'bot-opens');
    expect(action?.severity).toBe('watch');
  });

  it('额度消耗率超过 85% 触发 watch', () => {
    const m = { ...base, creditConsumed30d: 4500, creditGranted30d: 5000 }; // 90%
    const action = evaluateInsightRules(m).find((a) => a.id === 'credit-burn');
    expect(action?.severity).toBe('watch');
  });

  it('AI 调用几乎都是 DEMO 触发 watch', () => {
    const m = { ...base, realCalls30d: 6, demoCalls30d: 194 }; // 97% demo
    const action = evaluateInsightRules(m).find((a) => a.id === 'demo-heavy');
    expect(action?.severity).toBe('watch');
  });

  it('注册曲线连续下行且拟合良好（R²≥0.5）触发 signup-trend', () => {
    const m = { ...base, dailySignups: [20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 5, 4, 4] };
    const action = evaluateInsightRules(m).find((a) => a.id === 'signup-trend');
    expect(action?.severity).toBe('watch');
  });

  it('注册曲线横盘（斜率≈0）不触发 signup-trend', () => {
    expect(evaluateInsightRules(base).find((a) => a.id === 'signup-trend')).toBeUndefined();
  });

  it('缓存命中率低于 20% 触发 act：证据带命中/总数/未命中', () => {
    const m = { ...base, tokensCached30d: 100_000, tokensIn30d: 900_000 }; // 10%
    const action = evaluateInsightRules(m).find((a) => a.id === 'cache-hit');
    expect(action?.severity).toBe('act');
    expect(action?.evidence.zh).toContain('100000');
    expect(action?.evidence.zh).toContain('900000');
    expect(action?.action.zh).toContain('前缀');
  });

  it('命中率 20%–50% 之间只触发 watch，不误报 act', () => {
    const m = { ...base, tokensCached30d: 400_000, tokensIn30d: 600_000 }; // 40%
    expect(evaluateInsightRules(m).find((a) => a.id === 'cache-hit')?.severity).toBe('watch');
  });

  it('无调用（分母 0）时不给缓存建议——不画 0%、不编结论', () => {
    const m = { ...base, tokensCached30d: 0, tokensIn30d: 0 };
    expect(evaluateInsightRules(m).find((a) => a.id === 'cache-hit')).toBeUndefined();
  });

  it('每条建议都有 zh/en 两份文案和 evidence 里的数字', () => {
    const actions = evaluateInsightRules({ ...base, publishedTotal: 3, opens30d: 60 });
    for (const a of actions) {
      expect(a.title.zh.length).toBeGreaterThan(0);
      expect(a.title.en.length).toBeGreaterThan(0);
      expect(a.action.zh.length).toBeGreaterThan(0);
      expect(a.action.en.length).toBeGreaterThan(0);
      expect(/\d/.test(a.evidence.zh)).toBe(true);
      expect(/\d/.test(a.evidence.en)).toBe(true);
    }
  });
});
