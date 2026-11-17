/**
 * §169-AI-GRAPH · 创作者数据大模型解读 · StateGraph 编排（与 canonGraph/insightGraph 同谱系）。
 *
 *   draft（LLM · system = AGENT_NARRATE_SYSTEM_PROMPT，字节级稳定，digest 进 user）
 *     → verify（确定性机检：长度 + 数字 + ①②③ + 「动作/action」段）
 *         ├─ 通过 → finalize
 *         └─ 有问题 → 未超修订上限 → revise（system 不变 · 共用同一 KV 前缀与缓存）→ verify
 *
 * 边界纪律：ai-service 不写业务库（本文件在 web 侧）；机检结论是 review/fail，不是「安全」的——
 * 模型答不出有据的三段式，就是没有有据的那一段（§159：真没有数据就说「没有」，不许补数）。
 */
import { StateGraph, START, END } from '@nexus/agent-runtime';
import { chatWithCharacter, type AiChatResult } from '@/server/ai/client';
import type { AiChatRequest } from '@nexus/schemas';
import { AGENT_NARRATE_SYSTEM_PROMPT } from '@/server/domain/analytics-agent-ai';
import { creatorAnalysisIssues } from '@/server/domain/analytics-verify';

export type CreatorChatFn = (request: AiChatRequest) => Promise<AiChatResult>;

export interface CreatorGraphState extends Record<string, unknown> {
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

export type CreatorGraphResult =
  | {
      ok: true;
      answer: string;
      /** pass = 机检通过；fail = 修订用尽仍不通过（答复如实返回并由调用方标注，不冒充「已核验」） */
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

export async function runCreatorAnalysisGraph(
  input: { digest: string; locale: 'zh' | 'en' },
  chat: CreatorChatFn = chatWithCharacter,
): Promise<CreatorGraphResult> {
  const digest = input.digest.trim();
  const locale = input.locale;
  if (!digest) return { ok: false, status: 400, error: 'validation-failed: digest must not be empty' };

  const state: CreatorGraphState = {
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
  const nextUsage = (s: CreatorGraphState, result: AiChatResult) => {
    const u = usageOf(result);
    return {
      tokensIn: s.tokensIn + u.tokensIn,
      tokensOut: s.tokensOut + u.tokensOut,
      cachedTokens: s.cachedTokens + u.cachedTokens,
      cacheReported: s.cacheReported && u.cacheReported,
    };
  };

  const graph = new StateGraph<CreatorGraphState>()
    .addNode('draft', async (s) => {
      const id = nextRequestId('creator-draft');
      const result = await chat({ requestId: id, system: AGENT_NARRATE_SYSTEM_PROMPT, user: digest, modelClass: 'fast' });
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
      const found = creatorAnalysisIssues(s.draft, locale);
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
      const id = nextRequestId('creator-revise');
      const user = [
        digest,
        '',
        `Your previous analysis had mechanical issues: ${s.issues.join(', ')}.`,
        'Rewrite the whole analysis as the three numbered parts the system prompt requires: what the data says, why, one action. Use ONLY numbers present in the digest, keeping units exactly as written.',
        'Previous analysis:',
        s.draft,
      ].join('\n');
      const result = await chat({ requestId: id, system: AGENT_NARRATE_SYSTEM_PROMPT, user, modelClass: 'fast' });
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

  let final: CreatorGraphState;
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
