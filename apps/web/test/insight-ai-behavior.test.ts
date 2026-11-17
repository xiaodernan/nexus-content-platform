import { describe, expect, it } from 'vitest';
import { buildInsightDigest, INSIGHT_AI_SYSTEM_PROMPT, type InsightDigestInput } from '../src/server/domain/insightAi';

/**
 * §INSIGHT-3 · digest 构造纯函数门:
 * - digest 是大模型唯一的数据源(+系统提示词);
 * - 任何个人字段出现在 digest 里都是泄漏 —— 这条是要门死的东西.
 */
const base: InsightDigestInput = {
  snapshot: {
    totals: { users: 2, guests: 9, projects: 4, published: 1, likes: 40, comments: 3, follows: 8, viewsAllTime: 200, gameCompletions: 6, workCompletions: 1, usageCalls30d: 30 },
    series30d: { days: ['d1'], signups: [1], publishes: [0], opens: [7] },
    credits30d: { granted: 100, consumed: 10 },
    ai30d: { realCalls: 3, demoCalls: 1, tokensIn: 4500, cachedTokens: 2000, costEstimateUsd: 0.02, avgLatencyMs: 900 },
    botOpens30d: 0,
    opens30d: 7,
    likes30d: 5,
    comments30d: 1,
    topWorks: [{ path: '/n/demo/x', projectName: 'X', handle: 'demo', views: 200 }],
    metrics: {} as never,
  },
  ratios: { publishRate: 0.25, guestShare: 0.818, interactionRate: 0.857, botShare: 0, creditBurn: 0.1 },
  opensSlope: 0.5,
  opensR2: 0.8,
  publishSlope: 0.1,
  publishR2: 0.7,
  locale: 'zh',
};

describe('§INSIGHT-3 buildInsightDigest', () => {
  it('包含全部派生比值与原始整数', () => {
    const out = buildInsightDigest(base);
    expect(out).toContain('users=2');
    expect(out).toContain('guests=9');
    expect(out).toContain('publishRate=25.0%');
    expect(out).toContain('guestShare=81.8%');
    expect(out).toContain('interactionRate=85.7%');
    expect(out).toContain('creditBurn=10.0%');
    expect(out).toContain('cachedTokens=2000');
    expect(out).toContain('END DIGEST');
  });

  it('没有个人字段进入 digest', () => {
    const out = buildInsightDigest(base);
    expect(out).not.toContain('127.0.0.1');
    expect(out).not.toContain('user_id');
    expect(out).not.toContain('email');
  });

  it('locale 以一行 directive 透过', () => {
    const zh = buildInsightDigest(base);
    expect(zh).toContain('locale: zh');
    const en = buildInsightDigest({ ...base, locale: 'en' });
    expect(en).toContain('locale: en');
  });

  it('系统提示词写死 aggregate-only 约束', () => {
    expect(INSIGHT_AI_SYSTEM_PROMPT).toContain('aggregate');
    expect(INSIGHT_AI_SYSTEM_PROMPT).toContain('Never invent numbers');
  });
});
