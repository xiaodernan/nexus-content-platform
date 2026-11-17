/**
 * §GRAPH-2 · /insight ⑧「大模型解读」StateGraph 编排（与 canonGraph 同谱系，ADR-0270/0275）。
 *
 * 单次 chat 把「理解 30 天只读摘要 + 组织三段式答复 + 自检不编造」压在一个上下文里，
 * 失败时没有反馈环，也不知道卡在哪一段。这张图把流程显式画出来：
 *
 *   draft（LLM，system = INSIGHT_AI_SYSTEM_PROMPT 字节级稳定前缀，digest 进 user）
 *     → verify（确定性机检：现象/症候 + 证据 + 动作 + 至少一个数字）
 *         ├─ 通过 → finalize
 *         └─ 有问题 → 未超修订上限 → revise（LLM，system 不变 → 共用同一 KV 前缀与缓存）→ verify
 *
 * 两个 LLM 节点共用同一个 system（INSIGHT_AI_SYSTEM_PROMPT），digest 是 user 消息——
 * 因此整条管线打中的前缀缓存和 /insight ⑧ 同源（§CACHE-4 口径）。
 *
 * 边界纪律：ai-service 不写业务库（本文件在 web 侧）；机检结论是 review/fail，不是「安全」的——
 * 模型答不出有据的三段式，就是没有有据的那一段（§159：真没有数据就写「数据不足」，不许补数）。
 */
import { StateGraph, START, END } from '@nexus/agent-runtime';
import { chatWithCharacter, type AiChatResult } from '@/server/ai/client';
import type { AiChatRequest } from '@nexus/schemas';
import { INSIGHT_AI_SYSTEM_PROMPT } from '@/server/domain/insightAi';
import { insightAnalysisIssues } from '@/server/domain/insightVerify';

export type InsightChatFn = (request: AiChatRequest) => Promise<AiChatResult>;

export interface InsightGraphState extends Record<string, unknown> {
  digest: string;
  locale: 'zh' | 'en';
  draft: string;
  issues: string[];
  iterations: number;
  answer: string;
  verdict: 'pending' | 'revise' | 'pass' | 'fail';
  nodesVisited: string[];
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  cacheReported: boolean;
  provider: string;
  model: string;
  capability: string;
}

export type InsightGraphResult =
  | {
      ok: true;
      answer: string;
      /** pass = 机检通过；fail = 修订用尽仍未过（答复如实返回并由调用方标注，不冒充「已核验」） */
      verdict: 'pass' | 'fail';
      iterations: number;
      provider: string;
      model: string;
      capability: string;
      usage: { tokensIn: number; tokensOut: number; cachedTokens: number; cacheReported: boolean };
      nodesVisited: readonly string[];
    }
  | { ok: false; status: number | null; error: string };

const MAX_REVISES = 1;

