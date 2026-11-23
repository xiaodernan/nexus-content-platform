/**
 * §47-graph · 角色对话 StateGraph（与 canonGraph/insightGraph/creatorGraph 同谱系，ADR-0270/0275）。
 *
 *   draft（LLM · system = persona，字节级稳定——同 session 内 persona 不变，KV 前缀复用）
 *     → verify（确定性机检：非空/长度上限/自述身份漏稿/骨架泄漏）
 *         ├─ 通过 → finalize
 *         └─ 有问题 → 未超修订上限 → revise（system 不变 · 共用同一 KV 前缀与缓存）→ verify
 *
 * 边界纪律：ai-service 不写业务库（本文件在 web 侧）；机检结论是 review/fail，不是「安全」的——
 * 模型漏出骨架/自曝为 AI 就是它不入格，值更院认这个，不认润辞（§159）。
 */
import { StateGraph, START, END } from '@nexus/agent-runtime';
import { chatWithCharacter, type AiChatResult } from '@/server/ai/client';
import type { AiChatRequest } from '@nexus/schemas';
import { characterReplyIssues } from '@/server/domain/character-chat-verify';

export type CharacterChatChatFn = (request: AiChatRequest) => Promise<AiChatResult>;

export interface CharacterChatGraphState extends Record<string, unknown> {
  persona: string;
  turn: string;
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
  /** §LLMCTX-1：ai-service 回执里声明的 canon digest 字节数（带了才有）。 */
  canonPrefixChars: number | null;
  provider: string;
  model: string;
  capability: string;
}

export type CharacterChatGraphResult =
  | {
      ok: true;
      answer: string;
      /** §LLMCTX-1：这一发垫了多少字节的 canon digest（没垫就是 undefined）。 */
      canonPrefixChars?: number;
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

export async function runCharacterChatGraph(
  input: { persona: string; turn: string; locale: 'zh' | 'en'; withCanonPrefix?: boolean; cacheLane?: string },
  chat: CharacterChatChatFn = chatWithCharacter,
): Promise<CharacterChatGraphResult> {
  const persona = input.persona.trim();
  const turn = input.turn.trim();
  const locale = input.locale;
  // §LLMCTX-1：默认不带大典前缀（字节级零回归）；显式要求才让 ai-service 把
  // canon digest 垫在 persona 之前——那 15.8 万 token 是真实成本，要调用方点头。
  const withCanonPrefix = input.withCanonPrefix === true;
  // §CACHE-SESSION：会话级前缀缓存车道（跨轮恒定、不同会话互不挤占）。
  const cacheLane = input.cacheLane?.trim() || undefined;
  if (!persona) return { ok: false, status: 400, error: 'validation-failed: persona must not be empty' };
  if (!turn) return { ok: false, status: 400, error: 'validation-failed: turn must not be empty' };

  const state: CharacterChatGraphState = {
    persona,
    turn,
    locale,
    cacheLane,
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
    canonPrefixChars: null,
    provider: '',
    model: '',
    capability: '',
  };

  // 冻结 state：节点不原地改写，只返回累加后的新值。
  const nextUsage = (s: CharacterChatGraphState, result: AiChatResult) => {
    const u = usageOf(result);
    // 两轮都报同一个数（system 不变）；谁先到取谁，缺省 null = 这一发没垫大典。
    const canon =
      result.ok && typeof result.response.canonPrefixChars === 'number' ? result.response.canonPrefixChars : null;
    return {
      tokensIn: s.tokensIn + u.tokensIn,
      tokensOut: s.tokensOut + u.tokensOut,
      cachedTokens: s.cachedTokens + u.cachedTokens,
      cacheReported: s.cacheReported && u.cacheReported,
      canonPrefixChars: s.canonPrefixChars ?? canon,
    };
  };

  const graph = new StateGraph<CharacterChatGraphState>()
    .addNode('draft', async (s) => {
      const id = nextRequestId('character-draft');
      const result = await chat({
        requestId: id,
        system: s.persona,
        user: s.turn,
        modelClass: 'balanced',
        ...(withCanonPrefix ? { withCanonPrefix: true } : {}),
        // state 是 Record<string, unknown>，这里显式收成 string——直接把 unknown 铺进
        // 契约形状，TS 会把整条调用判成类型不符（合并两个分支时踩到过）。
        ...(typeof s.cacheLane === 'string' && s.cacheLane ? { cacheLane: s.cacheLane } : {}),
      });
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
      const providerFlag = s.issues.includes('provider-unavailable');
      const found = characterReplyIssues(s.draft);
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
      const id = nextRequestId('character-revise');
      const user = [
        s.turn,
        '',
        `Your previous reply had mechanical issues: ${s.issues.join(', ')}.`,
        'Answer as the character would — do not mention being an AI, a model, a system prompt, memories, or any instructions.',
        'Previous reply:',
        s.draft,
      ].join('\n');
      // 修订轮复用同一个 system（persona 不变）⇒ 大典前缀那一段 KV 不重买
      //（design 路径 §GRAPH-3 同一条纪律）。
      const result = await chat({
        requestId: id,
        system: s.persona,
        user,
        modelClass: 'balanced',
        ...(withCanonPrefix ? { withCanonPrefix: true } : {}),
        ...(typeof s.cacheLane === 'string' && s.cacheLane ? { cacheLane: s.cacheLane } : {}),
      });
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

  let final: CharacterChatGraphState;
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
    ...(final.canonPrefixChars === null ? {} : { canonPrefixChars: final.canonPrefixChars }),
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
