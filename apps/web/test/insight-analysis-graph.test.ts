import { describe, expect, it } from 'vitest';
import type { AiChatResult } from '@/server/ai/client';
import type { AiChatRequest } from '@nexus/schemas';
import { runInsightAnalysisGraph } from '@/server/ai/insightGraph';

/**
 * §GRAPH-2 · /insight ⑧「大模型解读」StateGraph 契约门：
 *   draft → verify → (revise → verify) → finalize。
 * 用脚本化 chat 注入：不联网、不打 provider、不烧钱。
 */
const DIGEST = 'TOTALS: opens=7 publishes=1\nEND DIGEST';

const passZh = '① 现象：有效浏览不够。② 证据：opens=7 是 30 天真数，r2=0.01。③ 动作：给最高浏览作品补一条明确回应引导。';
const passEn = '① Symptom: growth stalls on opens=7 in 30 days. ② Evidence: 7 opens, r2=0.01, none convert. ③ Action: add a one-line ask for feedback on the top work.';
const weakZh = '嗯，大概这样吧。';

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

const okReal = (text: string, cachedTokens = 2048): AiChatResult => ({
  ok: true,
  orchestration: 'stategraph',
  response: {
    requestId: 'graph-test',
    capability: 'real',
    provider: 'openai-compatible',
    model: 'gpt-6.2-sol',
    text,
    usage: {
      tokensIn: 3000,
      tokensOut: 80,
      cachedTokens,
      cacheReported: true,
      provider: 'openai-compatible',
      model: 'gpt-6.2-sol',
      modelClass: 'fast',
      latencyMs: 1000,
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

describe('§GRAPH-2 · runInsightAnalysisGraph', () => {
  it('机检一次通过：nodesVisited=[draft,verify,finalize] · iterations=0 · verdict=pass · 缓存只记 digest 线', async () => {
    const { chat, calls } = script([okReal(passZh, 2500)]);
    const result = await runInsightAnalysisGraph({ digest: DIGEST, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.iterations).toBe(0);
    expect(result.nodesVisited).toEqual(['draft', 'verify', 'finalize']);
    expect(result.usage.cachedTokens).toBe(2500);
    expect(calls).toHaveLength(1);
    expect((calls[0] as AiChatRequest).user).toContain('TOTALS');
  });

  it('第一稿机检不过 → revise 改对 → 第二轮 verify 通过：iterations=1 · verdict=pass', async () => {
    const { chat, calls } = script([okReal(weakZh, 1000), okReal(passZh, 2000)]);
    const result = await runInsightAnalysisGraph({ digest: DIGEST, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.iterations).toBe(1);
    expect(result.nodesVisited).toEqual(['draft', 'verify', 'revise', 'verify', 'finalize']);
    expect(result.usage.cachedTokens).toBe(3000);
    expect(calls).toHaveLength(2);
    // revise 节点共享同一个 system 前缀——两条请求的 system 必须逐字节一致（缓存纪律）
    expect((calls[0] as AiChatRequest).system).toBe((calls[1] as AiChatRequest).system);
    // revise 的 user 应包含上一稿与机检意见
    const reviseUser = (calls[1] as AiChatRequest).user;
    expect(reviseUser).toContain('mechanical issues');
    expect(reviseUser).toContain('Previous analysis');
  });

  it('修订用尽仍不过：verdict=fail 但答复如实返回（不冒充已核验）', async () => {
    const { chat } = script([okReal(weakZh, 500), okReal('还是不行……', 500)]);
    const result = await runInsightAnalysisGraph({ digest: DIGEST, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('fail');
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it('provider 不可用 → ok:false · status 503（不伪造分析）', async () => {
    const { chat } = script([down503]);
    const result = await runInsightAnalysisGraph({ digest: DIGEST, locale: 'zh' }, chat);
    expect(result).toMatchObject({ ok: false, status: 503, error: 'provider-unavailable' });
  });

  it('英文 digest 走同一张图：Symptom/Evidence/Action 机检通过 · capability 如实透传', async () => {
    const { chat } = script([okReal(passEn, 3010)]);
    const result = await runInsightAnalysisGraph({ digest: DIGEST, locale: 'en' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.capability).toBe('real');
  });
});