let requestCounter = 0;
const nextRequestId = (prefix: string): string => {
  requestCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${requestCounter}`;
};

function usageOf(result: AiChatResult): { tokensIn: number; tokensOut: number; cachedTokens: number; cacheReported: boolean } {
  if (!result.ok) return { tokensIn: 0, tokensOut: 0, cachedTokens: 0, cacheReported: false };
  const u = result.response.usage;
  return { tokensIn: u.tokensIn, tokensOut: u.tokensOut, cachedTokens: u.cachedTokens, cacheReported: u.cacheReported };
}

export async function runInsightAnalysisGraph(
  input: { digest: string; locale: 'zh' | 'en' },
  chat: InsightChatFn = chatWithCharacter,
): Promise<InsightGraphResult> {
  const digest = input.digest.trim();
  const locale = input.locale;
  if (!digest) return { ok: false, status: 400, error: 'validation-failed: digest must not be empty' };

  const state: InsightGraphState = {
    digest,
    locale,
    draft: '',
    issues: [],
    iterations: 0,
    answer: '',
    verdict: 'pending',
    nodesVisited: [],
    tokensIn: 0,
    tokensOut: 0,
    cachedTokens: 0,
    cacheReported: true,
    provider: '',
    model: '',
    capability: '',
  };

  // 冻结 state：节点不原地改写，只返回累加后的新值（ADR-0270）。
  const nextUsage = (s: InsightGraphState, result: AiChatResult) => {
    const u = usageOf(result);
    return {
      tokensIn: s.tokensIn + u.tokensIn,
      tokensOut: s.tokensOut + u.tokensOut,
      cachedTokens: s.cachedTokens + u.cachedTokens,
      cacheReported: s.cacheReported && u.cacheReported,
    };
  };

  const graph = new StateGraph<InsightGraphState>()
    .addNode('draft', async (s) => {
      const id = nextRequestId('insight-draft');
      const result = await chat({ requestId: id, system: INSIGHT_AI_SYSTEM_PROMPT, user: digest, modelClass: 'fast' });
      const u = nextUsage(s, result);
      if (!result.ok) {
        return { draft: '', nodesVisited: [...s.nodesVisited, 'draft'], issues: ['provider-unavailable'], ...u };
      }
      return {
        draft: result.response.text.trim(),
        provider: result.response.provider,
        model: result.response.model,
        capability: result.response.capability,
        nodesVisited: [...s.nodesVisited, 'draft'],
        ...u,
      };
    })
    .addNode('verify', (s) => {
      // 机检每轮对「当前」draft 重算；provider-unavailable 标记例外，不带上一轮旧意见进来。
      const providerFlag = s.issues.includes('provider-unavailable');
      const found = insightAnalysisIssues(s.draft, locale);
      if (providerFlag) {
        return { issues: ['provider-unavailable', ...found], verdict: 'fail' as const, nodesVisited: [...s.nodesVisited, 'verify'] };
      }
      if (found.length === 0) {
        return { issues: [], verdict: 'pass' as const, nodesVisited: [...s.nodesVisited, 'verify'] };
      }
      const next = s.iterations + 1 <= MAX_REVISES ? ('revise' as const) : ('fail' as const);
      return { issues: found, verdict: next, nodesVisited: [...s.nodesVisited, 'verify'] };
    })
    .addNode('revise', async (s) => {
      const id = nextRequestId('insight-revise');
      const user = [
        digest,
        '',
        `Your previous analysis had mechanical issues: ${s.issues.join(', ')}.`,
        'Rewrite the whole analysis. Keep every number exactly as it appears in the digest (same units).',
        'Use the three numbered parts in the order given in the system prompt, and make sure this time every part is present.',
        'Previous analysis:',
        s.draft,
      ].join('\n');
      const result = await chat({ requestId: id, system: INSIGHT_AI_SYSTEM_PROMPT, user, modelClass: 'fast' });
      const u = nextUsage(s, result);
      if (!result.ok) {
        return { draft: s.draft, iterations: s.iterations + 1, nodesVisited: [...s.nodesVisited, 'revise'], ...u };
      }
      return {
        draft: result.response.text.trim(),
        iterations: s.iterations + 1,
        provider: result.response.provider,
        model: result.response.model,
        capability: result.response.capability,
        nodesVisited: [...s.nodesVisited, 'revise'],
        ...u,
      };
    })
    .addNode('finalize', (s) => ({ answer: s.draft, nodesVisited: [...s.nodesVisited, 'finalize'] }))
    .addEdge(START, 'draft')
    .addEdge('draft', 'verify')
    .addConditionalEdges('verify', (s) => (s.verdict === 'revise' ? 'revise' : 'finalize'))
    .addEdge('revise', 'verify')
    .addEdge('finalize', END)
    .compile({ recursionLimit: 12 });

  let final: InsightGraphState;
  try {
    final = await graph.invoke(state);
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }

  if (final.issues.includes('provider-unavailable')) {
    return { ok: false, status: 503, error: 'provider-unavailable' };
  }
  const verdict = final.verdict === 'pass' ? 'pass' : 'fail';
  return {
    ok: true,
    answer: final.answer.trim(),
    verdict,
    iterations: final.iterations,
    provider: final.provider,
    model: final.model,
    capability: final.capability,
    usage: {
      tokensIn: final.tokensIn,
      tokensOut: final.tokensOut,
      cachedTokens: final.cachedTokens,
      cacheReported: final.cacheReported,
    },
    nodesVisited: final.nodesVisited,
  };
}
