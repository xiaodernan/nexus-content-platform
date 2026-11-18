import { describe, expect, it } from 'vitest';
import { verifyInsightAnalysis, UNVERIFIED_NOTE } from '../src/server/domain/insightVerify';

describe('§INSIGHT-4 verifyInsightAnalysis', () => {
  it('zh：含「现象」+「证据」+ 数字 → true', () => {
    expect(verifyInsightAnalysis('① 现象： opens 被爬虫占 87%。\n② 证据：botOpens=660 / opens=757。\n③ 动作：过滤。', 'zh')).toBe(true);
  });
  it('zh：缺数字 → false', () => {
    expect(verifyInsightAnalysis('① 现象：最近流量发生变化。\n② 证据：两边看起来都差。', 'zh')).toBe(false);
  });
  it('zh：缺「证据」一词 → false', () => {
    expect(verifyInsightAnalysis('① 现象： opens 被爬虫占 87%。\n② 动作：过滤。', 'zh')).toBe(false);
  });
  it('zh：缺「现象」一词 → false', () => {
    expect(verifyInsightAnalysis('证据：botOpens=660 / opens=757。动作：过滤。', 'zh')).toBe(false);
  });
  it('en：含 observation + evidence + digit → true', () => {
    expect(verifyInsightAnalysis('observation: bot traffic dominates. evidence: 660 of 757 opens are bots. action: filter.', 'en')).toBe(true);
  });
  it('en：缺 digit → false', () => {
    expect(verifyInsightAnalysis('observation: bot traffic dominates. evidence: bots dominate most opens.', 'en')).toBe(false);
  });
  it('non-string / 空串 / 过短 → false', () => {
    expect(verifyInsightAnalysis('', 'zh')).toBe(false);
    expect(verifyInsightAnalysis('短句', 'zh')).toBe(false);
    // @ts-expect-error runtime guard
    expect(verifyInsightAnalysis(undefined, 'zh')).toBe(false);
  });
  it('UNVERIFIED_NOTE 两语言齐', () => {
    expect(UNVERIFIED_NOTE.zh.length).toBeGreaterThan(0);
    expect(UNVERIFIED_NOTE.en.length).toBeGreaterThan(0);
  });
});
