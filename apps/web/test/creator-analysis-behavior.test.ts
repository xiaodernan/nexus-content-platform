import { describe, expect, it } from 'vitest';
import type { AiChatRequest } from '@nexus/schemas';
import type { AiChatResult } from '@/server/ai/client';
import { runCreatorAnalysisGraph } from '@/server/ai/creatorGraph';

/**
 * §169-AI-GRAPH · 创作者数据大模型解读 StateGraph 契约门：
 *   draft → verify → (revise → verify) → finalize。
 * 脚本化 chat 注入：不联网、不打 provider、不烧钱。
 */
const DIGEST = 'CREATOR FACT DIGEST\nviews=4212 visitors=780\nEND OF FACT DIGEST';

const passZh = '① 事实：views=4212、访客780，约78%判为bot。② 为什么：这一片标题不够具体，cover高度不足，访客进来没理由留。③ 动作：先把标题改短到20字内并换一张更近景的cover，下一版看visitorsToday是否≥3。';
const weakZh = '大概就这样。';

type ChatFn = (request: AiChatRequest) => Promise<AiChatResult>;

const script = (replies: readonly AiChatResult[]): { chat: ChatFn; calls: AiChatRequest[] } => {
  const calls: AiChatRequest[] = [];
  let i = 0;
  return {
    calls,
    chat: async (req) => {
      calls.push(req);
      if (i >= replies.length) throw new Error('script exhausted');
      const r = replies[i]!;
      i += 1;
      return r;
    },
  };
};

const okReal = (text: string, cachedTokens = 2400): AiChatResult => ({
  ok: true,
  orchestration: 'stategraph',
  response: {
    requestId: 'graph-test',
    capability: 'real',
    provider: 'openai-compatible',
    model: 'gpt-6.1-terra',
    text,
    usage: {
      tokensIn: 3000,
      tokensOut: 80,
      cachedTokens,
      cacheReported: true,
      provider: 'openai-compatible',
      model: 'gpt-6.1-terra',
      modelClass: 'fast',
      latencyMs: 1200,
      demoMode: false,
      costBasis: 'unknown',
      toolCalls: 0,
      costUsd: 0,
      reasoningTokens: 0,
    },
  },
});
const down503: AiChatResult = {
  ok: false,
  orchestration: 'stategraph',
  status: 503,
  error: { code: 'provider-unavailable', message: 'nope', hint: '', retryable: true },
};

describe('§169-AI-GRAPH · runCreatorAnalysisGraph', () => {
  it('机检一次通过：nodesVisited=[draft,verify,finalize] · iterations=0 · verdict=pass · 缓存只记 digest 线', async () => {
    const { chat, calls } = script([okReal(passZh, 1800)]);
    const result = await runCreatorAnalysisGraph({ digest: DIGEST, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.iterations).toBe(0);
    expect(result.nodesVisited).toEqual(['draft', 'verify', 'finalize']);
    expect(result.usage.cachedTokens).toBe(1800);
    expect(calls).toHaveLength(1);
    expect((calls[0] as AiChatRequest).user).toContain('CREATOR FACT DIGEST');
    expect((calls[0] as AiChatRequest).user).toContain('Answer language: zh');
  });

  it('第一稿机检不过 → revise 改对 → 第二轮 verify 通过：iterations=1 · verdict=pass', async () => {
    const { chat, calls } = script([okReal(weakZh, 900), okReal(passZh, 1800)]);
    const result = await runCreatorAnalysisGraph({ digest: DIGEST, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.iterations).toBe(1);
    expect(result.nodesVisited).toEqual(['draft', 'verify', 'revise', 'verify', 'finalize']);
    expect(result.usage.cachedTokens).toBe(2700);
    expect(calls).toHaveLength(2);
    expect((calls[0] as AiChatRequest).system).toBe((calls[1] as AiChatRequest).system);
    expect((calls[1] as AiChatRequest).user).toContain('mechanical issues');
  });

  it('修订用尽仍不过：verdict=fail 但答复如实返回（不冒充已核验）', async () => {
    const { chat } = script([okReal(weakZh, 400), okReal('还是不太行……', 400)]);
    const result = await runCreatorAnalysisGraph({ digest: DIGEST, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('fail');
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it('provider 不可用 → ok:false · status 503（不伪造分析）', async () => {
    const { chat } = script([down503]);
    const result = await runCreatorAnalysisGraph({ digest: DIGEST, locale: 'en' }, chat);
    expect(result).toMatchObject({ ok: false, status: 503, error: 'provider-unavailable' });
  });

  it('capability 如实透传（不硬编码 real）', async () => {
    const { chat } = script([{ ...okReal(passZh, 1800) }]);
    const result = await runCreatorAnalysisGraph({ digest: DIGEST, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capability).toBe('real');
  });
});
