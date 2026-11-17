/**
 * §APPROVAL-GRAPH-1 · 审批解释的 StateGraph 管线（analyze → draft → verify/revise → finalize）。
 *
 * 为什么不做【唯一真值那一路】：provider 容易从「描述」滑到「建议你批准/拒绝」。
 * 这里把描述边界变成可机械检查的条件边——像问典一样稳：
 *   analyze（短提示，不碰模型 — 由 digest 函数负责生成 state）
 *     → draft（LLM·system=AGENT_EXPLAIN_SYSTEM_PROMPT·digest=user）
 *     → verify（机械检查：空文本 / 含禁语"批准/拒绝/同意/不同意/approve/refuse/reject" / 缺少 kind 关键字 → 机检 fail）
 *     → （fail→revise 一次）→ verify → finalize
 *
 * 与 canonGraph 同源的纪律：verify 不通过会回真话，不 hiding「这段解读不合格」。
 * 但「approval 阶段的人话解读」与「approver 的决定」严格分离：verify 只管描述是否合格。
 */
import { StateGraph, START, END } from '@nexus/agent-runtime';
import {
  chatWithCharacter,
  type AiChatResult,
} from '@/server/ai/client';
import { AGENT_EXPLAIN_SYSTEM_PROMPT, buildApprovalDigest, type AgentExplainDigest } from './agent-explain';
import type { ApprovalTaskView } from './agent-tasks';
import type { AiChatRequest } from '@nexus/schemas';

export type ApprovalChatFn = (request: AiChatRequest) => Promise<AiChatResult>;

export interface ApprovalGraphState extends Record<string, unknown> {
  task: ApprovalTaskView;
  locale: 'zh' | 'en';
  digest: string;
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
}

export type ApprovalGraphResult =
  | {
      ok: true;
      answer: string;
      verdict: 'pass' | 'fail';
      iterations: number;
      provider: string;
      model: string;
      usage: { tokensIn: number; tokensOut: number; cachedTokens: number; cacheReported: boolean };
      nodesVisited: readonly string[];
    }
  | { ok: false; status: number | null; error: string };

const MAX_REVISES = 1;
const BANNED = /(approve|approved|approves|refuse|refused|refuses|reject|rejected|rejects|授权|批准|驳回|否决|同意|不同意)/i;

export function verifyApprovalAnswer(draft: string): string[] {
  const issues: string[] = [];
  const text = draft.trim();
  if (!text || text.length < 16) issues.push('empty-draft');
  if (BANNED.test(text)) issues.push('prescriptive-directive');
  return issues;
}

let requestCounter = 0;
const nextRequestId = (prefix: string): string => {
  requestCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${requestCounter}`;
};

const usageOf = (res: AiChatResult) => {
  if (!res.ok) return { tokensIn: 0, tokensOut: 0, cachedTokens: 0, cacheReported: false };
  const u = res.response.usage;
  return { tokensIn: u.tokensIn, tokensOut: u.tokensOut, cachedTokens: u.cachedTokens, cacheReported: u.cacheReported };
};

const nextUsage = (s: ApprovalGraphState, res: AiChatResult, digestBound: boolean) => {
  const u = usageOf(res);
  return {
    tokensIn: s.tokensIn + u.tokensIn,
    tokensOut: s.tokensOut + u.tokensOut,
    cachedTokens: digestBound ? s.cachedTokens + u.cachedTokens : s.cachedTokens,
    cacheReported: digestBound ? s.cacheReported && u.cacheReported : s.cacheReported,
  };
};

export async function runApprovalExplainGraph(
  input: { task: ApprovalTaskView; locale: 'zh' | 'en' },
  chat: ApprovalChatFn = chatWithCharacter,
): Promise<ApprovalGraphResult> {
  const { task, locale } = input;
  const digest: AgentExplainDigest = buildApprovalDigest(task, locale);
  const digestText = digest.user;

  const state: ApprovalGraphState = {
    task,
    locale,
    digest: digestText,
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
  };

  const graph = new StateGraph<ApprovalGraphState>()
    .addNode('draft', async (s) => {
      const id = nextRequestId('approve-draft');
      const user = `Locale: ${locale}\n${s.digest}`;
      const result = await chat({ requestId: id, system: AGENT_EXPLAIN_SYSTEM_PROMPT, user, modelClass: 'fast' });
      const u = nextUsage(s, result, true);
      if (!result.ok) {
        return { draft: '', issues: ['provider-unavailable'], nodesVisited: [...s.nodesVisited, 'draft'], ...u };
      }
      return {
        draft: result.response.text.trim(),
        provider: result.response.provider,
        model: result.response.model,
        nodesVisited: [...s.nodesVisited, 'draft'],
        ...u,
      };
    })
    .addNode('verify', (s) => {
      const providerFlag = s.issues.includes('provider-unavailable') || (s.draft === '' && s.issues.includes('provider-unavailable'));
      const found = verifyApprovalAnswer(s.draft);
      if (providerFlag) {
        return { issues: [...new Set([...s.issues, ...found])], verdict: 'fail' as const, nodesVisited: [...s.nodesVisited, 'verify'] };
      }
      if (found.length === 0) {
        return { issues: [], verdict: 'pass' as const, nodesVisited: [...s.nodesVisited, 'verify'] };
      }
      const next = s.iterations + 1 <= MAX_REVISES ? ('revise' as const) : ('fail' as const);
      return { issues: found, verdict: next, nodesVisited: [...s.nodesVisited, 'verify'] };
    })
    .addNode('revise', async (s) => {
      const id = nextRequestId('approve-revise');
      const user = [
        `Locale: ${locale}`,
        s.digest,
        '',
        `Previous explanation had these mechanical issues: ${s.issues.join(', ')}.`,
        'Rewrite the explanation. Keep it to at most two sentences. Describe only — never prescribe the human decision. Cite only facts in the digest above.',
        `Previous explanation:\n${s.draft}`,
      ].join('\n');
      const result = await chat({ requestId: id, system: AGENT_EXPLAIN_SYSTEM_PROMPT, user, modelClass: 'fast' });
      const u = nextUsage(s, result, true);
      if (!result.ok) {
        return { draft: s.draft, iterations: s.iterations + 1, nodesVisited: [...s.nodesVisited, 'revise'], ...u };
      }
      return {
        draft: result.response.text.trim(),
        iterations: s.iterations + 1,
        provider: result.response.provider,
        model: result.response.model,
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
    .compile({ recursionLimit: 6 });

  let final: ApprovalGraphState;
  try {
    final = await graph.invoke(state);
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }

  if (final.issues.includes('provider-unavailable')) {
    return { ok: false, status: 503, error: 'provider-unavailable' };
  }
  return {
    ok: true,
    answer: final.answer.trim(),
    verdict: final.verdict === 'pass' ? 'pass' : 'fail',
    iterations: final.iterations,
    provider: final.provider,
    model: final.model,
    usage: {
      tokensIn: final.tokensIn,
      tokensOut: final.tokensOut,
      cachedTokens: final.cachedTokens,
      cacheReported: final.cacheReported,
    },
    nodesVisited: final.nodesVisited,
  };
}
